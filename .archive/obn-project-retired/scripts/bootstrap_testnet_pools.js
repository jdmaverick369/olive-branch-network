/**
 * bootstrap_testnet_pools.js
 * Seeds each testnet pool with 1,000,000 OBN via charityFundBootstrap.
 *
 * Prerequisites:
 *   - All pools must already be added (run add_testnet_pools.js first)
 *   - Deployer must be the charityFund on the testnet StakingPools
 *   - Deployer must hold enough OBN (11,000,000 total)
 *
 * Usage:
 *   npx hardhat run scripts/bootstrap_testnet_pools.js --network base_sepolia
 */

require("dotenv").config();
const { ethers } = require("hardhat");

const TOKEN_ADDR   = process.env.OBN_TOKEN_CONTRACT_TESTNET;
const STAKING_ADDR = process.env.OBN_STAKING_CONTRACT_TESTNET;
const AMOUNT_EACH  = ethers.parseEther("1000000"); // 1,000,000 OBN

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

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const STAKING_ABI = [
  "function charityFund() view returns (address)",
  "function poolLength() view returns (uint256)",
  "function poolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary) external",
];

async function main() {
  if (!TOKEN_ADDR)   throw new Error("OBN_TOKEN_CONTRACT_TESTNET not set in .env");
  if (!STAKING_ADDR) throw new Error("OBN_STAKING_CONTRACT_TESTNET not set in .env");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  const token   = new ethers.Contract(TOKEN_ADDR,   TOKEN_ABI,   deployer);
  const staking = new ethers.Contract(STAKING_ADDR, STAKING_ABI, deployer);

  const [charityFund, poolLength, balance] = await Promise.all([
    staking.charityFund(),
    staking.poolLength(),
    token.balanceOf(deployerAddr),
  ]);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Bootstrap Testnet Pools — Base Sepolia");
  console.log(`${"=".repeat(60)}`);
  console.log(`  Token        : ${TOKEN_ADDR}`);
  console.log(`  StakingPools : ${STAKING_ADDR}`);
  console.log(`  Deployer     : ${deployerAddr}`);
  console.log(`  charityFund  : ${charityFund}`);
  console.log(`  OBN balance  : ${ethers.formatEther(balance)} OBN`);
  console.log(`  Pool count   : ${poolLength}`);

  if (charityFund.toLowerCase() !== deployerAddr.toLowerCase()) {
    throw new Error(`Deployer is not the charityFund. charityFund=${charityFund}`);
  }
  if (Number(poolLength) < CHARITY_WALLETS.length) {
    throw new Error(`Only ${poolLength} pools exist — run add_testnet_pools.js first`);
  }

  const totalNeeded = AMOUNT_EACH * BigInt(CHARITY_WALLETS.length);
  if (balance < totalNeeded) {
    throw new Error(
      `Insufficient OBN. Need ${ethers.formatEther(totalNeeded)}, have ${ethers.formatEther(balance)}`
    );
  }

  // Approve staking contract if allowance is insufficient
  const allowance = await token.allowance(deployerAddr, STAKING_ADDR);
  if (allowance < totalNeeded) {
    process.stdout.write(`\n  Approving ${ethers.formatEther(totalNeeded)} OBN to StakingPools ... `);
    const approveTx = await token.approve(STAKING_ADDR, totalNeeded);
    await approveTx.wait();
    console.log(`✅`);
  } else {
    console.log(`\n  Allowance already sufficient (${ethers.formatEther(allowance)} OBN)`);
  }

  console.log();

  for (let pid = 0; pid < CHARITY_WALLETS.length; pid++) {
    const { charityWallet, totalStaked } = await staking.poolInfo(pid);

    // Skip if already bootstrapped
    if (totalStaked >= AMOUNT_EACH) {
      console.log(`  [${pid + 1}/${CHARITY_WALLETS.length}] PID ${pid} already has ${ethers.formatEther(totalStaked)} OBN staked — skipped`);
      continue;
    }

    process.stdout.write(`  [${pid + 1}/${CHARITY_WALLETS.length}] bootstrap(pid=${pid}, charity=${charityWallet}) ... `);
    const tx = await staking.charityFundBootstrap(pid, AMOUNT_EACH, charityWallet);
    await tx.wait();
    console.log(`✅  (tx: ${tx.hash})`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  DONE — all pools bootstrapped with 1,000,000 OBN each");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
