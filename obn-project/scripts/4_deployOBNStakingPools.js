const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying OBNStakingPools with account:", deployer.address);

  // ✅ Match your .env variable names
  const token = process.env.OBN_TOKEN_ADDRESS; // OBN Token address
  const treasury = process.env.OBN_TREASURY_ADDRESS; // Treasury address

  if (!token || !treasury) {
    throw new Error("❌ Missing OBN_TOKEN_ADDRESS or OBN_TREASURY_ADDRESS in .env");
  }
  
  console.log("📦 OBN Token:", token);
  console.log("🏦 Treasury Address:", treasury);

  // ✅ Deploy upgradeable proxy
  const OBNStakingPools = await ethers.getContractFactory("OBNStakingPools");

  // Deploy the proxy contract
  const stakingPools = await upgrades.deployProxy(
    OBNStakingPools,
    [token, treasury], // Pass the required constructor parameters
    { initializer: "initialize", kind: "uups" }
  );

  // Wait for the contract deployment transaction to be mined
  await stakingPools.deployTransaction?.wait(); // safely wait if transaction exists

  // Log the deployed contract address
  const deployedAddress = await stakingPools.getAddress();
  console.log("✅ OBNStakingPools deployed at:", deployedAddress);

  // Explicitly check if the address is properly set after deployment
  if (deployedAddress) {
    console.log("📍 Successfully deployed to address:", deployedAddress);
  } else {
    console.error("❌ Failed to retrieve deployed contract address");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
