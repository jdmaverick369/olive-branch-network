// scripts/deploy_airdropper.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const tokenAddress = process.env.OBN_TOKEN_CONTRACT;

  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("❌ Invalid OBN token address. Check .env");
  }

  console.log("🚀 Deploying OBNAirdropper with deployer:", deployer.address);
  console.log("🔗 Token address:", tokenAddress);

  const Airdropper = await ethers.getContractFactory("OBNAirdropper");
  const airdropper = await Airdropper.deploy(tokenAddress);

  await airdropper.waitForDeployment();
  const contractAddress = await airdropper.getAddress();

  console.log("✅ OBNAirdropper deployed at:", contractAddress);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
