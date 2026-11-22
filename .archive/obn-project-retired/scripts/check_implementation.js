// scripts/check_implementation.js
// Quick script to check the current implementation address of a UUPS proxy

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxy = process.env.OBN_STAKING_CONTRACT || process.env.STAKING_POOLS_PROXY;

  if (!proxy) {
    throw new Error("Set OBN_STAKING_CONTRACT or STAKING_POOLS_PROXY in .env");
  }

  console.log("Proxy address:", proxy);

  try {
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxy);
    console.log("Implementation:", implAddress);

    // Try to get version if the contract has one
    try {
      const contract = await ethers.getContractAt("OBNStakingPools", proxy);
      const version = await contract.version();
      console.log("Contract version:", version);
    } catch (e) {
      console.log("(Could not read version field)");
    }

    // Get owner
    try {
      const contract = await ethers.getContractAt("OBNStakingPools", proxy);
      const owner = await contract.owner();
      console.log("Owner:", owner);
    } catch (e) {
      console.log("(Could not read owner)");
    }

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
