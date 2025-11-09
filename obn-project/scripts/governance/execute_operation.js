// scripts/governance/execute_by_hash.js
// Executes the previously scheduled batch using the same arrays + salt.

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const TIMELOCK_ADDR = process.env.TIMELOCK_ADDR;
  if (!TIMELOCK_ADDR) throw new Error("❌ TIMELOCK_ADDR missing in .env");
  const timelock = await ethers.getContractAt("TimelockController", TIMELOCK_ADDR);

  const TARGETS_CSV = process.env.TARGETS_CSV;
  const VALUES_CSV = process.env.VALUES_CSV;
  const DATAS_HEX_CSV = process.env.DATAS_HEX_CSV;
  const PREDECESSOR = process.env.PREDECESSOR || ethers.ZeroHash;
  const SALT = process.env.SALT;

  if (!TARGETS_CSV || !VALUES_CSV || !DATAS_HEX_CSV || !SALT) {
    throw new Error("❌ Missing one of TARGETS_CSV / VALUES_CSV / DATAS_HEX_CSV / SALT envs.");
  }

  const targets = TARGETS_CSV.split(",");
  const values = VALUES_CSV.split(",").map((v) => BigInt(v));
  const datas = DATAS_HEX_CSV.split(",");

  const opHash = await timelock.hashOperationBatch(targets, values, datas, PREDECESSOR, SALT);
  const state = await timelock.getOperationState(opHash);
  console.log("Operation state (0=Unset,1=Waiting,2=Ready,3=Done,4=Cancelled):", Number(state));
  if (Number(state) !== 2) {
    console.log("ℹ️ Not READY yet. Wait for minDelay (or check your arrays/salt).");
  }

  console.log("Executing…");
  const tx = await timelock.executeBatch(targets, values, datas, PREDECESSOR, SALT);
  await tx.wait();
  console.log("✅ Executed. opHash:", opHash);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
