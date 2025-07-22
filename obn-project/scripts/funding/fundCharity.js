// scripts/fundCharity.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding Charity Partnerships from:", deployer.address);

  const token = await ethers.getContractAt("OBNToken", process.env.OBN_TOKEN_PROXY);
  const charityAddr = process.env.CHARITY_WALLET;

  if (!charityAddr) throw new Error("❌ CHARITY_WALLET not set in .env!");

  const amount = ethers.parseUnits("100000000", 18); // 100M OBN
  console.log(`⏳ Sending ${ethers.formatUnits(amount, 18)} OBN to Charity Wallet: ${charityAddr}`);

  const tx = await token.transfer(charityAddr, amount);
  await tx.wait();

  console.log("✅ Charity funding complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
