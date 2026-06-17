// scripts/governance/gen_safe_forceExitUserToSelf.js
// Generates Safe JSONs to force-exit a user's stake in a pool through the Timelock.
// Emergency use: withdraws a user's full position back to themselves.
// Use --claim to also mint pending rewards; omit to skip rewards.
//
// Usage:
//   node scripts/governance/gen_safe_forceExitUserToSelf.js --action schedule --pid <N> --user 0x... [--claim]
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_forceExitUserToSelf.js --action execute --pid <N> --user 0x... [--claim]
"use strict";
const { ethers }  = require("ethers");
const minimist    = require("minimist");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");

const ABI = ["function forceExitUserToSelf(uint256 pid, address user, bool claimRewards) external"];

function mustAddr(a, name) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing → ${a}`);
  return a;
}

function main() {
  const argv   = minimist(process.argv.slice(2));
  const action = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const pid = argv.pid !== undefined ? Number(argv.pid) : undefined;
  if (pid === undefined || !Number.isInteger(pid) || pid < 0)
    throw new Error("❌ --pid must be a non-negative integer");

  const user         = mustAddr(argv.user, "--user");
  const claimRewards = Boolean(argv.claim);

  const calldata = new ethers.Interface(ABI).encodeFunctionData("forceExitUserToSelf", [pid, user, claimRewards]);
  const label    = `forceExitUserToSelf(pid=${pid}, user=${user}, claim=${claimRewards})`;

  console.log(`\n⚠️  EMERGENCY force exit`);
  console.log(`   PID:          ${pid}`);
  console.log(`   User:         ${user}`);
  console.log(`   Claim rewards:${claimRewards}`);

  if (action === "schedule") {
    scheduleOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  } else {
    executeOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
