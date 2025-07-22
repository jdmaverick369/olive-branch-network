require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying TeamVesting with account:", deployer.address);

  const tokenAddress = process.env.OBN_TOKEN_PROXY;
  if (!tokenAddress) throw new Error("❌ OBN_TOKEN_PROXY not set in .env");

  const teamWallet = process.env.VESTING_WALLET;
  if (!teamWallet) throw new Error("❌ VESTING_WALLET not set in .env");

  const startTimestamp = Math.floor(Date.now() / 1000);
  const initialOwner = deployer.address; // or any address you want as owner

  console.log("Using parameters:");
  console.log("Token (OBN proxy):", tokenAddress);
  console.log("Vesting wallet:", teamWallet);
  console.log("Start timestamp:", startTimestamp);
  console.log("Initial owner:", initialOwner);

  const TeamVesting = await ethers.getContractFactory("TeamVesting");
  const vesting = await TeamVesting.deploy(
    tokenAddress,
    teamWallet,
    startTimestamp,
    initialOwner
  );
  await vesting.waitForDeployment();

  console.log("✅ TeamVesting deployed successfully!");
  console.log("TeamVesting address:", await vesting.getAddress());
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});