// scripts/governance/gen_safe_removePool.js
// Generates Safe JSONs to permanently remove a nonprofit pool through the Timelock.
//
// IMPORTANT: removePool requires totalStaked == 0. The pool must be shut down first
// (gen_safe_shutdownPool.js) and all stakers must have withdrawn before this can execute.
//
// Usage:
//   node scripts/governance/gen_safe_removePool.js --action schedule --pid <N>
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_removePool.js --action execute --pid <N>
"use strict";
const { ethers }   = require("ethers");
const minimist     = require("minimist");
const { getByPid } = require("./nonprofits");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");

const ABI = ["function removePool(uint256 pid) external"];

function main() {
  const argv   = minimist(process.argv.slice(2));
  const action = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const pid = argv.pid !== undefined ? Number(argv.pid) : undefined;
  if (pid === undefined || !Number.isInteger(pid) || pid < 0)
    throw new Error("❌ --pid must be a non-negative integer");

  const np       = getByPid(pid);
  const calldata = new ethers.Interface(ABI).encodeFunctionData("removePool", [pid]);
  const label    = `removePool(pid=${pid}${np.name ? " " + np.name : ""})`;

  console.log(`\nPool:   PID ${pid}${np.name ? " — " + np.name : ""}`);
  console.log(`Wallet: ${np.wallet}`);
  console.log(`\n⚠️  PERMANENT removal. Pool must already be shut down and totalStaked == 0.`);
  console.log(`   The on-chain execute will revert if any stake remains.`);

  if (action === "schedule") {
    scheduleOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  } else {
    executeOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
