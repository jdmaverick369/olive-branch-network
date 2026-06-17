// scripts/governance/gen_safe_updateCharityWallet.js
// Generates Safe JSONs to update a pool's charity wallet through the Timelock.
//
// updateCharityWallet only redirects where future 10% pool emissions go.
// It does NOT move the genesis bootstrap stake. For a full wallet migration
// (moving the locked stake too), use gen_safe_migrateBootstrap.js instead.
//
// When to use which:
//   updateCharityWallet  — nonprofit rotates their receiving wallet; bootstrap stays with old wallet
//   migrateBootstrap     — full migration: move bootstrap stake + update charity wallet atomically
//
// Usage:
//   node scripts/governance/gen_safe_updateCharityWallet.js --action schedule --pid <N> --new 0xNEW
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_updateCharityWallet.js --action execute --pid <N> --new 0xNEW
"use strict";
const { ethers }   = require("ethers");
const minimist     = require("minimist");
const { getByPid } = require("./nonprofits");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");

const ABI = ["function updateCharityWallet(uint256 pid, address newWallet) external"];

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

  const np        = getByPid(pid);
  const newWallet = mustAddr(argv.new, "--new");

  if (newWallet.toLowerCase() === np.wallet.toLowerCase())
    throw new Error("❌ --new is the same as the current wallet. No change needed.");

  const calldata = new ethers.Interface(ABI).encodeFunctionData("updateCharityWallet", [pid, newWallet]);
  const label    = `updateCharityWallet(pid=${pid}, new=${newWallet})`;

  console.log(`\nPool:        PID ${pid}${np.name ? " — " + np.name : ""}`);
  console.log(`Current:     ${np.wallet}`);
  console.log(`New wallet:  ${newWallet}`);
  console.log(`\n⚠️  This only redirects future emissions. Bootstrap stake stays at ${np.wallet}.`);
  console.log(`   For a full migration use gen_safe_migrateBootstrap.js instead.`);

  if (action === "schedule") {
    scheduleOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
    console.log(`\n   After execution: remember to update nonprofits.js with the new wallet address.`);
  } else {
    executeOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
