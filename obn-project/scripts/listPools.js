// scripts/listPools.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const stakingAddress = process.env.STAKING_CONTRACT;
  if (!stakingAddress) {
    throw new Error("❌ Missing STAKING_CONTRACT in .env");
  }

  console.log(`🔗 Connecting to StakingPools at ${stakingAddress}...`);

  const staking = await ethers.getContractAt("StakingPools", stakingAddress);

  // ✅ poolLength is a BigInt in ethers v6
  const lengthBN = await staking.poolLength();
  const poolCount = Number(lengthBN); // 👈 FIX: convert BigInt to Number
  console.log(`📌 Total Pools: ${poolCount}\n`);

  for (let pid = 0; pid < poolCount; pid++) {
    const pool = await staking.pools(pid);

    // pool is a struct: (charityWallet, active, totalStaked, accRewardPerShare, lastRewardTime)
    const charityWallet = pool.charityWallet || pool[0];
    const active = pool.active || pool[1];
    const totalStaked = pool.totalStaked || pool[2];

    console.log(`🆔 Pool #${pid}`);
    console.log(`   Charity Wallet: ${charityWallet}`);
    console.log(`   Active: ${active}`);
    console.log(`   Total Staked: ${ethers.formatEther(totalStaked)} OBN`);
    console.log("-------------------------------------------------------");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});