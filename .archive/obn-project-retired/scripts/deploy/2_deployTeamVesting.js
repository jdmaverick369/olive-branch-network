const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying TeamVesting contract...");

  const [deployer] = await ethers.getSigners();
  console.log("📦 Deployer:", deployer.address);

  const tokenAddress = process.env.OBN_TOKEN_CONTRACT;
  const teamWallet = process.env.OBN_TEAM_VESTING_ADDRESS;
  const startTimestamp = Math.floor(Date.now() / 1000);
  const initialOwner = deployer.address;

  if (!tokenAddress || !teamWallet) {
    throw new Error("❌ Missing token or team wallet address in .env");
  }

  const TeamVesting = await ethers.getContractFactory("TeamVesting");
  const teamVesting = await TeamVesting.deploy(
    tokenAddress,
    teamWallet,
    startTimestamp,
    initialOwner
  );

  await teamVesting.waitForDeployment();

  console.log("✅ TeamVesting deployed at:", await teamVesting.getAddress());
  console.log("🎉 Deployment successful!");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});