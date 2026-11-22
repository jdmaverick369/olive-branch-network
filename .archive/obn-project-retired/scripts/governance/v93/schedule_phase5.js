// scripts/governance/schedule_phase5.js
// Phase 5 — Single Timelock batch covering all Phase 5 operations:
//
//   [0]    TheOffering.setGovernance(ANNUAL_GOV_PROXY)
//   [1]    ExtendOliveBranch.setGovernance(ANNUAL_GOV_PROXY)
//   [2..N] ExtendOliveBranch.setApprovedNonprofit(charityWallet, true) — one per pool
//
// All calls are atomic: vault wiring and nonprofit approvals either all succeed or all fail.
// Combining them saves one Timelock delay vs running them as separate operations, and
// ensures it is structurally impossible to have governance wired without charities approved.
//
// Required env vars:
//   OFFERING_ADDR        — TheOffering contract (from deploy_03)
//   EXTENDING_OB_ADDR    — ExtendOliveBranch contract (from deploy_02)
//   ANNUAL_GOV_PROXY     — AnnualGovernance proxy (from deploy_04)
//   OBN_STAKING_CONTRACT — staking proxy address
//
// Run: npx hardhat run scripts/governance/schedule_phase5.js --network base [-- --auto]

"use strict";
require("dotenv").config();
const { ethers } = require("hardhat");
const crypto = require("crypto");
const minimist = require("minimist");

const TIMELOCK   = "0x86396526286769ace21982E798Df5eef2389f51c";
const OBN_TOKEN  = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
const ZERO       = "0x0000000000000000000000000000000000000000";

const VAULT_ABI = [
  "function setGovernance(address newGovernance) external",
  "function governance() view returns (address)",
  "function timelockOwner() view returns (address)",
];

const EXTEND_ABI = [
  "function setGovernance(address newGovernance) external",
  "function governance() view returns (address)",
  "function timelockOwner() view returns (address)",
  "function setApprovedNonprofit(address nonprofit, bool approved) external",
  "function approvedNonprofit(address) view returns (bool)",
];

const GOV_ABI = [
  "function owner() view returns (address)",
  "function obn()   view returns (address)",
];

const STAKING_ABI = [
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
];

const TIMELOCK_ABI = [
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
  "function hashOperationBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function getMinDelay() view returns (uint256)",
];

