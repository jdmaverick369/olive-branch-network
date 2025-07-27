const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying TeamVesting contract...");

  const [deployer] = await ethers.getSigners();
  console.log("📦 Deployer:", deployer.address);

  // TeamVesting parameters
  const tokenAddress = process.env.OBN_TOKEN_ADDRESS; // OBN Token address from .env
  const teamWallet = process.env.OBN_TEAM_VESTING_ADDRESS; // Team wallet address from .env
  const startTimestamp = Math.floor(Date.now() / 1000); // Start timestamp (current time)
  const initialOwner = deployer.address; // Initial owner (deployer's address)

  // Check if environment variables are provided correctly
  if (!tokenAddress || !teamWallet) {
    throw new Error("❌ Missing token or team wallet address in .env");
  }

  // Verify if the contract already exists at the given address
  const code = await ethers.provider.getCode(teamWallet);
  if (code !== "0x") {
    console.log("✅ TeamVesting contract already deployed at:", teamWallet);
    const teamVesting = await ethers.getContractAt("TeamVesting", teamWallet);
    console.log("🎉 Interacting with existing TeamVesting contract!");
    return;
  }

  // Get the contract factory for TeamVesting
  const TeamVesting = await ethers.getContractFactory("TeamVesting");

  // Deploy the contract as an upgradeable contract using UUPS
  const teamVesting = await upgrades.deployProxy(
    TeamVesting,
    [tokenAddress, teamWallet, startTimestamp, initialOwner], // Ensure all arguments are passed here
    { initializer: "initialize" }
  );

  // Ensure the contract is deployed successfully before calling wait()
  if (teamVesting.deployTransaction) {
    const receipt = await teamVesting.deployTransaction.wait();

    // Log the contract address after deployment
    console.log("✅ TeamVesting deployed at:", teamVesting.address);

    // Optionally log the transaction receipt
    console.log("Transaction Receipt:", receipt);

    console.log("🎉 TeamVesting contract deployed successfully!");
  } else {
    console.error("❌ Deployment failed: deployTransaction is not available.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
