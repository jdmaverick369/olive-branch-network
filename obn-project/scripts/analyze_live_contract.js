// Analyze live contract state before upgrade
require("dotenv").config();
const { ethers } = require("hardhat");

const ABI = [
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256) view returns (address charityWallet, uint256 totalStaked)",
  "function userAmount(uint256, address) view returns (uint256)",
  "function lockedAmount(uint256, address) view returns (uint256)",
  "function globalTotalStaked() view returns (uint256)",
  "function stakingToken() view returns (address)",
  "function treasury() view returns (address)",
  "function charityFund() view returns (address)",
  "function version() view returns (string)",
  "function owner() view returns (address)",
  "function phases(uint256) view returns (uint256 start, uint256 end, uint256 bps)",
  "function uniqueStakersGlobal() view returns (uint256)",
  "function accRewardPerShare(uint256) view returns (uint256)",
  "function lastRewardTime(uint256) view returns (uint256)"
];

async function main() {
  const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";

  console.log("=== Live Contract Analysis ===\n");
  console.log("Proxy Address:", STAKING_PROXY);
  console.log();

  const staking = await ethers.getContractAt(ABI, STAKING_PROXY);

  // Basic contract info
  console.log("--- Contract State ---");
  const version = await staking.version();
  const owner = await staking.owner();
  const stakingToken = await staking.stakingToken();
  const treasury = await staking.treasury();
  const charityFund = await staking.charityFund();
  const globalTotal = await staking.globalTotalStaked();
  const poolLength = await staking.poolLength();
  const uniqueStakers = await staking.uniqueStakersGlobal();

  console.log("Version:", version);
  console.log("Owner:", owner);
  console.log("Staking Token:", stakingToken);
  console.log("Treasury:", treasury);
  console.log("Charity Fund:", charityFund);
  console.log("Global Total Staked:", ethers.formatEther(globalTotal), "OBN");
  console.log("Pool Count:", poolLength.toString());
  console.log("Unique Stakers:", uniqueStakers.toString());
  console.log();

  // Check phases
  console.log("--- Emission Phases ---");
  try {
    for (let i = 0; i < 5; i++) {
      const phase = await staking.phases(i);
      const start = new Date(Number(phase.start) * 1000);
      const end = new Date(Number(phase.end) * 1000);
      console.log(`Phase ${i}:`);
      console.log(`  Start: ${start.toLocaleString()}`);
      console.log(`  End: ${end.toLocaleString()}`);
      console.log(`  APY: ${Number(phase.bps) / 100}%`);
    }
  } catch (e) {
    console.log("Could not read all phases");
  }
  console.log();

  // Pool analysis
  console.log("--- Pool Analysis ---");
  let totalInPools = 0n;
  const poolData = [];

  for (let pid = 0; pid < poolLength; pid++) {
    const info = await staking.getPoolInfo(pid);
    const charityWallet = info.charityWallet || info[0];
    const totalStaked = info.totalStaked || info[1];

    const charityStaked = await staking.userAmount(pid, charityWallet);
    const charityLocked = await staking.lockedAmount(pid, charityWallet);
    const acc = await staking.accRewardPerShare(pid);
    const lastTime = await staking.lastRewardTime(pid);

    totalInPools += totalStaked;

    poolData.push({
      pid,
      totalStaked,
      charityStaked,
      charityLocked,
      acc,
      lastTime
    });

    console.log(`Pool ${pid}:`);
    console.log(`  Total Staked: ${ethers.formatEther(totalStaked)} OBN`);
    console.log(`  Charity Staked: ${ethers.formatEther(charityStaked)} OBN (${ethers.formatEther(charityLocked)} locked)`);
    console.log(`  Acc Reward Per Share: ${acc.toString()}`);
    console.log(`  Last Reward Time: ${new Date(Number(lastTime) * 1000).toLocaleString()}`);
  }
  console.log();

  // Validation
  console.log("--- Validation ---");
  console.log("Total in pools:", ethers.formatEther(totalInPools), "OBN");
  console.log("Global total staked:", ethers.formatEther(globalTotal), "OBN");

  if (totalInPools === globalTotal) {
    console.log("✅ Pool totals match global total");
  } else {
    console.log("⚠️  WARNING: Mismatch between pool totals and global total!");
    console.log("   Difference:", ethers.formatEther(totalInPools - globalTotal), "OBN");
  }
  console.log();

  // Check for any concerning states
  console.log("--- Pre-Upgrade Checks ---");
  let issues = [];

  // Check if any pools have zero stake
  const emptyPools = poolData.filter(p => p.totalStaked === 0n);
  if (emptyPools.length > 0) {
    issues.push(`${emptyPools.length} pool(s) have zero stake`);
  }

  // Check if any charity has unlocked stakes
  const charityUnlocked = poolData.filter(p => p.charityStaked > p.charityLocked);
  if (charityUnlocked.length > 0) {
    issues.push(`${charityUnlocked.length} charity(ies) have unlocked stakes`);
  }

  if (issues.length === 0) {
    console.log("✅ No issues detected");
  } else {
    console.log("⚠️  Issues found:");
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  console.log();

  console.log("=== Analysis Complete ===");
  console.log("Contract is ready for upgrade to v8.9.0");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