function requireAddr(name) {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error(`Missing or invalid env var: ${name}`);
  return v;
}
function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  const argv = minimist(process.argv.slice(2));

  console.log("=== Phase 5: Schedule vault wiring + nonprofit approvals ===\n");

  const OFFERING_ADDR     = requireAddr("OFFERING_ADDR");
  const EXTENDING_OB_ADDR = requireAddr("EXTENDING_OB_ADDR");
  const ANNUAL_GOV_PROXY  = requireAddr("ANNUAL_GOV_PROXY");
  const STAKING_PROXY     = requireAddr("OBN_STAKING_CONTRACT");

  const [signer] = await ethers.getSigners();
  console.log(`Signer:            ${await signer.getAddress()}`);
  console.log(`Network:           ${hre.network.name}`);
  console.log(`TIMELOCK:          ${TIMELOCK}`);
  console.log(`OFFERING_ADDR:     ${OFFERING_ADDR}`);
  console.log(`EXTENDING_OB_ADDR: ${EXTENDING_OB_ADDR}`);
  console.log(`ANNUAL_GOV_PROXY:  ${ANNUAL_GOV_PROXY}`);
  console.log(`STAKING_PROXY:     ${STAKING_PROXY}\n`);

  const offering  = new ethers.Contract(OFFERING_ADDR,     VAULT_ABI,    signer);
  const extending = new ethers.Contract(EXTENDING_OB_ADDR, EXTEND_ABI,   signer);
  const annualGov = new ethers.Contract(ANNUAL_GOV_PROXY,  GOV_ABI,      signer);
  const staking   = new ethers.Contract(STAKING_PROXY,     STAKING_ABI,  signer);
  const timelock  = new ethers.Contract(TIMELOCK,          TIMELOCK_ABI, signer);

  // ── Pre-flight checks ──────────────────────────────────────────────────────

  console.log("Pre-flight checks...");

  const offeringGov = await offering.governance();
  console.log(`  TheOffering.governance()          = ${offeringGov}`);
  if (!addrEq(offeringGov, ZERO)) hardStop(`TheOffering.governance() is already ${offeringGov}. Already wired? Investigate before scheduling.`);
  console.log("                                    PASS (not yet wired)");

  const extendingGov = await extending.governance();
  console.log(`  ExtendOliveBranch.governance()    = ${extendingGov}`);
  if (!addrEq(extendingGov, ZERO)) hardStop(`ExtendOliveBranch.governance() is already ${extendingGov}. Already wired? Investigate before scheduling.`);
  console.log("                                    PASS (not yet wired)");

  const offeringTl = await offering.timelockOwner();
  console.log(`  TheOffering.timelockOwner()       = ${offeringTl}`);
  if (!addrEq(offeringTl, TIMELOCK)) hardStop(`TheOffering.timelockOwner() is ${offeringTl} — expected ${TIMELOCK}. Wrong contract?`);
  console.log("                                    PASS");

  const extendingTl = await extending.timelockOwner();
  console.log(`  ExtendOliveBranch.timelockOwner() = ${extendingTl}`);
  if (!addrEq(extendingTl, TIMELOCK)) hardStop(`ExtendOliveBranch.timelockOwner() is ${extendingTl} — expected ${TIMELOCK}. Wrong contract?`);
  console.log("                                    PASS");

  const govOwner = await annualGov.owner();
  console.log(`  AnnualGovernance.owner()          = ${govOwner}`);
  if (!addrEq(govOwner, TIMELOCK)) hardStop(`AnnualGovernance.owner() is ${govOwner} — expected ${TIMELOCK}. Do not wire governance to a proxy not owned by Timelock.`);
  console.log("                                    PASS");

  const govObn = await annualGov.obn();
  console.log(`  AnnualGovernance.obn()            = ${govObn}`);
  if (!addrEq(govObn, OBN_TOKEN)) hardStop(`AnnualGovernance.obn() is ${govObn} — expected OBN_TOKEN ${OBN_TOKEN}. Wrong governance proxy or wrong OBN token wired.`);
  console.log("                                    PASS\n");

  // ── Collect nonprofit approvals ────────────────────────────────────────────

  const poolLength = Number(await staking.poolLength());
  console.log(`Reading ${poolLength} pool charity wallet(s)...`);

  const toApprove = [];
  for (let pid = 0; pid < poolLength; pid++) {
    const info    = await staking.getPoolInfo(pid);
    const charity = info.charityWallet ?? info[0];
    const already = await extending.approvedNonprofit(charity);

    if (addrEq(charity, ZERO)) {
      console.log(`  PID ${pid}: address(0) — WARNING: no charity wallet set, skipping`);
      continue;
    }
    if (already) {
      console.log(`  PID ${pid}: ${charity} — already approved, skipping`);
      continue;
    }
    console.log(`  PID ${pid}: ${charity} — will approve`);
    toApprove.push(charity);
  }
  console.log();

  // ── Build batch ────────────────────────────────────────────────────────────

  const vaultIface  = new ethers.Interface(VAULT_ABI);
  const extendIface = new ethers.Interface(EXTEND_ABI);

  const targets = [
    OFFERING_ADDR,
    EXTENDING_OB_ADDR,
    ...toApprove.map(() => EXTENDING_OB_ADDR),
  ];
  const values = targets.map(() => 0);
  const datas  = [
    vaultIface.encodeFunctionData("setGovernance",        [ANNUAL_GOV_PROXY]),
    vaultIface.encodeFunctionData("setGovernance",        [ANNUAL_GOV_PROXY]),
    ...toApprove.map(addr =>
      extendIface.encodeFunctionData("setApprovedNonprofit", [addr, true])
    ),
  ];

  const predecessor = ethers.ZeroHash;
  const salt        = ethers.hexlify(crypto.randomBytes(32));
  const delayArg    = Number(process.env.TIMELOCK_DELAY ?? 86400);
  const minDelay    = await timelock.getMinDelay();

  if (delayArg < Number(minDelay)) hardStop(`TIMELOCK_DELAY (${delayArg}s) < Timelock minDelay (${minDelay}s). Increase TIMELOCK_DELAY.`);

  const opId = await timelock.hashOperationBatch(targets, values, datas, predecessor, salt);

  // ── Print batch summary ────────────────────────────────────────────────────

  console.log(`Batch (${targets.length} call${targets.length !== 1 ? "s" : ""}):`);
  console.log(`  [0] TheOffering.setGovernance(${ANNUAL_GOV_PROXY})`);
  console.log(`  [1] ExtendOliveBranch.setGovernance(${ANNUAL_GOV_PROXY})`);
  toApprove.forEach((addr, i) =>
    console.log(`  [${i + 2}] ExtendOliveBranch.setApprovedNonprofit(${addr}, true)`)
  );
  if (toApprove.length === 0) {
    console.log("       (no approval calls — all charity wallets already approved)");
  }
  console.log(`\n  delay: ${delayArg}s  (Timelock minDelay: ${minDelay}s)`);
  console.log(`  opId:  ${opId}\n`);

  console.log("Export for check_operation_status.js:");
  console.log(`  export TARGETS_CSV="${targets.join(",")}"`);
  console.log(`  export VALUES_CSV="${values.join(",")}"`);
  console.log(`  export DATAS_HEX_CSV="${datas.join(",")}"`);
  console.log(`  export PREDECESSOR="${predecessor}"`);
  console.log(`  export SALT="${salt}"`);
  console.log(`  export OP_ID="${opId}"`);

  // ── Optional auto-schedule ─────────────────────────────────────────────────

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

  // ── Post-execution verification commands ──────────────────────────────────

  console.log("\nAfter execution, verify:");
  console.log(`  cast call ${OFFERING_ADDR}     "governance()(address)"  # expected: ${ANNUAL_GOV_PROXY}`);
  console.log(`  cast call ${EXTENDING_OB_ADDR} "governance()(address)"  # expected: ${ANNUAL_GOV_PROXY}`);
  toApprove.forEach(addr =>
    console.log(`  cast call ${EXTENDING_OB_ADDR} "approvedNonprofit(address)(bool)" ${addr}  # expected: true`)
  );
  console.log("\nDo NOT proceed to Phase 6 until all reads above return expected values.");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
