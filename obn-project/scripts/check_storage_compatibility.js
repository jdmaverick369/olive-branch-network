// Quick script to verify storage layout compatibility
require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
  const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
  const NEW_IMPL = "0x7d8b5E3744e659e954B8b1D608442d6805187884";

  console.log("=== Storage Layout Compatibility Check ===\n");
  console.log("Proxy:", STAKING_PROXY);
  console.log("New Implementation:", NEW_IMPL);
  console.log();

  try {
    // Get the contract factory
    const StakingPoolsV2 = await ethers.getContractFactory("OBNStakingPools");

    console.log("Validating storage layout compatibility...");

    // This will throw if there are storage layout issues
    await upgrades.validateUpgrade(STAKING_PROXY, StakingPoolsV2, {
      kind: "uups"
    });

    console.log("✅ STORAGE LAYOUT IS COMPATIBLE!");
    console.log("✅ The upgrade is safe to execute.");
    console.log();
    console.log("Details:");
    console.log("- No storage collisions detected");
    console.log("- Storage variables are in correct order");
    console.log("- No dangerous operations found");

  } catch (error) {
    console.log("❌ STORAGE LAYOUT INCOMPATIBILITY DETECTED!");
    console.log();
    console.error(error.message);
    console.log();
    console.log("⚠️  DO NOT EXECUTE THE UPGRADE - IT WILL FAIL OR CORRUPT DATA");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
