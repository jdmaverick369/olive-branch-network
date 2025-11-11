// Check if any charity wallets are staking to their own pools
require("dotenv").config();
const { ethers } = require("hardhat");

const ABI = [
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function userAmount(uint256, address) view returns (uint256)",
  "function lockedAmount(uint256, address) view returns (uint256)",
  "function poolRemoved(uint256) view returns (bool)"
];

async function main() {
  const STAKING_PROXY = process.env.OBN_STAKING_CONTRACT || "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";

  console.log("=== Checking Charity Self-Stakes ===\n");
  console.log("StakingPools:", STAKING_PROXY);
  console.log();

  const staking = await ethers.getContractAt(ABI, STAKING_PROXY);

  const poolLength = await staking.poolLength();
  console.log(`Total Pools: ${poolLength}\n`);

  let selfStakeFound = false;
  const selfStakes = [];

  for (let pid = 0; pid < poolLength; pid++) {
    try {
      const poolData = await staking.getPoolInfo(pid);
      const charityWallet = poolData.charityWallet || poolData[0];
      const totalStaked = poolData.totalStaked || poolData[1];

      // Check if pool is removed (only available after v8.9.0 upgrade)
      let isRemoved = false;
      try {
        isRemoved = await staking.poolRemoved(pid);
      } catch {
        // poolRemoved() not available on current contract version
      }

      // Check charity's stake in their own pool
      const charityTotalStaked = await staking.userAmount(pid, charityWallet);
      const charityLocked = await staking.lockedAmount(pid, charityWallet);
      const charityUnlocked = charityTotalStaked - charityLocked;

      if (charityTotalStaked > 0n) {
        selfStakeFound = true;
        const data = {
          pid,
          charityWallet,
          totalStaked: ethers.formatEther(totalStaked),
          charityTotalStaked: ethers.formatEther(charityTotalStaked),
          charityUnlocked: ethers.formatEther(charityUnlocked),
          charityLocked: ethers.formatEther(charityLocked),
          isRemoved
        };
        selfStakes.push(data);

        console.log(`🔴 Pool ${pid} - Charity Stake Detected`);
        console.log(`   Charity: ${charityWallet}`);
        console.log(`   Pool Total Staked: ${data.totalStaked} OBN`);
        console.log(`   Charity Total Stake: ${data.charityTotalStaked} OBN`);
        console.log(`   Charity Locked: ${data.charityLocked} OBN (bootstrap)`);
        console.log(`   Charity Unlocked: ${data.charityUnlocked} OBN ${charityUnlocked > 0n ? '⚠️  SELF-STAKE!' : '✅'}`);
        console.log(`   Pool Status: ${isRemoved ? 'REMOVED' : 'ACTIVE'}`);

        if (totalStaked > 0n) {
          const percentOfPool = (charityTotalStaked * 10000n / totalStaked);
          console.log(`   % of Pool: ${Number(percentOfPool) / 100}%`);
        }
        console.log();
      }
    } catch (error) {
      console.log(`Pool ${pid}: Error - ${error.message}`);
    }
  }

  console.log("=====================================");
  if (!selfStakeFound) {
    console.log("✅ No charity stakes found!");
    console.log("All pools have no charity bootstrap or self-stakes.");
  } else {
    const hasUnlockedStakes = selfStakes.some(s => parseFloat(s.charityUnlocked) > 0);

    if (hasUnlockedStakes) {
      console.log(`⚠️  Found ${selfStakes.length} pool(s) with charity stakes`);
      console.log(`⚠️  Some charities have UNLOCKED stakes (self-stakes)!`);
    } else {
      console.log(`✅ Found ${selfStakes.length} pool(s) with charity bootstrap stakes`);
      console.log(`✅ All charity stakes are LOCKED (bootstrap only)`);
    }
    console.log();
    console.log("Note: The v8.9.0 upgrade prevents NEW charity self-stakes.");

    // Summary
    console.log("\nSummary:");
    selfStakes.forEach(({ pid, charityTotalStaked, charityLocked, charityUnlocked, isRemoved }) => {
      const status = parseFloat(charityUnlocked) > 0 ? '⚠️  HAS UNLOCKED' : '✅ LOCKED ONLY';
      console.log(`  Pool ${pid}: ${charityTotalStaked} OBN (${charityLocked} locked) ${status} ${isRemoved ? '(REMOVED)' : ''}`);
    });
  }
  console.log("=====================================");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
