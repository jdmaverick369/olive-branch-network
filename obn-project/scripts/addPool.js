// scripts/addPool.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const stakingAddress = process.env.STAKING_CONTRACT;

  if (!stakingAddress) {
    throw new Error("❌ Missing STAKING_CONTRACT in .env");
  }

  // You can either:
  // 1. Use a wallet from .env:
  // const charityWallet = process.env.NEW_CHARITY_WALLET1;
  // OR
  // 2. Pass it as an argument: npx hardhat run scripts/addPool.js --network base_sepolia --address <charityWallet>
  const args = process.argv.slice(2);
  let charityWallet = args.find(a => a.startsWith("--address="));
  charityWallet = charityWallet ? charityWallet.split("=")[1] : process.env.PID_0;

  if (!charityWallet || charityWallet === "") {
    throw new Error("❌ No charity wallet provided! Set CHARITY_WALLET in .env or pass --address=<wallet>");
  }

  console.log(`Adding pool with account: ${deployer.address}`);
  console.log(`⏳ Adding pool for ${charityWallet}...`);

  const staking = await ethers.getContractAt("StakingPools", stakingAddress);
  const tx = await staking.addPool(charityWallet);
  await tx.wait();

  console.log(`✅ Pool added for charity wallet: ${charityWallet}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});