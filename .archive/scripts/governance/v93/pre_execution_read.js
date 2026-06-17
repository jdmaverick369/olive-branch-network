// scripts/governance/pre_execution_read.js
// Run immediately before executing Phase 6. Captures the live pre-upgrade baseline.
// Compare globalTotalStaked and poolLength against post-upgrade read_package4.js output.
// Usage: npx hardhat run scripts/governance/pre_execution_read.js --network base
"use strict";
require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const TIMELOCK      = "0x86396526286769ace21982E798Df5eef2389f51c";
const OP_ID         = "0xfed7625b7bfd06132dc67b14ba1503c43a1e26c083882a13aa6be63c83edceb4";

const ABI = [
  "function version() view returns (string)",
  "function globalTotalStaked() view returns (uint256)",
  "function poolLength() view returns (uint256)",
];
const TL_ABI = [
  "function isOperationReady(bytes32) view returns (bool)",
  "function isOperationDone(bytes32) view returns (bool)",
];

async function main() {
  const provider = ethers.provider;
  const block    = await provider.getBlockNumber();
  const proxy    = new ethers.Contract(STAKING_PROXY, ABI, provider);
  const tl       = new ethers.Contract(TIMELOCK, TL_ABI, provider);

  const [version, staked, pools, ready, done] = await Promise.all([
    proxy.version(),
    proxy.globalTotalStaked(),
    proxy.poolLength(),
    tl.isOperationReady(OP_ID),
    tl.isOperationDone(OP_ID),
  ]);

  console.log("═".repeat(60));
  console.log("  Pre-execution baseline");
  console.log("═".repeat(60));
  console.log(`  Block:                 ${block}`);
  console.log(`  version():             "${version}"  ${version === "9.2" ? "✓ ready to upgrade" : "✗ NOT 9.2 — DO NOT EXECUTE"}`);
  console.log(`  globalTotalStaked():   ${staked}`);
  console.log(`  poolLength():          ${pools}`);
  console.log(`  isOperationReady():    ${ready}  ${ready ? "✓ window open" : "✗ not yet"}`);
  console.log(`  isOperationDone():     ${done}  ${done ? "✗ already executed" : "✓"}`);
  console.log("═".repeat(60));

  if (version !== "9.2") {
    console.log("\n  HARD STOP — version is not 9.2. Do not execute.");
    process.exitCode = 1;
  } else if (!ready) {
    console.log("\n  Timelock window not open yet. Wait.");
    process.exitCode = 1;
  } else if (done) {
    console.log("\n  HARD STOP — operation is already done. Do not execute.");
    process.exitCode = 1;
  } else {
    console.log("\n  All clear. Record globalTotalStaked and poolLength,");
    console.log("  then execute safe_execute_phase6.json in Safe.");
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
