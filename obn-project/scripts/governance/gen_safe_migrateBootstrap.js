// scripts/governance/gen_safe_migrateBootstrap.js
// Generates Safe Transaction Builder JSON to schedule OR execute a
// migrateBootstrap(pid, oldNonprofit, newNonprofit) call through the Timelock.
//
// Use when a nonprofit needs to rotate or replace their charity wallet.
// migrateBootstrap is onlyOwner — owner is the Timelock — so it requires a full
// Timelock proposal (schedule → 24h delay → execute) signed by OPERATOR_SAFE.
//
// Usage:
//   # Step 1 — schedule (generates schedule JSON + prints env vars to copy):
//   node scripts/governance/gen_safe_migrateBootstrap.js \
//     --action schedule --pid 0 --old 0xOLD_WALLET --new 0xNEW_WALLET
//
//   # Step 2 — execute (run after 24h, using env vars printed in step 1):
//   SALT=0x... OP_ID=0x... \
//   node scripts/governance/gen_safe_migrateBootstrap.js \
//     --action execute --pid 0 --old 0xOLD_WALLET --new 0xNEW_WALLET
//
// Output:
//   governance-operations/YYYY-MM-DD-migrateBootstrap-pidN-schedule.json
//   governance-operations/YYYY-MM-DD-migrateBootstrap-pidN-execute.json

"use strict";
const { ethers } = require("ethers");
const crypto   = require("crypto");
const minimist = require("minimist");
const fs   = require("fs");
const path = require("path");
const addrs = require("./addresses");

const STAKING       = addrs.STAKING_PROXY;
const TIMELOCK      = addrs.TIMELOCK;
const OPERATOR_SAFE = addrs.OPERATOR_SAFE;
const CHAIN_ID      = addrs.CHAIN_ID;
const DELAY         = addrs.TIMELOCK_DELAY;

const POOL_ABI = [
  "function migrateBootstrap(uint256 pid, address oldNonprofit, address newNonprofit) external",
];
const TIMELOCK_ABI = [
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) external payable",
  "function hashOperationBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt) pure returns (bytes32)",
];

function mustAddr(a, name) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing → ${a}`);
  return a;
}

function writeJson(outFile, json) {
  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2));
}

function main() {
  const argv    = minimist(process.argv.slice(2));
  const action  = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const pid = argv.pid !== undefined ? Number(argv.pid) : undefined;
  if (pid === undefined || !Number.isInteger(pid) || pid < 0)
    throw new Error("❌ --pid must be a non-negative integer");

  const { getByPid } = require("./nonprofits");
  const np = getByPid(pid);
  const oldNonprofit = mustAddr(argv.old || np.wallet, `current wallet for PID ${pid}`);
  const newNonprofit = mustAddr(argv.new, "--new");
  if (oldNonprofit.toLowerCase() === newNonprofit.toLowerCase())
    throw new Error("❌ --old and --new must be different addresses");

  const poolIface     = new ethers.Interface(POOL_ABI);
  const timelockIface = new ethers.Interface(TIMELOCK_ABI);

  const innerData  = poolIface.encodeFunctionData("migrateBootstrap", [pid, oldNonprofit, newNonprofit]);
  const targets    = [STAKING];
  const values     = [BigInt(0)];
  const datas      = [innerData];
  const predecessor = ethers.ZeroHash;

  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir  = path.resolve(__dirname, "../../../governance-operations");

  if (action === "schedule") {
    const salt = "0x" + crypto.randomBytes(32).toString("hex");
    const opId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [targets, values, datas, predecessor, salt]
      )
    );

    const scheduleCalldata = timelockIface.encodeFunctionData("scheduleBatch", [
      targets, values, datas, predecessor, salt, DELAY,
    ]);

    const safeJson = {
      version: "1.0",
      chainId: CHAIN_ID,
      createdAt: Date.now(),
      meta: {
        name: `OBN migrateBootstrap PID ${pid} — Timelock schedule`,
        description: `migrateBootstrap(${pid}, ${oldNonprofit}, ${newNonprofit}). opId: ${opId}`,
        txBuilderVersion: "1.16.5",
        createdFromSafeAddress: OPERATOR_SAFE,
        createdFromOwnerAddress: "",
        checksum: "",
      },
      transactions: [
        { to: TIMELOCK, value: "0", data: scheduleCalldata, contractMethod: null, contractInputsValues: null },
      ],
    };

    const outFile = path.join(outDir, `${dateStr}-migrateBootstrap-pid${pid}-schedule.json`);
    writeJson(outFile, safeJson);

    console.log(`\n✅ Schedule Safe JSON: ${outFile}`);
    console.log(`   Import into Safe Transaction Builder, sign with 2-of-3 owners, execute.`);
    console.log(`\n📋 Copy these for the execute step (keep them — needed in 24h):`);
    console.log(`\n   export SALT="${salt}"`);
    console.log(`   export OP_ID="${opId}"`);
    console.log(`\n   opId: ${opId}`);
    console.log(`   Unlocks in: 24 hours after the schedule tx is mined`);
    console.log(`\n   Monitor: OP_ID=${opId} node scripts/governance/timelock_countdown.js`);

  } else {
    // execute
    const salt = process.env.SALT;
    const opId = process.env.OP_ID;
    if (!salt || !/^0x[a-fA-F0-9]{64}$/.test(salt))
      throw new Error("❌ SALT env var missing or invalid (must be 0x + 64 hex chars from schedule step)");
    if (!opId || !/^0x[a-fA-F0-9]{64}$/.test(opId))
      throw new Error("❌ OP_ID env var missing or invalid (from schedule step)");

    // Verify opId matches the parameters
    const computedOpId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [targets, values, datas, predecessor, salt]
      )
    );
    if (computedOpId.toLowerCase() !== opId.toLowerCase()) {
      throw new Error(
        `❌ opId mismatch — parameters don't match the schedule step.\n` +
        `   Computed: ${computedOpId}\n` +
        `   Expected: ${opId}\n` +
        `   Double-check --pid, --old, --new, and SALT.`
      );
    }
    console.log(`✅ opId verified: ${opId}`);

    const executeCalldata = timelockIface.encodeFunctionData("executeBatch", [
      targets, values, datas, predecessor, salt,
    ]);

    const safeJson = {
      version: "1.0",
      chainId: CHAIN_ID,
      createdAt: Date.now(),
      meta: {
        name: `OBN migrateBootstrap PID ${pid} — Timelock execute`,
        description: `executeBatch: migrateBootstrap(${pid}, ${oldNonprofit}, ${newNonprofit}). opId: ${opId}`,
        txBuilderVersion: "1.16.5",
        createdFromSafeAddress: OPERATOR_SAFE,
        createdFromOwnerAddress: "",
        checksum: "",
      },
      transactions: [
        { to: TIMELOCK, value: "0", data: executeCalldata, contractMethod: null, contractInputsValues: null },
      ],
    };

    const outFile = path.join(outDir, `${dateStr}-migrateBootstrap-pid${pid}-execute.json`);
    writeJson(outFile, safeJson);

    console.log(`\n✅ Execute Safe JSON: ${outFile}`);
    console.log(`   Import into Safe Transaction Builder, sign with 2-of-3 owners, execute.`);
    console.log(`\n   Verify after execution:`);
    console.log(`   - getPoolInfo(${pid}).charityWallet == ${newNonprofit}`);
    console.log(`   - userAmount(${pid}, ${newNonprofit}) > 0`);
    console.log(`   - userAmount(${pid}, ${oldNonprofit}) == 0`);
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
