// scripts/governance/execute_cycle.js
// Advances AnnualGovernance (AnnualGovernanceV2) through its permissionless
// executeCurrentCycle(). Anyone may run it; the wallet needs Base ETH for gas and no role.
//
// Each run takes at most one step:
//   Phase 1 open or ready, ballot not fully prepared -> prepares the next ballot batch
//   Phase 1 ready, ballot prepared                   -> settles Phase 1 (burn or give)
//   Phase 2 ready                                    -> settles Phase 2 (nonprofit payout)
// Run it again (or on a schedule) until it reports nothing to do.
//
// Usage, from obn-project/:
//   node scripts/governance/execute_cycle.js --dry-run   read-only: report the next step
//   node scripts/governance/execute_cycle.js             submit the next step
//
// Environment (.env is read if present):
//   PRIVATE_KEY   signer for submissions; not needed with --dry-run
//   BASE_RPC_URL  optional, defaults to https://mainnet.base.org
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");

const ANNUAL_GOVERNANCE = "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270";
const BASE_CHAIN_ID     = 8453n;
const RPC_URL           = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const ABI = [
  "function currentCycleId() view returns (uint256)",
  "function getCycleState(uint256 cycleId) view returns (uint8)",
  "function getCyclePreparation(uint256 cycleId) view returns (uint256 cursor, uint256 poolCount, bool complete, uint256 ballotSize)",
  "function executeCurrentCycle()",
];

const STATE = {
  INACTIVE: 0, PHASE1_OPEN: 1, PHASE1_READY: 2, PHASE2_OPEN: 3, PHASE2_READY: 4, COMPLETED: 5, CANCELLED: 6,
};
const STATE_NAMES = Object.keys(STATE);

// Mirrors executeCurrentCycle() in AnnualGovernanceV2.
function nextAction(state, ballotComplete) {
  if ((state === STATE.PHASE1_OPEN || state === STATE.PHASE1_READY) && !ballotComplete) return "prepare-ballot";
  if (state === STATE.PHASE1_READY) return "execute-phase1";
  if (state === STATE.PHASE2_READY) return "execute-phase2";
  return null;
}

async function readCycle(gov) {
  const cycleId = await gov.currentCycleId();
  const state = Number(await gov.getCycleState(cycleId));
  if (!(state in STATE_NAMES)) throw new Error(`Unknown governance state ${state}`);
  let preparation = null;
  if (state === STATE.PHASE1_OPEN || state === STATE.PHASE1_READY) {
    const { cursor, poolCount, complete, ballotSize } = await gov.getCyclePreparation(cycleId);
    preparation = { cursor, poolCount, complete, ballotSize };
  }
  return { cycleId, state, preparation, action: nextAction(state, preparation ? preparation.complete : true) };
}

async function executeCycle(gov, { dryRun = false } = {}) {
  const cycle = await readCycle(gov);
  if (!cycle.action || dryRun) return { ...cycle, submitted: false };
  // Simulate first: if someone else just advanced the cycle, send nothing.
  try {
    await gov.executeCurrentCycle.staticCall();
  } catch (error) {
    if (error.reason === "cycle not ready for execution") return { ...cycle, action: null, submitted: false };
    throw error;
  }
  const tx = await gov.executeCurrentCycle();
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`Transaction ${tx.hash} failed`);
  return { ...cycle, submitted: true, transactionHash: tx.hash, blockNumber: receipt.blockNumber };
}

function formatResult(result) {
  const lines = [`Cycle ${result.cycleId} — state: ${STATE_NAMES[result.state]}`];
  if (result.preparation) {
    const { cursor, poolCount, complete, ballotSize } = result.preparation;
    lines.push(`Ballot preparation: ${complete ? "complete" : `${cursor}/${poolCount} pools scanned`}, ${ballotSize} nonprofits on ballot`);
  }
  if (!result.action) lines.push("Nothing to execute.");
  else if (!result.submitted) lines.push(`Next step: ${result.action} (dry run, nothing submitted)`);
  else lines.push(`${result.action}: confirmed in block ${result.blockNumber}, tx ${result.transactionHash}`);
  return lines.join("\n");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  try {
    const { chainId } = await provider.getNetwork();
    if (chainId !== BASE_CHAIN_ID) throw new Error(`Expected Base mainnet (chain ${BASE_CHAIN_ID}), got chain ${chainId}`);
    let runner = provider;
    if (!dryRun) {
      if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set (use --dry-run to only read)");
      runner = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    }
    const gov = new ethers.Contract(ANNUAL_GOVERNANCE, ABI, runner);
    console.log(formatResult(await executeCycle(gov, { dryRun })));
  } finally {
    provider.destroy();
  }
}

module.exports = { ABI, STATE, nextAction, readCycle, executeCycle, formatResult };

if (require.main === module) {
  main().catch((e) => { console.error(e.shortMessage || e.message); process.exitCode = 1; });
}
