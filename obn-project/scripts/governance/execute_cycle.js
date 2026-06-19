// scripts/governance/execute_cycle.js
// Calls executeCurrentCycle() on AnnualGovernance if a phase is ready for execution.
// Safe to run at any frequency — exits silently when nothing is ready.
//
// Required .env:
//   PRIVATE_KEY=0x...            private key of any wallet with Base ETH for gas
//
// Optional .env:
//   BASE_RPC_URL=https://...     defaults to https://mainnet.base.org
//
// Usage:
//   node scripts/governance/execute_cycle.js
//
// Automate:
//   cron:           */5 * * * * cd /path/to/obn-project && node scripts/governance/execute_cycle.js
//   GitHub Actions: schedule: - cron: '*/5 * * * *'  (GitHub's actual floor, regardless of cron string)
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");

const ANNUAL_GOVERNANCE = "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270";
const RPC_URL           = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const ABI = [
  "function currentCycleId() view returns (uint256)",
  "function getCycleState(uint256 cycleId) view returns (uint8)",
  "function executeCurrentCycle()",
];

const PHASE1_READY = 2;
const PHASE2_READY = 4;

const STATE_NAMES = {
  0: "INACTIVE", 1: "PHASE1_OPEN", 2: "PHASE1_READY",
  3: "PHASE2_OPEN", 4: "PHASE2_READY", 5: "COMPLETED", 6: "CANCELLED",
};

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY not set in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(key, provider);
  const gov      = new ethers.Contract(ANNUAL_GOVERNANCE, ABI, wallet);

  const cycleId   = await gov.currentCycleId();
  const state     = Number(await gov.getCycleState(cycleId));
  const stateName = STATE_NAMES[state] ?? `UNKNOWN(${state})`;

  console.log(`Cycle ${cycleId} — state: ${stateName}`);

  if (state !== PHASE1_READY && state !== PHASE2_READY) {
    console.log("Nothing to execute.");
    return;
  }

  console.log(`Executing cycle ${cycleId} (${stateName})…`);
  const tx      = await gov.executeCurrentCycle();
  console.log(`TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
