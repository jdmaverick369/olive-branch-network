// scripts/governance/deploy_05_lens.js
// Phase 4 — Deploy OBNStakingLens as UUPS proxy.
// No new env vars required — confirmed mainnet addresses are hardcoded.
// Run: npx hardhat run scripts/governance/deploy_05_lens.js --network base

"use strict";
require("dotenv").config();

const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const TIMELOCK      = "0x86396526286769ace21982E798Df5eef2389f51c";
const IMPL_SLOT     = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

function hardStop(msg) { throw new Error(`\n[HARD STOP] ${msg}\n`); }
function addrEq(a, b)  { return a.toLowerCase() === b.toLowerCase(); }

async function main() {
  console.log("=== Phase 4: Deploy OBNStakingLens (UUPS proxy) ===\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Network:       ${hre.network.name}`);
  console.log(`STAKING_PROXY: ${STAKING_PROXY}`);
  console.log(`TIMELOCK:      ${TIMELOCK}\n`);

  const Factory = await hre.ethers.getContractFactory("OBNStakingLens");
  console.log("Deploying OBNStakingLens proxy...");
  const proxy = await hre.upgrades.deployProxy(
    Factory,
    [STAKING_PROXY, TIMELOCK],
    { kind: "uups" }
  );
  await proxy.waitForDeployment();
  const LENS_PROXY = proxy.target;
  const LENS_IMPL  = await hre.upgrades.erc1967.getImplementationAddress(LENS_PROXY);
  console.log(`Proxy:         ${LENS_PROXY}`);
  console.log(`Implementation: ${LENS_IMPL}\n`);

  console.log("Verifying proxy state...");

  const owner = await proxy.owner();
  console.log(`  owner()        = ${owner}`);
  if (!addrEq(owner, TIMELOCK)) hardStop(`owner() returned ${owner} — expected TIMELOCK ${TIMELOCK}.`);
  console.log("                 PASS");

  const stakingPools = await proxy.stakingPools();
  console.log(`  stakingPools() = ${stakingPools}`);
  if (!addrEq(String(stakingPools), STAKING_PROXY)) hardStop(`stakingPools() returned ${stakingPools} — expected STAKING_PROXY ${STAKING_PROXY}.`);
  console.log("                 PASS");

  console.log("\nVerifying ERC1967 implementation slot...");
  const slotRaw = await hre.ethers.provider.getStorage(LENS_PROXY, IMPL_SLOT);
  const implFromSlot = hre.ethers.getAddress("0x" + slotRaw.slice(-40));
  console.log(`  ERC1967 slot   = ${implFromSlot}`);
  if (!addrEq(implFromSlot, LENS_IMPL)) hardStop(`ERC1967 slot contains ${implFromSlot} — expected LENS_IMPL ${LENS_IMPL}.`);
  console.log("                 PASS");

  console.log("\nVerifying bare implementation is locked...");
  const impl = Factory.attach(LENS_IMPL);
  try {
    await impl.initialize.staticCall(STAKING_PROXY, TIMELOCK);
    hardStop("OBNStakingLens implementation can be initialized — _disableInitializers() not working.");
  } catch (e) {
    if (e.message?.includes("HARD STOP")) throw e;
    console.log("  initialize() reverts on impl  PASS");
  }

  console.log("\nSmoke test: Lens reads against live v9.2 staking proxy...");
  try {
    const stats = await proxy.getGlobalStats();
    console.log(`  getGlobalStats() = ${stats}`);
    const poolCount   = stats[0];
    const totalStaked = stats[1];
    if (poolCount === 0n)   hardStop("getGlobalStats poolCount is 0 — unexpected for mainnet. Verify network.");
    if (totalStaked === 0n) hardStop("getGlobalStats totalStaked is 0 — unexpected for mainnet. Verify network.");
    console.log("                   PASS");
  } catch (e) {
    if (e.message?.includes("HARD STOP")) throw e;
    hardStop(`LENS_PROXY.getGlobalStats() reverted unexpectedly: ${e.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Phase 4 COMPLETE. All 7 new addresses recorded:");
  console.log("  (V93_IMPL, EXTENDING_OB_ADDR, OFFERING_ADDR from prior scripts)\n");
  console.log(`  LENS_PROXY = ${LENS_PROXY}`);
  console.log(`  LENS_IMPL  = ${LENS_IMPL}`);
  console.log("\nAdd both to .env.");
  console.log("Proceed to Package 1 verification. Do NOT start Phase 5 until ChatGPT returns PASS.");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
