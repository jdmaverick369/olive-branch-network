const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const timelockAddr = process.env.OBN_TIMELOCK_ADDRESS;
  const stakingAddr = process.env.OBN_STAKING_ADDRESS;
  const charityWallet = process.env.PID_0; // Use the PID_0 from .env for charity wallet

  // Validate required environment variables
  if (!timelockAddr || !stakingAddr || !charityWallet) {
    throw new Error("❌ Missing OBN_TIMELOCK_ADDRESS or OBN_STAKING_ADDRESS or NEW_CHARITY_WALLET in .env");
  }

  // Validate that charity wallet is not the zero address
  if (charityWallet === ethers.constants.AddressZero) {
    throw new Error("❌ Invalid charity wallet address. It cannot be the zero address.");
  }

  const [signer] = await ethers.getSigners();
  console.log(`⏳ Using proposer account: ${signer.address}`);
  console.log(`📌 TimelockController: ${timelockAddr}`);
  console.log(`📌 StakingPools: ${stakingAddr}`);
  console.log(`🎯 Charity wallet to add: ${charityWallet}`);

  // Get Timelock contract
  const timelock = await ethers.getContractAt("TimelockController", timelockAddr);

  // ✅ Encode the function call to add the pool
  const iface = new ethers.Interface(["function addPool(address)"]);
  const data = iface.encodeFunctionData("addPool", [charityWallet]);

  // Verify minDelay from Timelock
  const minDelay = await timelock.getMinDelay();
  console.log(`⏳ Timelock minDelay: ${minDelay.toString()} seconds`);

  console.log(`📨 Scheduling addPool(${charityWallet})...`);
  console.log(`👉 Target: ${stakingAddr}`);
  console.log(`👉 Data: ${data}`);

  // Estimate gas for scheduling the transaction
  try {
    const gasEstimate = await timelock.estimateGas.schedule(
      stakingAddr,
      0,
      data,
      ethers.ZeroHash, // predecessor
      ethers.ZeroHash, // salt
      minDelay         // delay
    );
    console.log(`⏳ Gas estimate for scheduling: ${gasEstimate.toString()}`);
  } catch (error) {
    console.error("❌ Failed to estimate gas:", error.message);
    process.exitCode = 1;
  }

  // Schedule the transaction
  try {
    const tx = await timelock.schedule(
      stakingAddr,
      0,
      data,
      ethers.ZeroHash, // predecessor
      ethers.ZeroHash, // salt
      minDelay         // delay
    );

    console.log("⏳ Waiting for schedule transaction...");
    const receipt = await tx.wait();

    // Log the transaction hash and receipt
    console.log(`✅ Scheduled successfully! Wait for minDelay then execute.`);
    console.log(`Transaction Hash: ${receipt.transactionHash}`);
  } catch (error) {
    console.error("❌ Error scheduling addPool:", error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("❌ Error running scheduleAddPool script:", error.message);
  process.exit(1);
});
