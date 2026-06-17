// scripts/governance/gen_safe_shutdownPool.js
// Generates Safe JSONs to shutdown a nonprofit pool through the Timelock.
// Shutdown blocks new deposits; existing stakers can still withdraw and claim.
//
// Usage:
//   # Schedule (generates JSON + prints SALT and OP_ID to save):
//   node scripts/governance/gen_safe_shutdownPool.js --action schedule --pid <N>
//
//   # Execute (run after 24h with saved env vars):
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_shutdownPool.js --action execute --pid <N>
"use strict";
const { ethers }  = require("ethers");
const minimist    = require("minimist");
const { getByPid } = require("./nonprofits");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");

const ABI = ["function shutdownPool(uint256 pid) external"];

function main() {
  const argv   = minimist(process.argv.slice(2));
  const action = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const pid = argv.pid !== undefined ? Number(argv.pid) : undefined;
  if (pid === undefined || !Number.isInteger(pid) || pid < 0)
    throw new Error("❌ --pid must be a non-negative integer");

  const np       = getByPid(pid);
  const calldata = new ethers.Interface(ABI).encodeFunctionData("shutdownPool", [pid]);
  const label    = `shutdownPool(pid=${pid}${np.name ? " " + np.name : ""})`;

  console.log(`\nPool:   PID ${pid}${np.name ? " — " + np.name : ""}`);
  console.log(`Wallet: ${np.wallet}`);

  if (action === "schedule") {
    scheduleOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
    console.log(`\n⚠️  After execution: new deposits to PID ${pid} will be blocked.`);
    console.log(`   Existing stakers can still withdraw and claim.`);
  } else {
    executeOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
