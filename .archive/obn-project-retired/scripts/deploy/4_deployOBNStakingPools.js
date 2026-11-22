// scripts/4_deployOBNStakingPools.js
const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const {
    OBN_TOKEN_CONTRACT,        // ERC20 that implements IOBNMintable
    OBN_TREASURY_ADDRESS,      // receives 1%
    OBN_CHARITY_FUND_ADDRESS,  // receives 1%
  } = process.env;

  const req = (v, name) => {
    if (!v || v === "" || v === "0x0000000000000000000000000000000000000000") {
      throw new Error(`❌ Missing/invalid ${name} in .env`);
    }
  };
  req(OBN_TOKEN_CONTRACT, "OBN_TOKEN_CONTRACT");
  req(OBN_TREASURY_ADDRESS, "OBN_TREASURY_ADDRESS");
  req(OBN_CHARITY_FUND_ADDRESS, "OBN_CHARITY_FUND_ADDRESS");

  console.log("⚙️  Using:");
  console.log("   staking token :", OBN_TOKEN_CONTRACT);
  console.log("   treasury      :", OBN_TREASURY_ADDRESS);
  console.log("   charity fund  :", OBN_CHARITY_FUND_ADDRESS);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("OBNStakingPools");

  // Deploy UUPS proxy with 3-arg initializer
  const proxy = await upgrades.deployProxy(
    Factory,
    [OBN_TOKEN_CONTRACT, OBN_TREASURY_ADDRESS, OBN_CHARITY_FUND_ADDRESS],
    { kind: "uups", initializer: "initialize" }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("✅ OBNStakingPools successfully deployed at:", proxyAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
