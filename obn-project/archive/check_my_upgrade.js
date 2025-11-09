require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const TIMELOCK_ADDR = "0x86396526286769ace21982E798Df5eef2389f51c";
  const OP_ID = "0x2a9b97a5c0cb811e02a024e45cd1829caaf2974719ab4493d3f240482f961e1d";

  const TIMELOCK_ABI = [
    "function getOperationState(bytes32 id) view returns (uint8)",
    "function getMinDelay() view returns (uint256)",
    "function getTimestamp(bytes32 id) view returns (uint256)"
  ];

  const STATE_NAMES = {
    0: "Unset (does not exist - not scheduled yet)",
    1: "Waiting (scheduled, delay not passed)",
    2: "Ready (can be executed)",
    3: "Done (already executed)"
  };

  const timelock = new ethers.Contract(
    TIMELOCK_ADDR,
    TIMELOCK_ABI,
    await ethers.provider
  );

  console.log("=== Your Upgrade Status ===");
  console.log("Operation ID:", OP_ID);
  
  const state = await timelock.getOperationState(OP_ID);
  const stateNum = Number(state);
  console.log("\nState:", stateNum, "-", STATE_NAMES[stateNum]);

  const timestamp = await timelock.getTimestamp(OP_ID);
  const minDelay = await timelock.getMinDelay();

  if (stateNum === 0) {
    console.log("\n❌ Operation not scheduled yet.");
    console.log("You need to EXECUTE (not just simulate) the transaction in Gnosis Safe.");
  } else if (timestamp > 0n) {
    const now = Math.floor(Date.now() / 1000);
    const scheduledAt = Number(timestamp);
    const readyAt = scheduledAt + Number(minDelay);
    const timeUntilReady = readyAt - now;

    console.log("\n✅ Scheduled!");
    console.log("Scheduled at:", new Date(scheduledAt * 1000).toISOString());
    console.log("Ready at:", new Date(readyAt * 1000).toISOString());

    if (timeUntilReady > 0) {
      const hours = Math.floor(timeUntilReady / 3600);
      const minutes = Math.floor((timeUntilReady % 3600) / 60);
      console.log(`\n⏳ Time until ready: ${hours}h ${minutes}m`);
    } else {
      console.log("\n✅ READY TO EXECUTE!");
    }
  }
}

main().catch(console.error);
