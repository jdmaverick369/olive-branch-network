// scripts/governance/schedule_staking_upgrade.js
// Phase 6.2 — Encodes, verifies, and queues upgradeToAndCall through Timelock.
//
// Pre-checks: staking proxy is still v9.2, impl is v9.3, vault wiring is confirmed complete.
// Encodes MIGRATE_CALLDATA and OUTER_CALLDATA, double-decodes both for verification,
// prints keccak256 hashes, then queues the single Timelock operation.
//
// CRITICAL: Run rehearse_upgrade.js BEFORE this script.
// Compare the MIGRATE_CALLDATA_HASH and OUTER_CALLDATA_HASH printed here against
// the rehearse_upgrade.js output. If either hash differs — DO NOT SCHEDULE.
// A mismatch means the bytes being queued are not what was rehearsed.
//
// Required env vars:
//   V93_IMPL          — StakingPoolsV93 implementation (from deploy_01)
//   OFFERING_ADDR     — TheOffering contract (from deploy_03)
//   EXTENDING_OB_ADDR — ExtendOliveBranch contract (from deploy_02)
//   ANNUAL_GOV_PROXY  — AnnualGovernance proxy, used to verify vault wiring (from deploy_04)
//
// Run: npx hardhat run scripts/governance/schedule_staking_upgrade.js --network base [-- --auto]

"use strict";
require("dotenv").config();
const { ethers } = require("hardhat");
const crypto = require("crypto");
const minimist = require("minimist");

const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const TIMELOCK      = "0x86396526286769ace21982E798Df5eef2389f51c";
const OPERATOR_SAFE = "0x066e2FABb036deab7DC58bAde428F819AC3542DD";

const STAKING_ABI = ["function version() view returns (string)"];
const IMPL_ABI    = ["function version() view returns (string)"];
const VAULT_ABI   = ["function governance() view returns (address)"];

const TIMELOCK_ABI = [
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
  "function hashOperationBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function getMinDelay() view returns (uint256)",
];

const UPGRADE_IFACE = new ethers.Interface([
  "function upgradeToAndCall(address newImplementation, bytes memory data) external",
  "function migrateV93(address newTreasury, address newCharityFund, address newOperator) external",
]);

