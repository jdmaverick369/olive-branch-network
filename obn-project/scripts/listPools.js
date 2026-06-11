// scripts/listPools.js
// Lists all pools with key stats.
// If OBN_LENS_CONTRACT is set, reads from OBNStakingLens (preferred).
// Falls back to direct proxy reads when Lens is not configured.
const { ethers } = require("hardhat");
require("dotenv").config();

const LENS_ABI = [
  "function listPoolsBasic() view returns (address[] charityWallets, uint256[] totals, uint256[] uniqueCounts)",
];

const PROXY_ABI = [
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function uniqueStakersByPool(uint256 pid) view returns (uint256)",
];

async function main() {
  const stakingAddress = process.env.OBN_STAKING_CONTRACT;
  if (!stakingAddress) throw new Error("❌ Missing OBN_STAKING_CONTRACT in .env");

  const lensAddress = process.env.OBN_LENS_CONTRACT;

  let charityWallets, totals, uniqueCounts;

  if (lensAddress) {
    console.log(`🔗 Reading from OBNStakingLens at ${lensAddress}...`);
    const lens = await ethers.getContractAt(LENS_ABI, lensAddress);
    ({ charityWallets, totals, uniqueCounts } = await lens.listPoolsBasic());
  } else {
    console.log(`🔗 Reading directly from StakingPools at ${stakingAddress} (no OBN_LENS_CONTRACT set)...`);
    const proxy = await ethers.getContractAt(PROXY_ABI, stakingAddress);
    const poolCount = Number(await proxy.poolLength());

    charityWallets = [];
    totals         = [];
    uniqueCounts   = [];

    for (let pid = 0; pid < poolCount; pid++) {
      const info = await proxy.getPoolInfo(pid);
      charityWallets.push(info.charityWallet ?? info[0]);
      totals.push(info.totalStaked ?? info[1]);
      try {
        uniqueCounts.push(Number(await proxy.uniqueStakersByPool(pid)));
      } catch {
        uniqueCounts.push(0);
      }
    }
  }

  console.log(`\n📌 Total Pools: ${charityWallets.length}\n`);
  for (let pid = 0; pid < charityWallets.length; pid++) {
    console.log(`🆔 Pool #${pid}`);
    console.log(`   Charity Wallet : ${charityWallets[pid]}`);
    console.log(`   Total Staked   : ${ethers.formatEther(totals[pid] ?? 0n)} OBN`);
    console.log(`   Unique Stakers : ${uniqueCounts[pid] ?? 0}`);
    console.log("-------------------------------------------------------");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
