// scripts/deploy_Timelock.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying TimelockController...");

  // 📦 Get deployer address
  const [deployer] = await ethers.getSigners();
  console.log("📦 Deployer:", deployer.address);

  // Define Timelock parameters
  const minDelay = 300; // 5 minutes
  const proposers = [deployer.address]; // You can add more proposers
  const executors = [deployer.address]; // You can add more executors

  // Get contract factory for TimelockController
  const Timelock = await ethers.getContractFactory("TimelockController");

  // Deploy TimelockController
  const timelock = await Timelock.deploy(minDelay, proposers, executors, deployer.address);
  
  await timelock.deployed();
  console.log("✅ TimelockController deployed at:", timelock.address);

  // Save the Timelock address to the .env file for use in other contracts
  const fs = require("fs");
  const envFile = `.env`;
  const data = fs.readFileSync(envFile, { encoding: "utf-8" });
  const newData = data.replace(/OBN_TIMELOCK_ADDRESS=.*/g, `OBN_TIMELOCK_ADDRESS=${timelock.address}`);
  fs.writeFileSync(envFile, newData, { encoding: "utf-8" });

  console.log(`TimelockController address saved to .env as OBN_TIMELOCK_ADDRESS`);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
