// scripts/governance/check_operation_status.js
// Check the status of a timelock operation

require("dotenv").config();
const { ethers } = require("hardhat");

const TIMELOCK_ABI = [
  "function getOperationState(bytes32 id) view returns (uint8)",
  "function getMinDelay() view returns (uint256)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function hashOperationBatch(address[] targets,uint256[] values,bytes[] data,bytes32 predecessor,bytes32 salt) view returns (bytes32)",
];

const STATE_NAMES = {
  0: "Unset (does not exist)",
  1: "Waiting (scheduled, delay not passed)",
  2: "Ready (can be executed)",
  3: "Done (already executed)",
  4: "Cancelled"
};

async function main() {
  const TIMELOCK_ADDR = process.env.TIMELOCK_ADDR;
  if (!TIMELOCK_ADDR) throw new Error("❌ TIMELOCK_ADDR missing in .env");

  const timelock = new ethers.Contract(
    TIMELOCK_ADDR,
    TIMELOCK_ABI,
    await ethers.provider
  );

  console.log("=== Timelock Operation Status ===");
  console.log("Timelock:", TIMELOCK_ADDR);
  console.log();

  // Get operation ID from env or calculate it
  let opId = process.env.OP_ID;

  if (!opId) {
    // Try to calculate from parameters
    const TARGETS_CSV = process.env.TARGETS_CSV;
    const VALUES_CSV = process.env.VALUES_CSV;
    const DATAS_HEX_CSV = process.env.DATAS_HEX_CSV;
    const PREDECESSOR = process.env.PREDECESSOR || ethers.ZeroHash;
    const SALT = process.env.SALT;

    if (TARGETS_CSV && VALUES_CSV && DATAS_HEX_CSV && SALT) {
      const targets = TARGETS_CSV.split(",");
      const values = VALUES_CSV.split(",").map((v) => BigInt(v));
      const datas = DATAS_HEX_CSV.split(",");

      opId = await timelock.hashOperationBatch(targets, values, datas, PREDECESSOR, SALT);
      console.log("Operation ID (calculated):", opId);
    } else {
      throw new Error("❌ Provide OP_ID or all parameters (TARGETS_CSV, VALUES_CSV, DATAS_HEX_CSV, SALT)");
    }
  } else {
    console.log("Operation ID:", opId);
  }

  // Get operation state
  const state = await timelock.getOperationState(opId);
  const stateNum = Number(state);
  console.log("\nState:", stateNum, "-", STATE_NAMES[stateNum] || "Unknown");

  // Get timing info
  try {
    const timestamp = await timelock.getTimestamp(opId);
    const minDelay = await timelock.getMinDelay();

    if (timestamp > 0n) {
      const now = Math.floor(Date.now() / 1000);
      const scheduledAt = Number(timestamp);
      const readyAt = scheduledAt + Number(minDelay);
      const timeUntilReady = readyAt - now;

      console.log("\nTiming:");
      console.log("  Min Delay:", Number(minDelay), "seconds");
      console.log("  Scheduled at:", new Date(scheduledAt * 1000).toISOString());
      console.log("  Ready at:", new Date(readyAt * 1000).toISOString());

      if (timeUntilReady > 0) {
        const hours = Math.floor(timeUntilReady / 3600);
        const minutes = Math.floor((timeUntilReady % 3600) / 60);
        console.log(`  Time until ready: ${hours}h ${minutes}m (${timeUntilReady}s)`);
      } else {
        console.log("  ✅ Ready for execution!");
      }
    } else {
      console.log("\n⚠️ No timestamp found (operation may not exist)");
    }
  } catch (e) {
    console.log("\n⚠️ Could not get timing info:", e.message);
  }

  // Provide next steps
  console.log("\n=== Next Steps ===");
  if (stateNum === 0) {
    console.log("❌ Operation does not exist. Schedule it first.");
  } else if (stateNum === 1) {
    console.log("⏳ Wait for the delay period to pass.");
  } else if (stateNum === 2) {
    console.log("✅ Ready to execute!");
    console.log("Run: npx hardhat run scripts/governance/2_execute_by_hash.js --network <network>");
  } else if (stateNum === 3) {
    console.log("✅ Already executed.");
  } else if (stateNum === 4) {
    console.log("❌ Operation was cancelled.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
