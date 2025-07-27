// scripts/grantRoles.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  // Read exactly what you have in your .env
  const timelockAddress = process.env.OBN_TIMELOCK_ADDRESS?.trim();
  const proposerAddress = process.env.OBN_PROPOSER_ADDRESS?.trim();
  const executorAddress = process.env.OBN_EXECUTOR_ADDRESS?.trim();

  // Debug log to verify what’s being read
  console.log("🔎 ENV READ:");
  console.log("  OBN_TIMELOCK_ADDRESS =", timelockAddress);
  console.log("  OBN_PROPOSER_ADDRESS =", proposerAddress);
  console.log("  OBN_EXECUTOR_ADDRESS =", executorAddress);

  // Validate
  if (!timelockAddress || !proposerAddress || !executorAddress) {
    throw new Error(
      "❌ Missing OBN_TIMELOCK_ADDRESS or OBN_PROPOSER_ADDRESS or OBN_EXECUTOR_ADDRESS in .env"
    );
  }

  console.log(`⏳ Connecting to Timelock at ${timelockAddress} ...`);
  const timelock = await ethers.getContractAt("TimelockController", timelockAddress);

  // Fetch roles
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

  // Grant proposer
  console.log(`✅ Granting PROPOSER_ROLE to ${proposerAddress} ...`);
  let tx = await timelock.grantRole(PROPOSER_ROLE, proposerAddress);
  await tx.wait();
  console.log(`🎉 Proposer role granted to ${proposerAddress}`);

  // Grant executor
  console.log(`✅ Granting EXECUTOR_ROLE to ${executorAddress} ...`);
  tx = await timelock.grantRole(EXECUTOR_ROLE, executorAddress);
  await tx.wait();
  console.log(`🎉 Executor role granted to ${executorAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
