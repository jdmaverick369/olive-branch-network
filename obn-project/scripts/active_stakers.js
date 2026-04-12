/**
 * active_stakers.js
 * Reads global and per-pool active staker counts from StakingPools.
 *
 * Usage:
 *   npx hardhat run scripts/active_stakers.js --network base
 */

require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_ABI = [
  "function poolLength() view returns (uint256)",
  "function uniqueStakersGlobal() view returns (uint256)",
  "function uniqueStakersByPool(uint256 pid) view returns (uint256)",
  "function globalTotalStaked() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
];

const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
];

function mustAddr(val, name) {
  if (!val || !/^0x[a-fA-F0-9]{40}$/.test(val)) {
    throw new Error(`❌ Missing or invalid address for ${name}: "${val}"`);
  }
  return val;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`\n🌐 Network: ${network.name} (chainId ${network.chainId})`);

  const STAKING = mustAddr(process.env.OBN_STAKING_CONTRACT, "OBN_STAKING_CONTRACT");
  const TOKEN   = mustAddr(process.env.OBN_TOKEN_CONTRACT,   "OBN_TOKEN_CONTRACT");

  const [signer] = await ethers.getSigners();
  const staking  = new ethers.Contract(STAKING, STAKING_ABI, signer);
  const token    = new ethers.Contract(TOKEN,   TOKEN_ABI,   signer);

  const decimals       = await token.decimals();
  const globalStakers  = await staking.uniqueStakersGlobal();
  const globalStaked   = await staking.globalTotalStaked();
  const poolCount      = await staking.poolLength();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  GLOBAL`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Active stakers : ${globalStakers.toString()}`);
  console.log(`  Total staked   : ${ethers.formatUnits(globalStaked, decimals)} OBN`);
  console.log(`  Pools          : ${poolCount.toString()}`);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  PER POOL`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (let pid = 0; pid < Number(poolCount); pid++) {
    const [charityWallet, totalStaked] = await staking.getPoolInfo(pid);
    const uniqueStakers = await staking.uniqueStakersByPool(pid);
    console.log(
      `  PID ${pid.toString().padEnd(3)} | stakers: ${uniqueStakers.toString().padEnd(6)} | staked: ${ethers.formatUnits(totalStaked, decimals).padEnd(20)} OBN | charity: ${charityWallet}`
    );
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
