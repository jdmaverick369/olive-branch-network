// scripts/governance/3_execute_upgrade.js
// Executes the scheduled StakingPools upgrade after the timelock delay has passed

require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  // Read the upgrade JSON file from governance-operations/
  const path = require("path");
  const projectRoot = path.join(__dirname, "../..");
  const govOpsDir = path.join(projectRoot, "governance-operations");

  if (!fs.existsSync(govOpsDir)) {
    throw new Error("governance-operations/ folder not found");
  }

  const files = fs.readdirSync(govOpsDir).filter(f =>
    f.includes("upgrade") && f.endsWith(".json")
  );

  if (files.length === 0) {
    throw new Error("No upgrade JSON file found in governance-operations/");
  }

  const latestFile = files.sort().reverse()[0];
  const filePath = path.join(govOpsDir, latestFile);
  console.log(`Reading from: governance-operations/${latestFile}\n`);

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const TIMELOCK_ADDR = data.timelock;
  const OP_ID = data.opId;

  console.log("=== Execute StakingPools Upgrade ===");
  console.log("Timelock:", TIMELOCK_ADDR);
  console.log("Operation ID:", OP_ID);
  console.log();

  const [signer] = await ethers.getSigners();
  console.log("Executing with:", await signer.getAddress());
  console.log();

  const TIMELOCK_ABI = [
    "function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt)",
    "function getOperationState(bytes32 id) view returns (uint8)",
    "function isOperationReady(bytes32 id) view returns (bool)",
    "function getTimestamp(bytes32 id) view returns (uint256)"
  ];

  const timelock = await ethers.getContractAt("TimelockController", TIMELOCK_ADDR);

  // Check if operation is ready
  console.log("Checking operation status...");

  const timestamp = await timelock.getTimestamp(OP_ID);

  if (timestamp === 0n) {
    console.log("❌ ERROR: Operation not found. It was never scheduled.");
    process.exit(1);
  }

  const isReady = await timelock.isOperationReady(OP_ID);

  if (!isReady) {
    const scheduledAt = new Date(Number(timestamp) * 1000);
    const readyAt = new Date((Number(timestamp) + 86400) * 1000);
    const now = new Date();

    console.log("⏳ Operation not ready yet");
    console.log("Scheduled at:", scheduledAt.toLocaleString());
    console.log("Ready at:", readyAt.toLocaleString());

    if (now < readyAt) {
      const msLeft = readyAt - now;
      const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
      const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`\nWait ${hoursLeft} hours ${minsLeft} minutes more`);
    }

    process.exit(1);
  }

  console.log("✅ Operation is ready to execute!");
  console.log();

  // Execute
  console.log("Executing upgrade...");
  console.log("This will:");
  console.log("- Upgrade StakingPools proxy to new implementation");
  console.log("- Old impl:", data.oldImplementation);
  console.log("- New impl:", data.newImplementation);
  console.log();

  const tx = await timelock.executeBatch(
    data.targets,
    data.values,
    data.datas,
    data.predecessor,
    data.salt
  );

  console.log("Transaction submitted:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Executed in block:", receipt.blockNumber);
  console.log();

  // Verify the upgrade
  console.log("Verifying upgrade...");
  const { upgrades } = require("hardhat");
  const newImpl = await upgrades.erc1967.getImplementationAddress(data.stakingProxy);

  console.log("Current implementation:", newImpl);

  if (newImpl.toLowerCase() === data.newImplementation.toLowerCase()) {
    console.log("✅ UPGRADE SUCCESSFUL!");
  } else {
    console.log("⚠️ WARNING: Implementation doesn't match expected!");
    console.log("Expected:", data.newImplementation);
    console.log("Got:", newImpl);
  }

  // Try to read version
  try {
    const pools = await ethers.getContractAt("OBNStakingPools", data.stakingProxy);
    const version = await pools.version();
    console.log("Contract version:", version);
  } catch (e) {
    console.log("(Could not read version)");
  }

  console.log("\n🎉 All done!");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
