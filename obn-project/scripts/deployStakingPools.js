// scripts/deployStakingPools.js
const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying StakingPools with account:", deployer.address);

  // Load addresses from your .env
  const tokenAddress = process.env.OBN_TOKEN_PROXY;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!tokenAddress || !treasuryAddress) {
    throw new Error("❌ Missing OBN_TOKEN_PROXY or TREASURY_ADDRESS in .env");
  }

  // This is your initial supply reference for inflation math
  const initialSupply = ethers.parseUnits("1000000000", 18); // 1 billion with 18 decimals

  // Deploy
  const StakingPools = await ethers.getContractFactory("StakingPools");
  const stakingPools = await StakingPools.deploy(
    tokenAddress,
    treasuryAddress,
    deployer.address, // initialOwner
    initialSupply
  );

  await stakingPools.waitForDeployment();

  const stakingAddress = await stakingPools.getAddress();
  console.log("✅ StakingPools deployed at:", stakingAddress);

  console.log("\n👉 Update your .env with:");
  console.log(`STAKING_CONTRACT=${stakingAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});