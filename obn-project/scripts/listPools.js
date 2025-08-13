// scripts/listPools.js
const { ethers } = require("hardhat");
require("dotenv").config();

// Minimal ABI covering both the new helpers and a safe fallback path.
const ABI = [
  // core
  "function poolLength() view returns (uint256)",
  "function poolInfo(uint256 pid) view returns (address charityWallet, bool active, uint256 totalStaked)",

  // preferred (new helper you added)
  "function getPoolStats(uint256 pid) view returns (address charityWallet, bool active, uint256 totalStaked, uint256 uniqueStakers, uint256 accPerShare, uint256 lastTime, uint256 accruedCharity, uint256 depositedAllTime, uint256 withdrawnAllTime, uint256 charityMintedAllTime)",

  // fallback (public variable + mapping)
  "function uniqueStakersByPool(uint256 pid) view returns (uint256)",
];

async function main() {
  const stakingAddress = process.env.OBN_STAKING_CONTRACT;
  if (!stakingAddress) {
    throw new Error("❌ Missing OBN_STAKING_CONTRACT in .env");
  }

  console.log(`🔗 Connecting to StakingPools at ${stakingAddress}...`);

  const staking = await ethers.getContractAt(ABI, stakingAddress);

  // ethers v6 returns bigint for uint256
  const poolCount = Number(await staking.poolLength());
  console.log(`📌 Total Pools: ${poolCount}\n`);

  for (let pid = 0; pid < poolCount; pid++) {
    let charityWallet, active, totalStaked, uniqueStakers;

    // Try the new helper first
    try {
      const stats = await staking.getPoolStats(pid);
      // struct-like return (named OR tuple)
      charityWallet = stats.charityWallet ?? stats[0];
      active        = Boolean(stats.active ?? stats[1]);
      totalStaked   = stats.totalStaked ?? stats[2];
      uniqueStakers = Number(stats.uniqueStakers ?? stats[3]);
    } catch {
      // Fallback to basic getters
      const pool = await staking.poolInfo(pid);
      charityWallet = pool.charityWallet ?? pool[0];
      active        = Boolean(pool.active ?? pool[1]);
      totalStaked   = pool.totalStaked ?? pool[2];

      try {
        uniqueStakers = Number(await staking.uniqueStakersByPool(pid));
      } catch {
        uniqueStakers = 0; // should never happen on your new contract
      }
    }

    console.log(`🆔 Pool #${pid}`);
    console.log(`   Charity Wallet : ${charityWallet}`);
    console.log(`   Active         : ${active}`);
    console.log(`   Total Staked   : ${ethers.formatEther(totalStaked)} OBN`);
    console.log(`   Unique Stakers : ${uniqueStakers}`);
    console.log("-------------------------------------------------------");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
