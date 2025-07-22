// scripts/fundTreasury.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding Treasury Reserve from:", deployer.address);

  const token = await ethers.getContractAt("OBNToken", process.env.OBN_TOKEN_PROXY);
  const treasuryAddr = process.env.TREASURY_ADDRESS;

  if (!treasuryAddr) throw new Error("❌ TREASURY_ADDRESS not set in .env!");

  const amount = ethers.parseUnits("100000000", 18); // 100M OBN
  console.log(`⏳ Sending ${ethers.formatUnits(amount, 18)} OBN to Treasury: ${treasuryAddr}`);

  const tx = await token.transfer(treasuryAddr, amount);
  await tx.wait();

  console.log("✅ Treasury funding complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
