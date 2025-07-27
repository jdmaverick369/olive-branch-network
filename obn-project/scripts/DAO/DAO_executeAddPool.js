// scripts/7_executeAddPool.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const timelockAddr = process.env.OBN_TIMELOCK_ADDRESS;
  const stakingAddr = process.env.OBN_STAKING_ADDRESS;
  const charityWallet = process.env.PID_0; // Use the PID_0 from .env for charity wallet

  if (!timelockAddr || !stakingAddr || !charityWallet) {
    throw new Error("❌ Missing OBN_TIMELOCK_ADDRESS or OBN_STAKING_ADDRESS or NEW_CHARITY_WALLET in .env");
  }

  const [signer] = await ethers.getSigners();
  console.log(`⏳ Using executor account: ${signer.address}`);
  console.log(`📌 TimelockController: ${timelockAddr}`);
  console.log(`📌 StakingPools: ${stakingAddr}`);
  console.log(`🎯 Charity wallet to add: ${charityWallet}`);

  const timelock = await ethers.getContractAt("TimelockController", timelockAddr);

  // ✅ encode function call
  const stakingInterface = new ethers.Interface(["function addPool(address)"]);
  const data = stakingInterface.encodeFunctionData("addPool", [charityWallet]);

  console.log("⏳ Executing transaction...");
  const tx = await timelock.execute(
    stakingAddr,     // target
    0,               // value
    data,            // raw calldata
    ethers.ZeroHash, // predecessor
    ethers.ZeroHash  // salt
  );
  await tx.wait();
  console.log(`✅ Pool successfully added via Timelock! Charity wallet: ${charityWallet}`);
}

main().catch((error) => {
  console.error("❌ Error running executeAddPool script:", error);
  process.exitCode = 1;
});
