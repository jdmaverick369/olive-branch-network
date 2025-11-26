// scripts/governance/verify_implementation_basescan.js
// Verifies the new EIP-1271 implementation on BaseScan

require("dotenv").config();
const { execSync } = require("child_process");

async function main() {
  console.log("=== VERIFYING EIP-1271 IMPLEMENTATION ON BASESCAN ===\n");

  // Implementation address from deployment
  const IMPLEMENTATION_ADDRESS = "0xb3bE63923f91Ba2EaE263139E9622cC57003D308";
  const CONTRACT_NAME = "OBNStakingPools";

  console.log("Implementation Address:", IMPLEMENTATION_ADDRESS);
  console.log("Contract Name:         ", CONTRACT_NAME);
  console.log();

  console.log("Running hardhat verify...");
  console.log();

  try {
    // Use hardhat verify to submit to BaseScan
    const command = `npx hardhat verify --network base "${IMPLEMENTATION_ADDRESS}" --contract "contracts/${CONTRACT_NAME}.sol:${CONTRACT_NAME}"`;

    console.log("Command:", command);
    console.log();

    execSync(command, { stdio: "inherit" });

    console.log();
    console.log("=".repeat(70));
    console.log("✅ VERIFICATION SUBMITTED TO BASESCAN");
    console.log("=".repeat(70));
    console.log();
    console.log("Next Steps:");
    console.log();
    console.log("1. WAIT FOR BASESCAN INDEXING");
    console.log("   - BaseScan will process the verification");
    console.log("   - Usually takes 2-5 minutes");
    console.log();
    console.log("2. CHECK BASESCAN");
    console.log(`   https://basescan.org/address/${IMPLEMENTATION_ADDRESS}`);
    console.log();
    console.log("3. VERIFY NEW FUNCTIONS ARE LISTED");
    console.log("   - depositWithSignature");
    console.log("   - depositWithSignatureAndLock");
    console.log("   - domainSeparator");
    console.log("   - getDepositSignatureDigest");
    console.log();

  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    console.error();
    console.error("Troubleshooting:");
    console.error("1. Check BASESCAN_API_KEY in .env");
    console.error("2. Ensure contract address is correct");
    console.error("3. Try again in a few minutes (deployment might not be indexed yet)");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exitCode = 1;
});
