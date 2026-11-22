// scripts/governance/deploy_03_the_offering.js
// Phase 2b — Deploy TheOffering (non-upgradeable vault).
// Required env vars:
//   EXTENDING_OB_ADDR — from deploy_02_extend_olive_branch.js
// Run: npx hardhat run scripts/governance/deploy_03_the_offering.js --network base

"use strict";
require("dotenv").config();

const OBN_TOKEN = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
const TIMELOCK  = "0x86396526286769ace21982E798Df5eef2389f51c";
const ZERO      = "0x0000000000000000000000000000000000000000";

function requireAddr(name) {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error(`Missing or invalid env var: ${name}`);
  return v;
}
function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  console.log("=== Phase 2b: Deploy TheOffering ===\n");

  const EXTENDING_OB_ADDR = requireAddr("EXTENDING_OB_ADDR");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer:          ${deployer.address}`);
  console.log(`Network:           ${hre.network.name}`);
  console.log(`OBN_TOKEN:         ${OBN_TOKEN}`);
  console.log(`EXTENDING_OB_ADDR: ${EXTENDING_OB_ADDR}`);
  console.log(`TIMELOCK:          ${TIMELOCK}\n`);

  const Factory = await hre.ethers.getContractFactory("TheOffering");
  console.log("Deploying TheOffering...");
  const contract = await Factory.deploy(OBN_TOKEN, EXTENDING_OB_ADDR, TIMELOCK);
  await contract.waitForDeployment();
  const OFFERING_ADDR = contract.target;
  console.log(`Deployed:          ${OFFERING_ADDR}\n`);

  console.log("Verifying on-chain state...");

  const obn = await contract.obn();
  console.log(`  obn()               = ${obn}`);
  if (!addrEq(obn, OBN_TOKEN)) hardStop(`obn() returned ${obn} — expected OBN_TOKEN ${OBN_TOKEN}. This is an immutable — contract must be redeployed.`);
  console.log("                      PASS");

  const extendOliveBranch = await contract.extendOliveBranch();
  console.log(`  extendOliveBranch() = ${extendOliveBranch}`);
  if (!addrEq(extendOliveBranch, EXTENDING_OB_ADDR)) hardStop(`extendOliveBranch() returned ${extendOliveBranch} — expected EXTENDING_OB_ADDR ${EXTENDING_OB_ADDR}. This is an immutable — contract must be redeployed.`);
  console.log("                      PASS");

  const timelockOwner = await contract.timelockOwner();
  console.log(`  timelockOwner()     = ${timelockOwner}`);
  if (!addrEq(timelockOwner, TIMELOCK)) hardStop(`timelockOwner() returned ${timelockOwner} — expected TIMELOCK ${TIMELOCK}.`);
  console.log("                      PASS");

  const governance = await contract.governance();
  console.log(`  governance()        = ${governance}`);
  if (!addrEq(governance, ZERO)) hardStop(`governance() returned ${governance} — expected address(0). Governance must not be set at deployment.`);
  console.log("                      PASS (not yet wired — correct)");

  console.log("\n" + "=".repeat(60));
  console.log("Phase 2b COMPLETE. Record this address:\n");
  console.log(`  OFFERING_ADDR = ${OFFERING_ADDR}`);
  console.log("\nAdd OFFERING_ADDR to .env, then run deploy_04_annual_governance.js");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