function requireAddr(name) {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error(`Missing or invalid env var: ${name}`);
  return v;
}
function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  const argv = minimist(process.argv.slice(2));

  console.log("=== Phase 6.2: Schedule staking upgrade (upgradeToAndCall) ===\n");
  console.log("Reminder: rehearse_upgrade.js must have been run and passed before this step.");
  console.log("Compare the hashes printed below against the rehearse_upgrade.js output.\n");

  const V93_IMPL          = requireAddr("V93_IMPL");
  const OFFERING_ADDR     = requireAddr("OFFERING_ADDR");
  const EXTENDING_OB_ADDR = requireAddr("EXTENDING_OB_ADDR");
  const ANNUAL_GOV_PROXY  = requireAddr("ANNUAL_GOV_PROXY");

  const [signer] = await ethers.getSigners();
  console.log(`Signer:            ${await signer.getAddress()}`);
  console.log(`Network:           ${hre.network.name}`);
  console.log(`STAKING_PROXY:     ${STAKING_PROXY}`);
  console.log(`TIMELOCK:          ${TIMELOCK}`);
  console.log(`V93_IMPL:          ${V93_IMPL}`);
  console.log(`OFFERING_ADDR:     ${OFFERING_ADDR}`);
  console.log(`EXTENDING_OB_ADDR: ${EXTENDING_OB_ADDR}`);
  console.log(`OPERATOR_SAFE:     ${OPERATOR_SAFE}`);
  console.log(`ANNUAL_GOV_PROXY:  ${ANNUAL_GOV_PROXY}\n`);

  const staking   = new ethers.Contract(STAKING_PROXY,     STAKING_ABI,  signer);
  const impl      = new ethers.Contract(V93_IMPL,          IMPL_ABI,     signer);
  const offering  = new ethers.Contract(OFFERING_ADDR,     VAULT_ABI,    signer);
  const extending = new ethers.Contract(EXTENDING_OB_ADDR, VAULT_ABI,    signer);
  const timelock  = new ethers.Contract(TIMELOCK,          TIMELOCK_ABI, signer);

  // Pre-checks
  console.log("Pre-flight checks...");

  const stakingVersion = await staking.version();
  console.log(`  STAKING_PROXY.version()        = "${stakingVersion}"`);
  if (stakingVersion !== "9.2") hardStop(`STAKING_PROXY.version() is "${stakingVersion}" — expected "9.2". Proxy already upgraded or wrong target.`);
  console.log("                                 PASS");

  const implVersion = await impl.version();
  console.log(`  V93_IMPL.version()             = "${implVersion}"`);
  if (implVersion !== "9.3") hardStop(`V93_IMPL.version() is "${implVersion}" — expected "9.3". Wrong implementation address.`);
  console.log("                                 PASS");

  const offeringGov = await offering.governance();
  console.log(`  TheOffering.governance()       = ${offeringGov}`);
  if (!addrEq(offeringGov, ANNUAL_GOV_PROXY)) hardStop(`TheOffering.governance() is ${offeringGov} — expected ANNUAL_GOV_PROXY. Complete and execute Phase 5 vault wiring first.`);
  console.log("                                 PASS (vault wired)");

  const extendingGov = await extending.governance();
  console.log(`  ExtendOliveBranch.governance() = ${extendingGov}`);
  if (!addrEq(extendingGov, ANNUAL_GOV_PROXY)) hardStop(`ExtendOliveBranch.governance() is ${extendingGov} — expected ANNUAL_GOV_PROXY. Complete and execute Phase 5 vault wiring first.`);
  console.log("                                 PASS (vault wired)\n");

  // Encode
  const MIGRATE_CALLDATA = UPGRADE_IFACE.encodeFunctionData("migrateV93", [
    OFFERING_ADDR,
    EXTENDING_OB_ADDR,
    OPERATOR_SAFE,
  ]);

  const OUTER_CALLDATA = UPGRADE_IFACE.encodeFunctionData("upgradeToAndCall", [
    V93_IMPL,
    MIGRATE_CALLDATA,
  ]);

  // Double-decode MIGRATE_CALLDATA
  console.log("=".repeat(60));
  console.log("DECODE VERIFICATION\n");

  const migrateDecoded = UPGRADE_IFACE.decodeFunctionData("migrateV93", MIGRATE_CALLDATA);
  console.log("MIGRATE_CALLDATA decoded:");
  console.log(`  function:          migrateV93`);
  console.log(`  arg[0] newTreasury    = ${migrateDecoded[0]}`);
  console.log(`  arg[1] newCharityFund = ${migrateDecoded[1]}`);
  console.log(`  arg[2] newOperator    = ${migrateDecoded[2]}`);

  if (!addrEq(migrateDecoded[0], OFFERING_ADDR))     hardStop(`MIGRATE_CALLDATA arg[0] decoded as ${migrateDecoded[0]} — expected OFFERING_ADDR.`);
  if (!addrEq(migrateDecoded[1], EXTENDING_OB_ADDR)) hardStop(`MIGRATE_CALLDATA arg[1] decoded as ${migrateDecoded[1]} — expected EXTENDING_OB_ADDR.`);
  if (!addrEq(migrateDecoded[2], OPERATOR_SAFE))     hardStop(`MIGRATE_CALLDATA arg[2] decoded as ${migrateDecoded[2]} — expected OPERATOR_SAFE.`);
  console.log("  All PASS\n");

  // Double-decode OUTER_CALLDATA
  const outerDecoded = UPGRADE_IFACE.decodeFunctionData("upgradeToAndCall", OUTER_CALLDATA);
  console.log("OUTER_CALLDATA decoded:");
  console.log(`  function:              upgradeToAndCall`);
  console.log(`  arg[0] newImpl         = ${outerDecoded[0]}`);
  console.log(`  arg[1] inner bytes     = ${outerDecoded[1]}`);

  if (!addrEq(outerDecoded[0], V93_IMPL)) hardStop(`OUTER_CALLDATA arg[0] decoded as ${outerDecoded[0]} — expected V93_IMPL.`);
  if (outerDecoded[1].toLowerCase() !== MIGRATE_CALLDATA.toLowerCase()) hardStop("OUTER_CALLDATA inner bytes do not match MIGRATE_CALLDATA.");

  const innerReDecoded = UPGRADE_IFACE.decodeFunctionData("migrateV93", outerDecoded[1]);
  console.log("  Inner bytes re-decoded as migrateV93:");
  console.log(`    arg[0] = ${innerReDecoded[0]}`);
  console.log(`    arg[1] = ${innerReDecoded[1]}`);
  console.log(`    arg[2] = ${innerReDecoded[2]}`);
  console.log("  All PASS\n");

  // Hashes
  const MIGRATE_CALLDATA_HASH = ethers.keccak256(MIGRATE_CALLDATA);
  const OUTER_CALLDATA_HASH   = ethers.keccak256(OUTER_CALLDATA);

  console.log("=".repeat(60));
  console.log("CALLDATA HASHES — compare against rehearse_upgrade.js output\n");
  console.log(`  MIGRATE_CALLDATA      = ${MIGRATE_CALLDATA}`);
  console.log(`  MIGRATE_CALLDATA_HASH = ${MIGRATE_CALLDATA_HASH}`);
  console.log(`  OUTER_CALLDATA        = ${OUTER_CALLDATA}`);
  console.log(`  OUTER_CALLDATA_HASH   = ${OUTER_CALLDATA_HASH}`);
  console.log("\n  *** If either hash does not match rehearse_upgrade.js output — DO NOT PROCEED ***\n");

  // Timelock batch
  const targets = [STAKING_PROXY];
  const values  = [0];
  const datas   = [OUTER_CALLDATA];

  const predecessor = ethers.ZeroHash;
  const salt        = ethers.hexlify(crypto.randomBytes(32));
  const delayArg    = Number(process.env.TIMELOCK_DELAY ?? 86400);
  const minDelay    = await timelock.getMinDelay();

  if (delayArg < Number(minDelay)) hardStop(`TIMELOCK_DELAY (${delayArg}s) < Timelock minDelay (${minDelay}s). Increase TIMELOCK_DELAY.`);

  const opId = await timelock.hashOperationBatch(targets, values, datas, predecessor, salt);

  console.log("=".repeat(60));
  console.log("Timelock scheduleBatch payload:\n");
  console.log(`  target: ${STAKING_PROXY}`);
  console.log(`  value:  0`);
  console.log(`  data:   OUTER_CALLDATA (above)`);
  console.log(`  delay:  ${delayArg}s  (Timelock minDelay: ${minDelay}s)`);
  console.log(`  opId:   ${opId}\n`);

  console.log("Export for check_operation_status.js:");
  console.log(`  export TARGETS_CSV="${targets.join(",")}"`);
  console.log(`  export VALUES_CSV="${values.join(",")}"`);
  console.log(`  export DATAS_HEX_CSV="${datas.join(",")}"`);
  console.log(`  export PREDECESSOR="${predecessor}"`);
  console.log(`  export SALT="${salt}"`);
  console.log(`  export OP_ID="${opId}"`);

  console.log("\nAdd to Address Registry before submitting Package 3:");
  console.log(`  MIGRATE_CALLDATA_HASH = ${MIGRATE_CALLDATA_HASH}`);
  console.log(`  OUTER_CALLDATA_HASH   = ${OUTER_CALLDATA_HASH}`);

  try {
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const canPropose    = await timelock.hasRole(PROPOSER_ROLE, await signer.getAddress());
    if (argv.auto && canPropose) {
      console.log("\nScheduling via Timelock...");
      const tx = await timelock.scheduleBatch(targets, values, datas, predecessor, salt, delayArg);
      await tx.wait();
      console.log(`Scheduled. tx: ${tx.hash}`);
      console.log(`opId: ${opId}`);
    } else if (argv.auto) {
      console.log("\n⚠️  --auto provided but signer lacks PROPOSER_ROLE. Use your Safe to scheduleBatch.");
    } else {
      console.log("\nUse your Safe to call Timelock.scheduleBatch with the arrays above.");
    }
  } catch (e) {
    console.log(`\nSkipping auto-schedule: ${e?.message || e}`);
  }

  console.log("\nNext steps:");
  console.log("  1. Collect the CallScheduled event raw payload from the queue transaction.");
  console.log("  2. Submit Package 3 to ChatGPT before the 24h window closes.");
  console.log("  3. After PASS: execute via your Safe and immediately run verify_post_upgrade.js.");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
