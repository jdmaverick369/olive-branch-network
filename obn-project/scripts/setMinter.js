// scripts/setMinter.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Granting minter role (using setMinter)...");
  console.log("Deployer account:", deployer.address);

  const tokenAddress = process.env.OBN_TOKEN_PROXY;
  const stakingAddress = process.env.STAKING_CONTRACT;

  if (!tokenAddress || !stakingAddress) {
    throw new Error("❌ Missing OBN_TOKEN_PROXY or STAKING_CONTRACT in .env");
  }

  const token = await ethers.getContractAt("OBNToken", tokenAddress);

  console.log("OBN Token Proxy:", tokenAddress);
  console.log("StakingPools Contract:", stakingAddress);

  // Call setMinter with true
  const tx = await token.setMinter(stakingAddress, true);
  console.log("⏳ Waiting for transaction to confirm...");
  await tx.wait();

  console.log(`✅ Successfully granted minter permission to: ${stakingAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});