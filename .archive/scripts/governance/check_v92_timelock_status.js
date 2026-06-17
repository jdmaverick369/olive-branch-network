// scripts/governance/check_v92_timelock_status.js
// Check the status of the v9.2 upgrade in the timelock

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("=== CHECKING v9.2 UPGRADE TIMELOCK STATUS ===\n");

  const TIMELOCK = "0x86396526286769ace21982E798Df5eef2389f51c";
  const PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
  const NEW_IMPL = "0xdbeFe63a1F0ca12EAeFCDF48f1ABf0ACf14EfB48";

  // upgradeToAndCall(address newImpl, bytes data)
  const upgradeIface = new ethers.Interface([
    "function upgradeToAndCall(address newImplementation, bytes data)"
  ]);
  const upgradeData = upgradeIface.encodeFunctionData("upgradeToAndCall", [NEW_IMPL, "0x"]);

  // scheduleBatch parameters (from on-chain CallScheduled event)
  const targets = [PROXY];
  const values = [0n];
  const payloads = [upgradeData];
  const predecessor = ethers.ZeroHash;
  const salt = "0xf50f26a1712eb678d4f2faa807f8434fd4aacd4abf0b47863cc00994dfe45ea9";

  // Connect to timelock using standard TimelockController interface
  const timelockIface = new ethers.Interface([
    "function hashOperationBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
    "function getOperationState(bytes32 id) view returns (uint8)",
    "function getTimestamp(bytes32 id) view returns (uint256)",
    "function getMinDelay() view returns (uint256)"
  ]);

  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const timelock = new ethers.Contract(TIMELOCK, timelockIface, provider);

  // Calculate operation ID
  const operationId = await timelock.hashOperationBatch(targets, values, payloads, predecessor, salt);

  // Expected operation ID from on-chain event
  const expectedOpId = "0xd14c01528ace4e971028244eab94042f626d86ef02df7ee53638d7714cec5411";

  console.log("🔍 Operation ID Verification:");
  console.log("   Calculated:     ", operationId.toLowerCase());
  console.log("   Expected:       ", expectedOpId.toLowerCase());
  console.log("   Match:          ", operationId.toLowerCase() === expectedOpId.toLowerCase() ? "✅" : "❌");
  console.log();

  // Get operation state
  const state = Number(await timelock.getOperationState(operationId));
  const timestamp = Number(await timelock.getTimestamp(operationId));
  const minDelay = Number(await timelock.getMinDelay());

  const stateNames = ["Unset", "Waiting", "Ready", "Done"];
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, timestamp - now);

  console.log("📋 Upgrade Details:");
  console.log("   Proxy:          ", PROXY);
  console.log("   Old Impl (v9.1):", "0x37951A530114421E7a52Edca3837D003d02e56aa");
  console.log("   New Impl (v9.2):", NEW_IMPL);
  console.log("   Features:       ", "claimMultiple + pendingRewardsMultiple");
  console.log();

  console.log("⏰ Timelock Status:");
  console.log("   Timelock:       ", TIMELOCK);
  console.log("   Operation ID:   ", operationId);
  console.log("   Min Delay:      ", minDelay, "seconds (24 hours)");
  console.log("   State:          ", `${state} (${stateNames[state]})`);
  console.log();

  if (timestamp > 0) {
    const etaDate = new Date(timestamp * 1000);
    const nowDate = new Date(now * 1000);

    console.log("📅 Timing:");
    console.log("   ETA:            ", etaDate.toLocaleString());
    console.log("   Current Time:   ", nowDate.toLocaleString());
    console.log();
  }

  // Display status-specific message
  if (state === 0) {
    console.log("❌ Status: NOT SCHEDULED");
    console.log("   This operation has not been scheduled in the timelock.");
    console.log("   Check the operation parameters or schedule it first.");
  } else if (state === 1) {
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    console.log("⏳ Status: WAITING FOR TIMELOCK DELAY");
    console.log(`   Time Remaining: ${hours}h ${minutes}m ${seconds}s`);
    console.log();
    console.log("   Next Step: Wait for the delay to pass, then execute the upgrade.");
  } else if (state === 2) {
    console.log("✅ Status: READY TO EXECUTE");
    console.log("   The timelock delay has passed!");
    console.log();
    console.log("   Next Step: Execute the upgrade via Gnosis Safe:");
    console.log("   1. Upload 2026-02-09-v92-execute-gnosis.json to Transaction Builder");
    console.log("   2. Execute with required signatures");
  } else if (state === 3) {
    console.log("✅ Status: EXECUTED");
    console.log("   The v9.2 upgrade has been completed!");
    console.log();
    console.log("   Verify the upgrade:");
    console.log(`   https://basescan.org/address/${PROXY}#readProxyContract`);
    console.log("   - version() should return '9.2'");
    console.log("   - claimMultiple and pendingRewardsMultiple should be available");
  }

  console.log();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exitCode = 1;
});
