// scripts/governance/execute_upgrade.js
// Executes the scheduled StakingPools upgrade after the timelock delay has passed

require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  // Read the v9.0 upgrade JSON file directly
  const path = require("path");
  const projectRoot = path.join(__dirname, "../..");
  const upgradeFilePath = path.join(projectRoot, "governance-operations", "2025-11-11-upgrade_stakingpools_v9.json");

  if (!fs.existsSync(upgradeFilePath)) {
    throw new Error(`Upgrade file not found: governance-operations/2025-11-11-upgrade_stakingpools_v9.json`);
  }

  console.log("Reading from: governance-operations/2025-11-11-upgrade_stakingpools_v9.json\n");

  const data = JSON.parse(fs.readFileSync(upgradeFilePath, "utf8"));

  const TIMELOCK_ADDR = data.timelock;
  const OP_ID = data.opId;

  console.log("=== Execute StakingPools Upgrade ===");
  console.log("Timelock:", TIMELOCK_ADDR);
  console.log("Operation ID:", OP_ID);
  console.log();

  const [signer] = await ethers.getSigners();
  console.log("Executing with:", await signer.getAddress());
  console.log();

  const timelock = await ethers.getContractAt("TimelockController", TIMELOCK_ADDR, signer);

  // Check if operation is ready
  console.log("Checking operation status...");

  const timestamp = await timelock.getTimestamp(OP_ID);

  if (timestamp === 0n) {
    console.log("❌ ERROR: Operation not found. It was either never scheduled, or it was already executed/cancelled.");
    process.exit(1);
  }

  const isReady = await timelock.isOperationReady(OP_ID);

  if (!isReady) {
    // Note: timestamp from getTimestamp() is already (block_timestamp + delay)
    // So we don't need to add 86400 again
    const readyAt = new Date(Number(timestamp) * 1000);
    const now = new Date();

    console.log("⏳ Operation not ready yet");
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

  // Show what will happen
  console.log("=== EXECUTION PREVIEW ===");
  console.log("This will upgrade StakingPools:");
  console.log("  Old implementation: ", data.oldImplementation);
  console.log("  New implementation: ", data.newImplementation);
  console.log("  Target proxy:       ", data.stakingProxy);
  console.log();
  console.log("Transaction will be sent to:", TIMELOCK_ADDR);
  console.log();

  // Safety confirmation
  console.log("⚠️  TO PROCEED WITH EXECUTION:");
  console.log("Set environment variable: CONFIRM_UPGRADE=yes");
  console.log("Then run this script again.");
  console.log();

  if (process.env.CONFIRM_UPGRADE !== "yes") {
    console.log("❌ Execution blocked. Set CONFIRM_UPGRADE=yes to proceed.");
    console.log("\nExample:");
    console.log('  set CONFIRM_UPGRADE=yes && npx hardhat run scripts/governance/execute_upgrade.js --network base');
    process.exit(1);
  }

  console.log("✅ CONFIRM_UPGRADE=yes detected. Proceeding with execution...");
  console.log();

  // Execute
  // Convert values from strings to BigInts
  const values = data.values.map(v => BigInt(v));

  // Convert salt to proper bytes32 format
  const salt = ethers.toBeHex(data.salt, 32);

  let tx;
  try {
    console.log("Attempting execution...");
    tx = await timelock.executeBatch(
      data.targets,
      values,
      data.datas,
      data.predecessor,
      salt
    );

    console.log("Transaction submitted:", tx.hash);
  } catch (e) {
    console.error("\n❌ Execution failed with error:");
    console.error("Message:", e.message);
    if (e.data) {
      console.error("Error data:", e.data);
    }
    throw e;
  }
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
