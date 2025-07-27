const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying OBNToken with account:", deployer.address);

  // Retrieve addresses from the environment variables
  const initialOwner = deployer.address;
  const initialSupply = ethers.parseUnits("1000000000", 18); // 1 billion tokens
  const liquidityAddress = process.env.OBN_LIQUIDITY_ADDRESS;
  const airdropAddress = process.env.OBN_AIRDROP_ADDRESS;
  const treasuryAddress = process.env.OBN_TREASURY_ADDRESS;
  const teamVestingAddress = process.env.OBN_TEAM_VESTING_ADDRESS;

  // Check if addresses are provided in the .env file
  if (!liquidityAddress || !airdropAddress || !treasuryAddress || !teamVestingAddress) {
    console.error("❌ Missing one or more addresses in the .env file");
    process.exitCode = 1;
    return;
  }

  // Deploy the OBNToken contract as a proxy
  const OBNToken = await ethers.getContractFactory("OBNToken");
  const proxy = await upgrades.deployProxy(
    OBNToken,
    [
      initialOwner, 
      initialSupply, 
      liquidityAddress, 
      airdropAddress, 
      treasuryAddress, 
      teamVestingAddress
    ], 
    { initializer: "initialize" }
  );

  // Log the deployed contract address
  console.log("✅ OBNToken deployed at:", await proxy.getAddress());
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});