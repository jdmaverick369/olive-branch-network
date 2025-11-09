const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const TIMELOCK = "0x86396526286769ace21982E798Df5eef2389f51c";
  const OP_ID = "0x2a9b97a5c0cb811e02a024e45cd1829caaf2974719ab4493d3f240482f961e1d";

  const getTimestamp = ethers.id("getTimestamp(bytes32)").slice(0, 10);
  const tsResult = await provider.call({
    to: TIMELOCK,
    data: getTimestamp + OP_ID.slice(2)
  });

  const timestamp = ethers.toNumber(tsResult);

  if (timestamp === 0) {
    console.log("❌ Not scheduled yet");
    return;
  }

  const scheduledAt = new Date(timestamp * 1000);
  const readyAt = new Date((timestamp + 86400) * 1000);
  const now = new Date();

  console.log("Scheduled:", scheduledAt.toLocaleString());
  console.log("Ready at:", readyAt.toLocaleString());

  if (now >= readyAt) {
    console.log("\n✅ READY TO EXECUTE NOW!");
  } else {
    const msLeft = readyAt - now;
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
    const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`\n⏳ ${hoursLeft} hours ${minsLeft} minutes remaining`);
  }
}

main().catch(console.error);
