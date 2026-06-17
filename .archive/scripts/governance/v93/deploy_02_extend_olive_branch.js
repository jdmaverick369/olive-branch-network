// scripts/governance/deploy_02_extend_olive_branch.js
// Phase 2a — Deploy ExtendOliveBranch (non-upgradeable vault).
// No new env vars required — confirmed mainnet addresses are hardcoded.
// Run: npx hardhat run scripts/governance/deploy_02_extend_olive_branch.js --network base

"use strict";
require("dotenv").config();

const OBN_TOKEN = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
const TIMELOCK  = "0x86396526286769ace21982E798Df5eef2389f51c";
const ZERO      = "0x0000000000000000000000000000000000000000";

function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  console.log("=== Phase 2a: Deploy ExtendOliveBranch ===\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Network:   ${hre.network.name}`);
  console.log(`OBN_TOKEN: ${OBN_TOKEN}`);
  console.log(`TIMELOCK:  ${TIMELOCK}\n`);

  const Factory = await hre.ethers.getContractFactory("ExtendOliveBranch");
  console.log("Deploying ExtendOliveBranch...");
  const contract = await Factory.deploy(OBN_TOKEN, TIMELOCK);
  await contract.waitForDeployment();
  const EXTENDING_OB_ADDR = contract.target;
  console.log(`Deployed:  ${EXTENDING_OB_ADDR}\n`);

  console.log("Verifying on-chain state...");

  const obn = await contract.obn();
  console.log(`  obn()           = ${obn}`);
  if (!addrEq(obn, OBN_TOKEN)) hardStop(`obn() returned ${obn} — expected OBN_TOKEN ${OBN_TOKEN}. This is an immutable — contract must be redeployed.`);
  console.log("                  PASS");

  const timelockOwner = await contract.timelockOwner();
  console.log(`  timelockOwner() = ${timelockOwner}`);
  if (!addrEq(timelockOwner, TIMELOCK)) hardStop(`timelockOwner() returned ${timelockOwner} — expected TIMELOCK ${TIMELOCK}.`);
  console.log("                  PASS");

  const governance = await contract.governance();
  console.log(`  governance()    = ${governance}`);
  if (!addrEq(governance, ZERO)) hardStop(`governance() returned ${governance} — expected address(0). Governance must not be set at deployment.`);
  console.log("                  PASS (not yet wired — correct)");

  console.log("\n" + "=".repeat(60));
  console.log("Phase 2a COMPLETE. Record this address:\n");
  console.log(`  EXTENDING_OB_ADDR = ${EXTENDING_OB_ADDR}`);
  console.log("\nAdd EXTENDING_OB_ADDR to .env, then run deploy_03_the_offering.js");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
