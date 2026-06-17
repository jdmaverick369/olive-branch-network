// scripts/governance/encode_schedule_transaction.js
// Encodes the scheduleBatch call as raw transaction data
// You can paste this directly into Gnosis Safe as a raw transaction

require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  // Read the upgrade JSON file
  const files = fs.readdirSync(".").filter(f => f.startsWith("upgrade_stakingpools_"));
  if (files.length === 0) {
    throw new Error("No upgrade JSON file found. Run 1_upgrade_stakingpools_schedule.js first.");
  }

  const latestFile = files.sort().reverse()[0];
  console.log(`Reading from: ${latestFile}`);

  const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));

  console.log("\n=== Gnosis Safe Transaction (Raw Data Method) ===\n");

  // Encode the scheduleBatch call
  const timelockABI = [
    "function scheduleBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt, uint256 delay)"
  ];

  const iface = new ethers.Interface(timelockABI);

  // Use the actual minDelay instead of 0
  const delayToUse = data.minDelay;

  const encodedData = iface.encodeFunctionData("scheduleBatch", [
    data.targets,
    data.values,
    data.datas,
    data.predecessor,
    data.salt,
    delayToUse
  ]);

  console.log("📋 Copy these values into Gnosis Safe:\n");
  console.log("─────────────────────────────────────────────");
  console.log("\n1. In Gnosis Safe, click 'New Transaction'");
  console.log("2. Select 'Contract Interaction'\n");

  console.log("3. Enter Address:");
  console.log("─────────────────────────────────────────────");
  console.log(data.timelock);
  console.log();

  console.log("4. Enter Transaction Data (hex):");
  console.log("─────────────────────────────────────────────");
  console.log(encodedData);
  console.log();

  console.log("5. Value (ETH): 0");
  console.log();

  console.log("─────────────────────────────────────────────");
  console.log("\n✅ That's it! No need to enter ABI or individual parameters.");
  console.log("   Just paste the address and hex data above.\n");

  console.log("📊 Transaction Summary:");
  console.log("─────────────────────────────────────────────");
  console.log("Timelock:", data.timelock);
  console.log("Proxy:", data.stakingProxy);
  console.log("Old Implementation:", data.oldImplementation);
  console.log("New Implementation:", data.newImplementation);
  console.log("Operation ID:", data.opId);
  console.log("Delay:", data.minDelay, "seconds (", data.minDelay / 3600, "hours )");

  // Save for easy reference
  const outputFile = "safe_transaction_data.txt";
  fs.writeFileSync(outputFile, `GNOSIS SAFE TRANSACTION
========================

Step 1: New Transaction → Contract Interaction

Step 2: Enter Address
${data.timelock}

Step 3: Enter Transaction Data (hex)
${encodedData}

Step 4: Value (ETH)
0

Step 5: Review and Submit

Operation ID: ${data.opId}
Delay: ${data.minDelay} seconds

After scheduling, wait ${data.minDelay} seconds before executing.
`);

  console.log(`\n💾 Saved to ${outputFile} for easy copy-paste\n`);

  // Also prepare the execute data
  const executeData = iface.encodeFunctionData("executeBatch", [
    data.targets,
    data.values,
    data.datas,
    data.predecessor,
    data.salt
  ]);

  const executeFile = "safe_execute_data.txt";
  fs.writeFileSync(executeFile, `GNOSIS SAFE EXECUTION (USE AFTER ${data.minDelay}s DELAY)
========================

Step 1: New Transaction → Contract Interaction

Step 2: Enter Address
${data.timelock}

Step 3: Enter Transaction Data (hex)
${executeData}

Step 4: Value (ETH)
0

Step 5: Review and Execute

Operation ID: ${data.opId}
`);

  console.log(`💾 Execution data saved to ${executeFile}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
