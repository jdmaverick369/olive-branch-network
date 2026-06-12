// scripts/governance/deploy_04_annual_governance.js
// Phase 3 — Deploy AnnualGovernance as UUPS proxy.
// Required env vars:
//   OFFERING_ADDR     — from deploy_03_the_offering.js
//   EXTENDING_OB_ADDR — from deploy_02_extend_olive_branch.js
// Run: npx hardhat run scripts/governance/deploy_04_annual_governance.js --network base

"use strict";
require("dotenv").config();

const OBN_TOKEN     = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const TIMELOCK      = "0x86396526286769ace21982E798Df5eef2389f51c";
const OPERATOR_SAFE = "0x066e2FABb036deab7DC58bAde428F819AC3542DD";
const MAX_BALLOT    = 100n;
const IMPL_SLOT     = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

function requireAddr(name) {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error(`Missing or invalid env var: ${name}`);
  return v;
}
function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  console.log("=== Phase 3: Deploy AnnualGovernance (UUPS proxy) ===\n");

  const OFFERING_ADDR     = requireAddr("OFFERING_ADDR");
  const EXTENDING_OB_ADDR = requireAddr("EXTENDING_OB_ADDR");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer:          ${deployer.address}`);
  console.log(`Network:           ${hre.network.name}`);
  console.log(`OBN_TOKEN:         ${OBN_TOKEN}`);
  console.log(`STAKING_PROXY:     ${STAKING_PROXY}`);
  console.log(`OFFERING_ADDR:     ${OFFERING_ADDR}`);
  console.log(`EXTENDING_OB_ADDR: ${EXTENDING_OB_ADDR}`);
  console.log(`TIMELOCK:          ${TIMELOCK}`);
  console.log(`OPERATOR_SAFE:     ${OPERATOR_SAFE}`);
  console.log(`MAX_BALLOT:        ${MAX_BALLOT}\n`);

  const Factory = await hre.ethers.getContractFactory("AnnualGovernance");
  console.log("Deploying AnnualGovernance proxy...");
  const proxy = await hre.upgrades.deployProxy(
    Factory,
    [OBN_TOKEN, STAKING_PROXY, OFFERING_ADDR, EXTENDING_OB_ADDR, TIMELOCK, OPERATOR_SAFE, MAX_BALLOT],
    { kind: "uups" }
  );
  await proxy.waitForDeployment();
  const ANNUAL_GOV_PROXY = proxy.target;
  const ANNUAL_GOV_IMPL  = await hre.upgrades.erc1967.getImplementationAddress(ANNUAL_GOV_PROXY);
  console.log(`Proxy:             ${ANNUAL_GOV_PROXY}`);
  console.log(`Implementation:    ${ANNUAL_GOV_IMPL}\n`);

  console.log("Verifying proxy state...");

  const owner = await proxy.owner();
  console.log(`  owner()             = ${owner}`);
  if (!addrEq(owner, TIMELOCK)) hardStop(`owner() returned ${owner} — expected TIMELOCK ${TIMELOCK}.`);
  console.log("                      PASS");

  const stakingPools = await proxy.stakingPools();
  console.log(`  stakingPools()      = ${stakingPools}`);
  if (!addrEq(stakingPools, STAKING_PROXY)) hardStop(`stakingPools() returned ${stakingPools} — expected STAKING_PROXY ${STAKING_PROXY}.`);
  console.log("                      PASS");

  const theOffering = await proxy.theOffering();
  console.log(`  theOffering()       = ${theOffering}`);
  if (!addrEq(theOffering, OFFERING_ADDR)) hardStop(`theOffering() returned ${theOffering} — expected OFFERING_ADDR ${OFFERING_ADDR}.`);
  console.log("                      PASS");

  const extendOliveBranch = await proxy.extendOliveBranch();
  console.log(`  extendOliveBranch() = ${extendOliveBranch}`);
  if (!addrEq(extendOliveBranch, EXTENDING_OB_ADDR)) hardStop(`extendOliveBranch() returned ${extendOliveBranch} — expected EXTENDING_OB_ADDR ${EXTENDING_OB_ADDR}.`);
  console.log("                      PASS");

  const voteAdmin = await proxy.voteAdmin();
  console.log(`  voteAdmin()         = ${voteAdmin}`);
  if (!addrEq(voteAdmin, OPERATOR_SAFE)) hardStop(`voteAdmin() returned ${voteAdmin} — expected OPERATOR_SAFE ${OPERATOR_SAFE}.`);
  console.log("                      PASS");

  const currentCycleId = await proxy.currentCycleId();
  console.log(`  currentCycleId()    = ${currentCycleId}`);
  if (currentCycleId !== 0n) hardStop(`currentCycleId() returned ${currentCycleId} — expected 0.`);
  console.log("                      PASS");

  const maxBallotSize = await proxy.maxBallotSize();
  console.log(`  maxBallotSize()     = ${maxBallotSize}`);
  if (maxBallotSize !== MAX_BALLOT) hardStop(`maxBallotSize() returned ${maxBallotSize} — expected ${MAX_BALLOT}.`);
  console.log("                      PASS");

  console.log("\nVerifying ERC1967 implementation slot...");
  const slotRaw = await hre.ethers.provider.getStorage(ANNUAL_GOV_PROXY, IMPL_SLOT);
  const implFromSlot = hre.ethers.getAddress("0x" + slotRaw.slice(-40));
  console.log(`  ERC1967 slot        = ${implFromSlot}`);
  if (!addrEq(implFromSlot, ANNUAL_GOV_IMPL)) hardStop(`ERC1967 slot contains ${implFromSlot} — expected ANNUAL_GOV_IMPL ${ANNUAL_GOV_IMPL}.`);
  console.log("                      PASS");

  console.log("\nVerifying bare implementation is locked...");
  const impl = Factory.attach(ANNUAL_GOV_IMPL);
  try {
    await impl.initialize.staticCall(
      OBN_TOKEN, STAKING_PROXY, OFFERING_ADDR, EXTENDING_OB_ADDR, TIMELOCK, OPERATOR_SAFE, MAX_BALLOT
    );
    hardStop("AnnualGovernance implementation can be initialized — _disableInitializers() not working.");
  } catch (e) {
    if (e.message?.includes("HARD STOP")) throw e;
    console.log("  initialize() reverts on impl  PASS");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Phase 3 COMPLETE. Record these addresses:\n");
  console.log(`  ANNUAL_GOV_PROXY = ${ANNUAL_GOV_PROXY}`);
  console.log(`  ANNUAL_GOV_IMPL  = ${ANNUAL_GOV_IMPL}`);
  console.log("\nAdd both to .env, then run deploy_05_lens.js");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
