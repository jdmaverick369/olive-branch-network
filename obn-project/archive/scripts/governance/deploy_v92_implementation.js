// scripts/governance/deploy_v92_implementation.js
// Deploy the v9.2 implementation (claimMultiple + pendingRewardsMultiple)
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("=== Deploying StakingPools v9.2 Implementation ===\n");

  const [signer] = await ethers.getSigners();
  console.log("Deployer:", await signer.getAddress());

  // Current v9.1 implementation (for reference)
  const currentImpl = "0x37951A530114421E7a52Edca3837D003d02e56aa";
  console.log("Current v9.1 implementation:", currentImpl);

  const fqName = "contracts/StakingPools.sol:OBNStakingPools";
  const StakingPoolsFactory = await ethers.getContractFactory(fqName);

  console.log("\n📦 Deploying new v9.2 implementation contract...");
  const impl = await StakingPoolsFactory.deploy();
  await impl.waitForDeployment();

  const implAddress = await impl.getAddress();
  console.log("✅ New implementation deployed at:", implAddress);

  // Verify it's different
  if (implAddress.toLowerCase() === currentImpl.toLowerCase()) {
    console.log("\n⚠️ WARNING: Same address as current implementation!");
  } else {
    console.log("\n✅ New implementation address is different from current");
    console.log("   Current (v9.1):", currentImpl);
    console.log("   New (v9.2):    ", implAddress);
  }

  // Check version
  try {
    const version = await impl.version();
    console.log("\n📌 Implementation version:", version);
  } catch (e) {
    console.log("\n⚠️ Could not read version (expected for uninitialized implementation)");
  }

  console.log("\n" + "=".repeat(70));
  console.log("📝 v9.2 NEW FEATURES:");
  console.log("   - claimMultiple(uint256[] pids) - batch claim from multiple pools");
  console.log("   - pendingRewardsMultiple(uint256[] pids, address) - batch pending query");
  console.log("=".repeat(70));

  console.log("\n📝 Next steps:");
  console.log("1. Verify on Basescan: update verify_v92_implementation.js with address");
  console.log("2. Schedule upgrade via Gnosis Safe → Timelock");
  console.log(`3. Implementation address: ${implAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
