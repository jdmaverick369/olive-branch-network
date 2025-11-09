// scripts/listPools.js
const { ethers } = require("hardhat");
require("dotenv").config();

const ABI = [
  "function poolLength() view returns (uint256)",
  // Deployed signature (no 'active' flag)
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  // Optional extras (wrapped in try/catch)
  "function uniqueStakersByPool(uint256 pid) view returns (uint256)",
  "function getPoolStats(uint256 pid) view returns (address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
];

async function main() {
  const stakingAddress = process.env.OBN_STAKING_CONTRACT;
  if (!stakingAddress) throw new Error("❌ Missing OBN_STAKING_CONTRACT in .env");

  console.log(`🔗 Connecting to StakingPools at ${stakingAddress}...`);
  const staking = await ethers.getContractAt(ABI, stakingAddress);

  const poolCount = Number(await staking.poolLength());
  console.log(`📌 Total Pools: ${poolCount}\n`);

  for (let pid = 0; pid < poolCount; pid++) {
    let charityWallet, totalStaked, uniqueStakers = 0;

    // Prefer your deployed getPoolInfo(pid) -> (address, uint256)
    try {
      const info = await staking.getPoolInfo(pid);
      charityWallet = info.charityWallet ?? info[0];
      totalStaked   = info.totalStaked   ?? info[1];
    } catch (e) {
      // Optional: try getPoolStats if present
      try {
        const s = await staking.getPoolStats(pid);
        charityWallet = s[0];
        totalStaked   = s[2]; // totalStaked position in your stats tuple
        uniqueStakers = Number(s[3]);
      } catch {
        throw new Error(`Failed to read pool #${pid}: ${e.message || e}`);
      }
    }

    // Unique stakers (optional helper)
    try {
      const u = await staking.uniqueStakersByPool(pid);
      uniqueStakers = Number(u);
    } catch { /* helper not present on some builds */ }

    console.log(`🆔 Pool #${pid}`);
    console.log(`   Charity Wallet : ${charityWallet}`);
    console.log(`   Total Staked   : ${ethers.formatEther(totalStaked || 0n)} OBN`);
    console.log(`   Unique Stakers : ${uniqueStakers}`);
    console.log("-------------------------------------------------------");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
