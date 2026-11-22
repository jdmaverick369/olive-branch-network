/**
 * add_testnet_pools.js
 * Adds all 11 charity pools to the testnet StakingPools contract.
 *
 * Usage:
 *   npx hardhat run scripts/add_testnet_pools.js --network base_sepolia
 */

require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_ADDR = process.env.OBN_STAKING_CONTRACT_TESTNET;

const CHARITY_WALLETS = [
  process.env.PID_0,
  process.env.PID_1,
  process.env.PID_2,
  process.env.PID_3,
  process.env.PID_4,
  process.env.PID_5,
  process.env.PID_6,
  process.env.PID_7,
  process.env.PID_8,
  process.env.PID_9,
  process.env.PID_10,
];

const ABI = [
  "function addPool(address charityWallet) external",
  "function poolInfo(uint256) view returns (address charityWallet, uint256 totalStaked)",
];

async function main() {
  if (!STAKING_ADDR) throw new Error("OBN_STAKING_CONTRACT_TESTNET not set in .env");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Add Testnet Pools — Base Sepolia");
  console.log(`${"=".repeat(60)}`);
  console.log(`  StakingPools : ${STAKING_ADDR}`);
  console.log(`  Deployer     : ${deployerAddr}`);
  console.log(`  Balance      : ${ethers.formatEther(balance)} ETH`);
  console.log(`  Pools to add : ${CHARITY_WALLETS.length}`);

  const staking = new ethers.Contract(STAKING_ADDR, ABI, deployer);

  // Determine how many pools already exist by probing
  let startPid = 0;
  for (;;) {
    try {
      await staking.poolInfo(startPid);
      startPid++;
    } catch {
      break;
    }
  }

  if (startPid > 0) {
    console.log(`\n  ${startPid} pool(s) already exist — resuming from PID ${startPid}`);
  }

  if (startPid >= CHARITY_WALLETS.length) {
    console.log(`\n  All ${CHARITY_WALLETS.length} pools already added. Nothing to do.`);
    return;
  }

  console.log();

  for (let pid = startPid; pid < CHARITY_WALLETS.length; pid++) {
    const charity = CHARITY_WALLETS[pid];
    if (!charity) throw new Error(`PID_${pid} missing from .env`);

    process.stdout.write(`  [${pid + 1}/${CHARITY_WALLETS.length}] addPool(${charity}) ... `);
    const tx = await staking.addPool(charity);
    await tx.wait();
    console.log(`✅  (tx: ${tx.hash})`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  DONE — all pools added");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
