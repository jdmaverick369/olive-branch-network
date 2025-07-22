require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OBNToken proxy with account:", deployer.address);

  const OBNToken = await ethers.getContractFactory("OBNToken");

  // Initial supply: 1,000,000,000 OBN (adjust decimals)
  const initialSupply = ethers.parseUnits("1000000000", 18);

  // Deploy via proxy
  const proxy = await upgrades.deployProxy(
    OBNToken,
    [deployer.address, initialSupply],
    { initializer: "initialize" }
  );
  await proxy.waitForDeployment();

  console.log("✅ OBNToken proxy deployed at:", await proxy.getAddress());
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});