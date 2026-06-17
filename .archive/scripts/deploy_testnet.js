/**
 * deploy_testnet.js
 * Deploys OBNToken + OBNStakingPools to Base Sepolia for testing.
 *
 * - Both contracts use UUPS proxies
 * - Owner is the deployer EOA (no Gnosis Safe / Timelock on testnet)
 * - All token allocations go to the deployer for convenience
 * - StakingPools is set as the sole minter on OBNToken
 *
 * Usage:
 *   npx hardhat run scripts/deploy_testnet.js --network base_sepolia
 */

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

const INITIAL_SUPPLY = ethers.parseEther("1000000000"); // 1 billion OBN

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  OBN Testnet Deployment — Base Sepolia");
  console.log(`${"=".repeat(60)}`);
  console.log(`  Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`  Deployer : ${deployerAddr}`);
  console.log(`  Balance  : ${ethers.formatEther(balance)} ETH`);
  console.log(`  Supply   : ${ethers.formatEther(INITIAL_SUPPLY)} OBN`);

  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Get Base Sepolia ETH from the faucet first.");
  }

  // ── 1. Deploy OBNToken proxy ──────────────────────────────────────────────
  console.log(`\n[1/4] Deploying OBNToken...`);
  const TokenFactory = await ethers.getContractFactory("OBNToken");
  const token = await upgrades.deployProxy(
    TokenFactory,
    [
      deployerAddr, // initialOwner
      INITIAL_SUPPLY,
      deployerAddr, // liquidityAddress  (40%)
      deployerAddr, // airdropAddress    (30%)
      deployerAddr, // charityAddress    (10%)
      deployerAddr, // treasuryAddress   (10%)
      deployerAddr, // teamVestingAddress (10%)
    ],
    { kind: "uups" }
  );
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`      ✅ OBNToken proxy : ${tokenAddr}`);

  // ── 2. Deploy StakingPools proxy ─────────────────────────────────────────
  console.log(`\n[2/4] Deploying OBNStakingPools...`);
  const StakingFactory = await ethers.getContractFactory("OBNStakingPools");
  const staking = await upgrades.deployProxy(
    StakingFactory,
    [
      tokenAddr,    // stakingToken
      deployerAddr, // treasury
      deployerAddr, // charityFund
    ],
    { kind: "uups" }
  );
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(`      ✅ StakingPools proxy : ${stakingAddr}`);

  // ── 3. Set StakingPools as the sole minter on OBNToken ───────────────────
  console.log(`\n[3/4] Setting StakingPools as minter on OBNToken...`);
  const currentMinter = await token.minter();
  if (currentMinter === ethers.ZeroAddress) {
    const tx = await token.setMinterOnce(stakingAddr);
    await tx.wait();
    console.log(`      ✅ Minter set to StakingPools`);
  } else if (currentMinter.toLowerCase() === stakingAddr.toLowerCase()) {
    console.log(`      ✅ Minter already set to StakingPools (skipped)`);
  } else {
    throw new Error(`Minter conflict: token minter is ${currentMinter}, expected ${stakingAddr}`);
  }

  // ── 4. Verify phase schedule ──────────────────────────────────────────────
  console.log(`\n[4/4] Verifying phase schedule...`);
  let i = 0;
  for (;;) {
    try {
      const [start, end, bps] = await staking.phases(i);
      console.log(`      Phase ${i + 1}: ${(Number(bps) / 100).toFixed(2)}% APY — starts ${new Date(Number(start) * 1000).toUTCString()}`);
      i++;
    } catch {
      break;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`${"=".repeat(60)}`);
  console.log(`\n  Add these to your .env:\n`);
  console.log(`  OBN_TOKEN_CONTRACT_TESTNET=${tokenAddr}`);
  console.log(`  OBN_STAKING_CONTRACT_TESTNET=${stakingAddr}`);
  console.log(`\n  Verify on Basescan Sepolia:`);
  console.log(`    npx hardhat verify --network base_sepolia ${tokenAddr}`);
  console.log(`    npx hardhat verify --network base_sepolia ${stakingAddr}`);
  console.log(`\n  Owner of both contracts: ${deployerAddr} (deployer EOA)`);
  console.log(`  Minter on OBNToken     : ${stakingAddr}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
