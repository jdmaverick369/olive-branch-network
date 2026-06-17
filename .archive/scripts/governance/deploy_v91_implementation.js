// scripts/governance/deploy_v91_implementation.js
// Manually deploy the v9.1 implementation without using upgrades plugin cache
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("=== Deploying StakingPools v9.1 Implementation ===\n");

  const [signer] = await ethers.getSigners();
  console.log("Deployer:", await signer.getAddress());

  const fqName = "contracts/StakingPools.sol:OBNStakingPools";
  const StakingPoolsFactory = await ethers.getContractFactory(fqName);

  console.log("\n📦 Deploying new implementation contract...");
  const impl = await StakingPoolsFactory.deploy();
  await impl.waitForDeployment();

  const implAddress = await impl.getAddress();
  console.log("✅ New implementation deployed at:", implAddress);

  // Verify it's actually different
  const currentImpl = "0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b";
  if (implAddress.toLowerCase() === currentImpl.toLowerCase()) {
    console.log("\n⚠️ WARNING: Same address as current implementation!");
  } else {
    console.log("\n✅ New implementation address is different from current");
    console.log("   Current:", currentImpl);
    console.log("   New:    ", implAddress);
  }

  // Check version
  try {
    const version = await impl.version();
    console.log("\n📌 Implementation version:", version);
  } catch (e) {
    console.log("\n⚠️  Could not read version (expected for uninitialized implementation)");
  }

  console.log("\n📝 Next steps:");
  console.log("1. Use this implementation address in schedule_upgrade.js");
  console.log("2. Or manually create the timelock proposal with this address");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
