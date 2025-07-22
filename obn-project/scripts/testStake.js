require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const tokenAddr = process.env.OBN_TOKEN_PROXY;
  const stakingAddr = process.env.STAKING_CONTRACT;

  if (!tokenAddr || !stakingAddr) {
    throw new Error("❌ Missing OBN_TOKEN_PROXY or STAKING_CONTRACT in .env");
  }

  console.log("Using account:", deployer.address);
  console.log("OBN Token:", tokenAddr);
  console.log("StakingPools:", stakingAddr);

  const token = await ethers.getContractAt("OBNToken", tokenAddr);
  const staking = await ethers.getContractAt("StakingPools", stakingAddr);

  // 1. Approve staking contract to spend tokens
  const amountToStake = ethers.parseUnits("1000", 18); // 1000 OBN
  console.log(`⏳ Approving ${amountToStake} OBN to staking contract...`);
  let tx = await token.approve(stakingAddr, amountToStake);
  await tx.wait();
  console.log("✅ Approval complete");

  // 2. Stake into pool 0
  console.log("⏳ Staking into pool 0...");
  tx = await staking.deposit(0, amountToStake);
  await tx.wait();
  console.log("✅ Staked 1000 OBN into pool 0");

  // (Optional) Wait or simulate time passing
  console.log("⏳ Waiting a bit for rewards to accrue...");
  await new Promise((resolve) => setTimeout(resolve, 5000)); // wait 5 seconds

  // 3. Claim rewards (withdraw 0 keeps stake, just claims rewards)
  console.log("⏳ Claiming rewards from pool 0...");
  tx = await staking.claim(0);
  await tx.wait();
  console.log("✅ Claimed rewards!");

  // 4. Check balances
  const balance = await token.balanceOf(deployer.address);
  console.log(`💰 Deployer OBN balance: ${ethers.formatUnits(balance, 18)} OBN`);
}

main().catch((error) => {
  console.error("❌ Test staking failed:", error);
  process.exit(1);
});