// scripts/governance/encode_v9_gnosis_transaction.js
// Encodes the v9.0 upgrade as a Gnosis Safe transaction

require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const data = JSON.parse(
    fs.readFileSync("governance-operations/2025-11-11-upgrade_stakingpools_v9.json", "utf8")
  );

  console.log("=== Gnosis Safe Transaction for v9.0 Upgrade ===\n");
  console.log("Proposal Details:");
  console.log("- Old Implementation:", data.oldImplementation);
  console.log("- New Implementation:", data.newImplementation);
  console.log("- Timelock Address:", data.timelock);
  console.log("- Min Delay:", data.minDelay, "seconds (24 hours)\n");

  // Encode the scheduleBatch call for the timelock
  const timelockABI = [
    "function scheduleBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt, uint256 delay)"
  ];

  const iface = new ethers.Interface(timelockABI);

  // Generate a salt if not provided
  const salt = ethers.id("v9.0-upgrade-" + Date.now());

  const encodedSchedule = iface.encodeFunctionData("scheduleBatch", [
    data.targets,
    data.values.map(v => BigInt(v)),
    data.datas,
    data.predecessor,
    salt,
    data.minDelay
  ]);

  console.log("📋 STEP 1: QUEUE THE PROPOSAL IN GNOSIS SAFE\n");
  console.log("1. Go to your Gnosis Safe: https://app.safe.global");
  console.log("2. Connect wallet with signing permissions");
  console.log("3. Click 'New Transaction' → 'Contract Interaction'\n");

  console.log("4. Fill in the following details:\n");
  console.log("   Address (Contract):");
  console.log("   " + data.timelock);
  console.log();

  console.log("   Function: scheduleBatch");
  console.log("   (or paste raw data below if available)\n");

  console.log("   Raw Transaction Data:");
  console.log("   " + encodedSchedule);
  console.log();

  console.log("5. Review and sign with required signers");
  console.log("6. Send transaction\n");

  console.log("📋 STEP 2: WAIT 24 HOURS\n");
  console.log("The timelock requires a 24-hour delay before execution.\n");

  console.log("📋 STEP 3: EXECUTE THE UPGRADE\n");
  console.log("After 24 hours, run:");
  console.log("   npx hardhat run scripts/governance/execute_upgrade.js --network base\n");

  // Save the encoded data to a file for reference
  const txData = {
    type: "scheduleBatch",
    timelockAddress: data.timelock,
    targets: data.targets,
    values: data.values,
    payloads: data.datas,
    predecessor: data.predecessor,
    salt: salt,
    delay: data.minDelay,
    encodedData: encodedSchedule,
    description: "Upgrade StakingPools to v9.0 with bootstrap migration, hardening, and emergency exit functions"
  };

  fs.writeFileSync(
    "governance-operations/2025-11-11-v9-gnosis-tx.json",
    JSON.stringify(txData, null, 2)
  );

  console.log("✅ Transaction data saved to: governance-operations/2025-11-11-v9-gnosis-tx.json\n");

  console.log("=== SUMMARY ===");
  console.log("Current Version Live: 8.5.0-perpool-charity-clean");
  console.log("Upgrading To: 9.0");
  console.log("Features Added:");
  console.log("  - migrateBootstrap() function");
  console.log("  - forceExitUserToSelf() function");
  console.log("  - Hardening validations for reward preservation");
  console.log("  - Lock overflow prevention");
  console.log("  - Atomic charity wallet updates\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
