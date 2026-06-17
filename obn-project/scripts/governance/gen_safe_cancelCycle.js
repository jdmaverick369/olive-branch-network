// scripts/governance/gen_safe_cancelCycle.js
// Generates Safe JSONs to cancel an active AnnualGovernance cycle through the Timelock.
// Emergency use only — cancellation is irreversible for that cycle.
//
// Usage:
//   node scripts/governance/gen_safe_cancelCycle.js --action schedule --cycle <N>
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_cancelCycle.js --action execute --cycle <N>
"use strict";
const { ethers }  = require("ethers");
const minimist    = require("minimist");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");

const ANNUAL_GOV = process.env.ANNUAL_GOV_PROXY || "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270";
const ABI = ["function cancelCycle(uint256 cycleId) external"];

function main() {
  const argv    = minimist(process.argv.slice(2));
  const action  = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const cycleId = argv.cycle !== undefined ? Number(argv.cycle) : undefined;
  if (cycleId === undefined || !Number.isInteger(cycleId) || cycleId < 1)
    throw new Error("❌ --cycle must be a positive integer (cycle ID to cancel)");

  const calldata = new ethers.Interface(ABI).encodeFunctionData("cancelCycle", [cycleId]);
  const label    = `cancelCycle(cycleId=${cycleId})`;

  console.log(`\n⚠️  EMERGENCY: cancelling AnnualGovernance cycle ${cycleId}.`);
  console.log(`   This is irreversible. The cycle cannot be restarted.`);
  console.log(`   Target: AnnualGovernance (${ANNUAL_GOV})`);

  if (action === "schedule") {
    scheduleOne({ target: ANNUAL_GOV, calldata, label });
  } else {
    executeOne({ target: ANNUAL_GOV, calldata, label });
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
