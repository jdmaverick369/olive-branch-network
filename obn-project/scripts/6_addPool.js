// scripts/addPools.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Adding new staking pool...");

  // 📦 Load contract addresses from .env
  const stakingAddress = process.env.OBN_STAKING_ADDRESS;
  const charityWallet = process.env.PID_2; // Charity wallet address for the new pool

  // Validate env variables
  if (!stakingAddress || !charityWallet) {
    throw new Error("❌ Missing one or more required env variables: OBN_STAKING_ADDRESS, PID_0");
  }

  // Get deployer address
  const [deployer] = await ethers.getSigners();
  console.log("📦 Deployer:", deployer.address);

  // Get the contract interface for OBNStakingPools
  const stakingContract = await ethers.getContractAt("OBNStakingPools", stakingAddress);

  // Verify if the addPool function exists in the staking contract
  try {
    console.log(`📨 Adding pool for charity wallet: ${charityWallet}`);
    const tx = await stakingContract.addPool(charityWallet);

    // Wait for the transaction to be mined
    await tx.wait();
    console.log("✅ Pool added successfully!");
  } catch (error) {
    console.error("❌ Error adding pool:", error);
  }
}

main().catch((error) => {
  console.error("❌ Error adding pool:", error);
  process.exitCode = 1;
});
