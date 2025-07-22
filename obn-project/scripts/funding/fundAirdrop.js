// scripts/fundAirdrop.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding Airdrop/Missions from:", deployer.address);

  const token = await ethers.getContractAt("OBNToken", process.env.OBN_TOKEN_PROXY);
  const airdropAddr = process.env.AIRDROP_WALLET;

  if (!airdropAddr) throw new Error("❌ AIRDROP_WALLET not set in .env!");

  const amount = ethers.parseUnits("100000000", 18); // 100M OBN
  console.log(`⏳ Sending ${ethers.formatUnits(amount, 18)} OBN to Airdrop Wallet: ${airdropAddr}`);

  const tx = await token.transfer(airdropAddr, amount);
  await tx.wait();

  console.log("✅ Airdrop funding complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});