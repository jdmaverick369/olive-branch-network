// scripts/governance/gen_safe_addPool.js
// Generates calldata and Safe Transaction Builder JSON for scheduling a new nonprofit pool
// through the Timelock. Batches addPool(charityWallet) + setApprovedNonprofit(charityWallet, true)
// atomically so a pool can never be added without ExtendOliveBranch approval.
//
// Required env vars (see .env.example):
//   OBN_STAKING_CONTRACT  — staking proxy address
//   TIMELOCK_ADDR         — Timelock address
//   EXTENDING_OB_ADDR     — ExtendOliveBranch address
//   OPERATOR_SAFE         — Safe address (for Safe JSON createdFromSafeAddress)
//
// Usage:
//   npx hardhat run scripts/governance/gen_safe_addPool.js --network base -- --pid 11 --charity 0x...
//   Add --auto to submit directly if the signer has PROPOSER_ROLE.
//
// Output:
//   Writes governance-operations/YYYY-MM-DD-addPool-pidN-schedule.json (import into Safe UI)
//   Logs env vars to export for the companion execute step.

"use strict";
const { ethers } = require("hardhat");
const crypto   = require("crypto");
const minimist = require("minimist");
const fs   = require("fs");
const path = require("path");
const addrs = require("./addresses");

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
  const STAKING       = addrs.STAKING_PROXY;
  const TIMELOCK      = addrs.TIMELOCK;
  const EXTENDING_OB  = addrs.EXTENDING_OB;
  const OPERATOR_SAFE = addrs.OPERATOR_SAFE;
  const delayArg      = addrs.TIMELOCK_DELAY;

  const pidRaw = argv.pid ?? process.env.TARGET_PID;
  if (pidRaw === undefined) throw new Error("❌ Provide --pid or set TARGET_PID in .env");
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid < 0) throw new Error("❌ PID must be a non-negative integer");

  const { getByPid } = require("./nonprofits");
  const np      = getByPid(pid);
  const charity = mustAddr(argv.charity || np.wallet, `wallet for PID ${pid}`);

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

  // ── Write Safe Transaction Builder JSON ────────────────────────────────────
  const timelockIface = new ethers.Interface([
    "function scheduleBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  ]);
  const scheduleCalldata = timelockIface.encodeFunctionData("scheduleBatch", [
    targets, values, datas, predecessor, salt, delayArg,
  ]);

  const safeJson = {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: `OBN addPool PID ${pid} — Timelock schedule`,
      description: `Timelock.scheduleBatch: addPool(${charity}) + setApprovedNonprofit(${charity}, true). opId: ${opId}`,
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: OPERATOR_SAFE,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions: [
      { to: TIMELOCK, value: "0", data: scheduleCalldata, contractMethod: null, contractInputsValues: null },
    ],
  };

  const dateStr  = new Date().toISOString().slice(0, 10);
  const outDir   = path.resolve(__dirname, "../../../governance-operations");
  const outFile  = path.join(outDir, `${dateStr}-addPool-pid${pid}-schedule.json`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(safeJson, null, 2));
  console.log(`\n📄 Safe JSON written: ${outFile}`);
  console.log("   Import into Safe Transaction Builder, sign with 2-of-3 owners, execute.");

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
