// scripts/governance/6_addPool_schedule.js
// Schedules addPool(charityWallet) + setApprovedNonprofit(charityWallet, true) atomically
// through the Timelock in a single scheduleBatch call.
//
// Both calls are batched so they either both succeed or both fail — a pool can never be
// added without its charity wallet simultaneously being approved in ExtendOliveBranch.
//
// Required env vars:
//   OBN_STAKING_CONTRACT  — staking proxy address
//   TIMELOCK_ADDR         — Timelock address
//   EXTENDING_OB_ADDR     — ExtendOliveBranch address
//
// Usage:
//   npx hardhat run scripts/governance/schedule_addPool.js --network base -- --pid 11 --charity 0x...
//   Add --auto to submit directly if the signer has PROPOSER_ROLE.

require("dotenv").config();
const { ethers } = require("hardhat");
const crypto = require("crypto");
const minimist = require("minimist");

const POOL_ABI = [
  "function addPool(address charityWallet) external",
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
];

const EXTEND_ABI = [
  "function setApprovedNonprofit(address nonprofit, bool approved) external",
  "function approvedNonprofit(address) view returns (bool)",
];

const TIMELOCK_ABI = [
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function scheduleBatch(address[] targets,uint256[] values,bytes[] data,bytes32 predecessor,bytes32 salt,uint256 delay)",
  "function hashOperationBatch(address[] targets,uint256[] values,bytes[] data,bytes32 predecessor,bytes32 salt) view returns (bytes32)",
];

function mustAddr(a, name = "address") {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing -> ${a}`);
  return a;
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const STAKING      = mustAddr(process.env.OBN_STAKING_CONTRACT, "OBN_STAKING_CONTRACT");
  const TIMELOCK     = mustAddr(process.env.TIMELOCK_ADDR,        "TIMELOCK_ADDR");
  const EXTENDING_OB = mustAddr(process.env.EXTENDING_OB_ADDR,   "EXTENDING_OB_ADDR");

  const pidRaw = argv.pid ?? process.env.TARGET_PID;
  if (pidRaw === undefined) throw new Error("❌ Provide --pid or set TARGET_PID in .env");
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid < 0) throw new Error("❌ PID must be a non-negative integer");

  const charity = mustAddr(argv.charity ?? process.env[`PID_${pid}`], `PID_${pid} / --charity`);

  const [signer] = await ethers.getSigners();
  const pool     = new ethers.Contract(STAKING,      POOL_ABI,    signer);
  const extend   = new ethers.Contract(EXTENDING_OB, EXTEND_ABI,  signer);
  const timelock = new ethers.Contract(TIMELOCK,     TIMELOCK_ABI, signer);

  // If pool already present for this PID and matches, nothing to do.
  const len = Number(await pool.poolLength());
  if (pid < len) {
    const info = await pool.getPoolInfo(pid);
    const current = info.charityWallet ?? info[0];
    if (current.toLowerCase() === charity.toLowerCase()) {
      console.log(`✅ Pool already set at PID ${pid} for this charity. Nothing to schedule.`);
      return;
    }
  }

  // Warn if charity is already approved — still schedule, just informational.
  const alreadyApproved = await extend.approvedNonprofit(charity);
  if (alreadyApproved) {
    console.log(`ℹ️  ${charity} is already approved in ExtendOliveBranch. setApprovedNonprofit will be a no-op but is included for atomicity.`);
  }

  const poolIface   = new ethers.Interface(POOL_ABI);
  const extendIface = new ethers.Interface(EXTEND_ABI);

  const targets = [STAKING,      EXTENDING_OB];
  const values  = [0,            0];
  const datas   = [
    poolIface.encodeFunctionData("addPool",              [charity]),
    extendIface.encodeFunctionData("setApprovedNonprofit", [charity, true]),
  ];

  const predecessor = ethers.ZeroHash;
  const salt        = ethers.hexlify(crypto.randomBytes(32));
  const delayArg    = Number(process.env.TIMELOCK_DELAY ?? 86400);

  const opId = await timelock.hashOperationBatch(targets, values, datas, predecessor, salt);

  console.log("\n🧰 Prepared Timelock scheduleBatch payload (addPool + setApprovedNonprofit):");
  console.log({
    targets,
    values,
    datas,
    predecessor,
    salt,
    delayArg,
    opId,
  });

  console.log("\n🔖 Export these for the execute step:");
  console.log(`export TARGETS_CSV="${targets.join(",")}"`);
  console.log(`export VALUES_CSV="${values.join(",")}"`);
  console.log(`export DATAS_HEX_CSV="${datas.join(",")}"`);
  console.log(`export PREDECESSOR="${predecessor}"`);
  console.log(`export SALT="${salt}"`);
  console.log(`export OP_ID="${opId}"`);

  // Optional: auto-schedule if signer has PROPOSER_ROLE and you pass --auto
  try {
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const canPropose    = await timelock.hasRole(PROPOSER_ROLE, await signer.getAddress());
    if (argv.auto && canPropose) {
      console.log("\n🟢 --auto provided and signer has PROPOSER_ROLE. Scheduling now…");
      const tx = await timelock.scheduleBatch(targets, values, datas, predecessor, salt, delayArg);
      await tx.wait();
      console.log(`⏳ Scheduled. opId=${opId}`);
    } else if (argv.auto) {
      console.log("\n⚠️ --auto provided but signer does NOT have PROPOSER_ROLE. Use your Safe to schedule.");
    } else {
      console.log("\nℹ️ Not auto-scheduling (no --auto). Use your Safe to call Timelock.scheduleBatch with these arrays.");
    }
  } catch (e) {
    console.log("\nℹ️ Skipping auto-schedule check (role read failed or not desired).", e?.message || "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
