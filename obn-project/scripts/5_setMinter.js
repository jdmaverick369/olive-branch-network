// scripts/setMinter.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Setting minter for OBNToken...");

  // 📦 Load contract addresses from .env
  const tokenAddress = process.env.OBN_TOKEN_ADDRESS; // Address of the OBNToken contract
  const stakingAddress = process.env.OBN_STAKING_ADDRESS; // Address of the staking contract

  // Check if the required addresses are set in .env
  if (!tokenAddress || !stakingAddress) {
    throw new Error("❌ Missing OBN_TOKEN_ADDRESS or OBN_STAKING_ADDRESS in .env");
  }

  // Get deployer address
  const [deployer] = await ethers.getSigners();
  console.log("📦 Deployer:", deployer.address);

  // Fetch the contract
  const token = await ethers.getContractAt("OBNToken", tokenAddress);

  // Check if the minter can be set
  const currentMinterStatus = await token.isMinter(stakingAddress);
  console.log(`Staking contract minter status: ${currentMinterStatus}`);

  if (!currentMinterStatus) {
    // Set the staking contract as a minter for inflationary minting
    const tx = await token.setMinter(stakingAddress, true);
    await tx.wait();
    console.log(`✔️ Staking contract set as minter: ${stakingAddress}`);
  } else {
    console.log("✔️ Staking contract is already a minter.");
  }
}

main().catch((error) => {
  console.error("❌ Error setting minter:", error);
  process.exitCode = 1;
});