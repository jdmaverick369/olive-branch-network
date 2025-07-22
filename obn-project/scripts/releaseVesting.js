const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  // -------------------------
  // 🔧 Load config
  // -------------------------
  const vestingAddress = process.env.TEAM_VESTING_ADDRESS;
  if (!vestingAddress) {
    throw new Error("❌ TEAM_VESTING_ADDRESS not set in .env");
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Calling release() from: ${deployer.address}`);
  console.log(`TeamVesting contract: ${vestingAddress}`);

  // -------------------------
  // 📄 Connect to contract
  // -------------------------
  const TeamVesting = await ethers.getContractFactory("TeamVesting");
  const vesting = TeamVesting.attach(vestingAddress);

  // -------------------------
  // 🚀 Execute release
  // -------------------------
  console.log("⏳ Releasing vested tokens...");
  const tx = await vesting.release();
  await tx.wait();

  console.log("✅ Vested tokens released successfully!");
  console.log(`🔗 TX hash: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});