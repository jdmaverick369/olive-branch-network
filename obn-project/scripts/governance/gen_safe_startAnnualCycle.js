// scripts/governance/gen_safe_startAnnualCycle.js
// Generates a Safe JSON for AnnualGovernance.startAnnualCycle(phase1Duration, phase2Duration).
// This is a DIRECT Safe call — startAnnualCycle is restricted to voteAdmin (OPERATOR_SAFE),
// not the Timelock. No 24h delay required.
//
// Usage (both phases default to exactly 30 days):
//   node scripts/governance/gen_safe_startAnnualCycle.js
//   node scripts/governance/gen_safe_startAnnualCycle.js --phase1 2592000 --phase2 2592000
// Other durations are rejected by both this generator and AnnualGovernanceV2.
//
// Output:
//   governance-operations/YYYY-MM-DD-startAnnualCycle.json
"use strict";
const { ethers }  = require("ethers");
const minimist    = require("minimist");
const addrs       = require("./addresses");
const { buildSafeJson, writeJson, outDir } = require("./timelock_safe_helper");
const path = require("path");

const { PIN } = require('./assembly_release.cjs');
const ANNUAL_GOV = PIN.governance;
function validateTarget() {
  if (process.env.ANNUAL_GOV_PROXY && process.env.ANNUAL_GOV_PROXY.toLowerCase() !== PIN.governance.toLowerCase())
    throw new Error('ANNUAL_GOV_PROXY differs from the pinned governance proxy.');
  if (addrs.OPERATOR_SAFE.toLowerCase() !== PIN.voteAdmin.toLowerCase() || String(addrs.CHAIN_ID) !== String(PIN.chainId))
    throw new Error('Safe or chain differs from the reviewed release.');
}
const PHASE_DURATION = 2592000n; // exactly 30 days

const ABI = [
  "function startAnnualCycle(uint64 phase1Duration, uint64 phase2Duration) external",
];

function fmtDuration(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function parseDurations(args) {
  const argv = minimist(args, { string: ["phase1", "phase2"] });
  const values = ["phase1", "phase2"].map(key => {
    const value = argv[key] ?? PHASE_DURATION.toString();
    if (typeof value !== "string" || !/^[0-9]+$/.test(value) || BigInt(value) !== PHASE_DURATION)
      throw new Error(key + " must be exactly 30 days (2592000 seconds).");
    return BigInt(value);
  });
  return values;
}

function main() {
  validateTarget();
  const [phase1, phase2] = parseDurations(process.argv.slice(2));

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

module.exports = { parseDurations, validateTarget };
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
