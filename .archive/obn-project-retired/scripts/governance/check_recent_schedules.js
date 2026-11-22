const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const TIMELOCK = "0x86396526286769ace21982E798Df5eef2389f51c";
  const SAFE = "0x066e2fabb036deab7dc58bade428f819ac3542dd"; // from your trace
  
  console.log("=== Checking Recent Timelock Events ===\n");
  
  // CallScheduled event signature
  const callScheduledTopic = ethers.id("CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)");
  
  // Get recent blocks (last ~1000 blocks, about 30 mins on Base)
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 1000;
  
  console.log(`Checking blocks ${fromBlock} to ${currentBlock}...\n`);
  
  const logs = await provider.getLogs({
    address: TIMELOCK,
    topics: [callScheduledTopic],
    fromBlock: fromBlock,
    toBlock: "latest"
  });
  
  console.log(`Found ${logs.length} CallScheduled events\n`);
  
  if (logs.length > 0) {
    for (const log of logs) {
      const opId = log.topics[1]; // First indexed parameter
      const block = await provider.getBlock(log.blockNumber);
      console.log("─────────────────────────────────");
      console.log("Operation ID:", opId);
      console.log("Block:", log.blockNumber);
      console.log("Time:", new Date(block.timestamp * 1000).toISOString());
      console.log("Tx:", log.transactionHash);
    }
    
    // Check state of most recent one
    const latestOpId = logs[logs.length - 1].topics[1];
    console.log("\n=== Most Recent Operation ===");
    console.log("Op ID:", latestOpId);
    
    // Check state using isOperationPending
    const isOperationPending = ethers.id("isOperationPending(bytes32)").slice(0, 10);
    const result = await provider.call({
      to: TIMELOCK,
      data: isOperationPending + latestOpId.slice(2)
    });
    
    const isPending = result !== "0x0000000000000000000000000000000000000000000000000000000000000000";
    console.log("Is Pending:", isPending);
    
    // Get timestamp
    const getTimestamp = ethers.id("getTimestamp(bytes32)").slice(0, 10);
    const tsResult = await provider.call({
      to: TIMELOCK,
      data: getTimestamp + latestOpId.slice(2)
    });
    const timestamp = ethers.toNumber(tsResult);
    
    if (timestamp > 0) {
      const scheduledAt = new Date(timestamp * 1000);
      const readyAt = new Date((timestamp + 86400) * 1000);
      const now = new Date();
      
      console.log("Scheduled at:", scheduledAt.toISOString());
      console.log("Ready at:", readyAt.toISOString());
      console.log("Current time:", now.toISOString());
      
      if (now >= readyAt) {
        console.log("\n✅ READY TO EXECUTE!");
      } else {
        const hoursLeft = Math.floor((readyAt - now) / (1000 * 60 * 60));
        const minsLeft = Math.floor((readyAt - now) / (1000 * 60)) % 60;
        console.log(`\n⏳ Wait ${hoursLeft}h ${minsLeft}m more`);
      }
    }
  } else {
    console.log("No recent CallScheduled events found.");
    console.log("The transaction might not have been executed yet, or check a wider block range.");
  }
}

main().catch(console.error);
