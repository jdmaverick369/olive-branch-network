// scripts/governance/encode_v92_schedule.js
// Generates the scheduleBatch transaction data for v9.2 upgrade via Gnosis Safe

require("dotenv").config();
const { ethers } = require("hardhat");
const crypto = require("crypto");
const fs = require("fs");

async function main() {
  console.log("=== Encoding v9.2 Upgrade Schedule Transaction ===\n");

  // Addresses
  const PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
  const TIMELOCK = "0x86396526286769ace21982E798Df5eef2389f51c";
  const NEW_IMPL = "0xdbeFe63a1F0ca12EAeFCDF48f1ABf0ACf14EfB48";
  const OLD_IMPL = "0x37951A530114421E7a52Edca3837D003d02e56aa"; // v9.1

  console.log("Proxy:", PROXY);
  console.log("Timelock:", TIMELOCK);
  console.log("Old Implementation (v9.1):", OLD_IMPL);
  console.log("New Implementation (v9.2):", NEW_IMPL);

  // Encode upgradeToAndCall(newImpl, "0x")
  const upgradeIface = new ethers.Interface([
    "function upgradeToAndCall(address newImplementation, bytes data)"
  ]);
  const upgradeData = upgradeIface.encodeFunctionData("upgradeToAndCall", [
    NEW_IMPL,
    "0x" // no initialization call
  ]);

  console.log("\nUpgrade calldata:", upgradeData);

  // Timelock parameters
  const targets = [PROXY];
  const values = [0n];
  const payloads = [upgradeData];
  const predecessor = ethers.ZeroHash;
  const salt = ethers.hexlify(crypto.randomBytes(32));

  // Get minDelay from timelock
  const timelockIface = new ethers.Interface([
    "function hashOperationBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
    "function getMinDelay() view returns (uint256)"
  ]);

  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const timelock = new ethers.Contract(TIMELOCK, timelockIface, provider);

  const minDelay = await timelock.getMinDelay();
  const operationId = await timelock.hashOperationBatch(targets, values, payloads, predecessor, salt);

  console.log("\nOperation ID:", operationId);
  console.log("Min Delay:", Number(minDelay), "seconds (", Number(minDelay) / 3600, "hours)");
  console.log("Salt:", salt);

  // Encode scheduleBatch call
  const scheduleIface = new ethers.Interface([
    "function scheduleBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt, uint256 delay)"
  ]);

  const scheduleData = scheduleIface.encodeFunctionData("scheduleBatch", [
    targets,
    values.map(v => v.toString()),
    payloads,
    predecessor,
    salt,
    minDelay
  ]);

  // Encode executeBatch call (for after delay)
  const executeIface = new ethers.Interface([
    "function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt)"
  ]);

  const executeData = executeIface.encodeFunctionData("executeBatch", [
    targets,
    values.map(v => v.toString()),
    payloads,
    predecessor,
    salt
  ]);

  console.log("\n" + "=".repeat(70));
  console.log("GNOSIS SAFE - SCHEDULE TRANSACTION");
  console.log("=".repeat(70));
  console.log("\nTo: (Timelock Address)");
  console.log(TIMELOCK);
  console.log("\nData: (scheduleBatch encoded)");
  console.log(scheduleData);
  console.log("\nValue: 0");

  console.log("\n" + "=".repeat(70));
  console.log("GNOSIS SAFE - EXECUTE TRANSACTION (after delay)");
  console.log("=".repeat(70));
  console.log("\nTo: (Timelock Address)");
  console.log(TIMELOCK);
  console.log("\nData: (executeBatch encoded)");
  console.log(executeData);
  console.log("\nValue: 0");

  // Save to JSON files
  const scheduleJson = {
    type: "scheduleBatch",
    description: "Schedule StakingPools v9.2 upgrade (claimMultiple + pendingRewardsMultiple)",
    operationId: operationId,
    timelockAddress: TIMELOCK,
    proxyAddress: PROXY,
    oldImplementation: OLD_IMPL,
    newImplementation: NEW_IMPL,
    targets: targets,
    values: values.map(v => v.toString()),
    payloads: payloads,
    predecessor: predecessor,
    salt: salt,
    delay: Number(minDelay),
    encodedData: scheduleData
  };

  const executeJson = {
    type: "executeBatch",
    description: "Execute StakingPools v9.2 upgrade",
    operationId: operationId,
    timelockAddress: TIMELOCK,
    targets: targets,
    values: values.map(v => v.toString()),
    payloads: payloads,
    predecessor: predecessor,
    salt: salt,
    encodedData: executeData
  };

  const scheduleFile = "governance-operations/2026-02-09-v92-schedule.json";
  const executeFile = "governance-operations/2026-02-09-v92-execute.json";

  fs.writeFileSync(scheduleFile, JSON.stringify(scheduleJson, null, 2));
  fs.writeFileSync(executeFile, JSON.stringify(executeJson, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log("FILES SAVED");
  console.log("=".repeat(70));
  console.log(`\n📁 Schedule: ${scheduleFile}`);
  console.log(`📁 Execute:  ${executeFile}`);

  console.log("\n" + "=".repeat(70));
  console.log("NEXT STEPS");
  console.log("=".repeat(70));
  console.log("\n1. Go to Gnosis Safe app");
  console.log("2. New Transaction → Transaction Builder");
  console.log("3. Enter To:", TIMELOCK);
  console.log("4. Enter Value: 0");
  console.log("5. Enter Data: (copy from schedule JSON encodedData)");
  console.log("6. Create & sign transaction");
  console.log(`7. Wait ${Number(minDelay) / 3600} hours after execution`);
  console.log("8. Execute upgrade using execute JSON");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
