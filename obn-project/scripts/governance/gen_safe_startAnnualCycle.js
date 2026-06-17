// scripts/governance/gen_safe_startAnnualCycle.js
// Generates a Safe JSON for AnnualGovernance.startAnnualCycle(phase1Duration, phase2Duration).
// This is a DIRECT Safe call — startAnnualCycle is restricted to voteAdmin (OPERATOR_SAFE),
// not the Timelock. No 24h delay required.
//
// Usage:
//   node scripts/governance/gen_safe_startAnnualCycle.js \
//     --phase1 <seconds> --phase2 <seconds>
//
//   # Example: 14-day Phase 1, 14-day Phase 2
//   node scripts/governance/gen_safe_startAnnualCycle.js --phase1 1209600 --phase2 1209600
//
// Phase durations:
//   7 days  = 604800
//   14 days = 1209600
//   30 days = 2592000
//   Minimum = 86400 (1 day)
//
// Output:
//   governance-operations/YYYY-MM-DD-startAnnualCycle.json
"use strict";
const { ethers }  = require("ethers");
const minimist    = require("minimist");
const addrs       = require("./addresses");
const { buildSafeJson, writeJson, outDir } = require("./timelock_safe_helper");
const path = require("path");

const ANNUAL_GOV  = process.env.ANNUAL_GOV_PROXY || "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270";
const MIN_DURATION = 86400n; // 1 day

const ABI = [
  "function startAnnualCycle(uint64 phase1Duration, uint64 phase2Duration) external",
];

function fmtDuration(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function main() {
  const argv = minimist(process.argv.slice(2));

  const phase1 = BigInt(argv.phase1 ?? 0);
  const phase2 = BigInt(argv.phase2 ?? 0);

  if (phase1 < MIN_DURATION)
    throw new Error(`❌ --phase1 must be ≥ 86400 seconds (1 day). Got: ${phase1}`);
  if (phase2 < MIN_DURATION)
    throw new Error(`❌ --phase2 must be ≥ 86400 seconds (1 day). Got: ${phase2}`);

  const iface    = new ethers.Interface(ABI);
  const calldata = iface.encodeFunctionData("startAnnualCycle", [phase1, phase2]);

  const dateStr  = new Date().toISOString().slice(0, 10);
  const outFile  = path.join(outDir(), `${dateStr}-startAnnualCycle.json`);

  const desc = `startAnnualCycle(phase1=${phase1}s [${fmtDuration(Number(phase1))}], phase2=${phase2}s [${fmtDuration(Number(phase2))}])`;

  writeJson(outFile, buildSafeJson(
    `OBN startAnnualCycle — ${fmtDuration(Number(phase1))} / ${fmtDuration(Number(phase2))}`,
    desc,
    ANNUAL_GOV,
    calldata,
  ));

  console.log(`\n✅ Safe JSON: ${outFile}`);
  console.log(`   Target:  AnnualGovernance (${ANNUAL_GOV})`);
  console.log(`   Phase 1: ${phase1}s (${fmtDuration(Number(phase1))})`);
  console.log(`   Phase 2: ${phase2}s (${fmtDuration(Number(phase2))}) — starts after executePhase1() is called`);
  console.log(`\n   Import into Safe Transaction Builder, sign with 2-of-3, execute.`);
  console.log(`   NOTE: snapshotBlock is set to block.number - 1 at execution time.`);
  console.log(`         Execute this tx in the same block window as intended cycle start.`);
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
