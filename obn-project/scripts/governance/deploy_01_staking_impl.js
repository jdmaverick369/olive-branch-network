// scripts/governance/deploy_01_staking_impl.js
// Phase 1 — Deploy StakingPoolsV93 bare implementation (no proxy, no constructor args).
// Run: npx hardhat run scripts/governance/deploy_01_staking_impl.js --network base

"use strict";
require("dotenv").config();

const ZERO = "0x0000000000000000000000000000000000000000";

function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  console.log("=== Phase 1: Deploy StakingPoolsV93 implementation ===\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  ${hre.network.name}\n`);

  const Factory = await hre.ethers.getContractFactory("OBNStakingPools");
  console.log("Deploying StakingPoolsV93...");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const V93_IMPL = impl.target;
  console.log(`Deployed: ${V93_IMPL}\n`);

  console.log("Verifying on-chain state...");

  const version = await impl.version();
  console.log(`  version()  = "${version}"`);
  // Bare implementation has _disableInitializers() only in its constructor — version is never
  // set on the impl's own storage. An empty string here confirms the correct uninitialized state.
  // version == "9.3" only becomes true on the PROXY after migrateV93() runs.
  if (version !== "") hardStop(`version() returned "${version}" — expected "" (uninitialized bare impl). Wrong bytecode or initialize() was accidentally called.`);
  console.log("             PASS (uninitialized — correct for bare impl)");

  const owner = await impl.owner();
  console.log(`  owner()    = ${owner}`);
  if (!addrEq(owner, ZERO)) hardStop(`owner() returned ${owner} — expected address(0). A privileged address on a bare implementation is a deployment error.`);
  console.log("             PASS");

  console.log("\n" + "=".repeat(60));
  console.log("Phase 1 COMPLETE. Record this address:\n");
  console.log(`  V93_IMPL = ${V93_IMPL}`);
  console.log("\nAdd V93_IMPL to .env, then run deploy_02_extend_olive_branch.js");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
