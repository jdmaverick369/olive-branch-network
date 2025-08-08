// scripts/deployController.js
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("Deploying with account:", deployerAddr);
  console.log("Deployer balance (wei):", balance.toString());

  // Owner for controller (default to OBN_TREASURY_ADDRESS if OWNER_ADDRESS not set)
  const ownerAddress = process.env.OWNER_ADDRESS || process.env.OBN_TREASURY_ADDRESS;
  if (!ownerAddress) throw new Error("Set OWNER_ADDRESS or OBN_TREASURY_ADDRESS in .env");

  // Start timestamp for hard-coded schedule (use START_TIMESTAMP if provided, else 'now')
  const startTimestamp = parseInt(process.env.START_TIMESTAMP || `${Math.floor(Date.now() / 1000)}`, 10);
  if (!Number.isFinite(startTimestamp) || startTimestamp <= 0) throw new Error("Invalid START_TIMESTAMP");

  console.log("Owner address:", ownerAddress);
  console.log("Start timestamp:", startTimestamp);

  const Controller = await ethers.getContractFactory("EmissionsController");
  const controller = await Controller.deploy(ownerAddress, startTimestamp);
  await controller.waitForDeployment();

  const controllerAddr = await controller.getAddress();
  console.log("✅ EmissionsController deployed to:", controllerAddr);

  // Update .env with OBN_CONTROLLER_ADDRESS
  const envPath = path.resolve(__dirname, "../.env");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  if (env.includes("OBN_CONTROLLER_ADDRESS=")) {
    env = env.replace(/OBN_CONTROLLER_ADDRESS=.*/g, `OBN_CONTROLLER_ADDRESS=${controllerAddr}`);
  } else {
    if (env.length && !env.endsWith("\n")) env += "\n";
    env += `OBN_CONTROLLER_ADDRESS=${controllerAddr}\n`;
  }
  fs.writeFileSync(envPath, env);
  console.log("📄 Updated .env with OBN_CONTROLLER_ADDRESS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
