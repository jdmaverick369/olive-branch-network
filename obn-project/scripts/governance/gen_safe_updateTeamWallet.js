// scripts/governance/gen_safe_updateTeamWallet.js
// Generates Safe JSONs to redirect the TeamVesting release destination through the Timelock.
//
// TeamVesting.updateTeamWallet() changes where future vested tokens are sent when
// release() is called. It does NOT affect already-released tokens.
//
// Usage:
//   node scripts/governance/gen_safe_updateTeamWallet.js --action schedule --new 0xNEW_WALLET
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_updateTeamWallet.js --action execute --new 0xNEW_WALLET
"use strict";
const { ethers }                  = require("ethers");
const minimist                    = require("minimist");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs                       = require("./addresses");

const ABI = ["function updateTeamWallet(address newWallet) external"];

function mustAddr(a, name) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing → ${a}`);
  return a;
}

function main() {
  const argv   = minimist(process.argv.slice(2), { string: ["new"] });
  const action = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const newWallet = mustAddr(argv.new, "--new");
  mustAddr(addrs.TEAM_VESTING, "TEAM_VESTING_ADDR");

  const calldata = new ethers.Interface(ABI).encodeFunctionData("updateTeamWallet", [newWallet]);
  const label    = `updateTeamWallet(${newWallet})`;

  console.log(`\nTeamVesting:  ${addrs.TEAM_VESTING}`);
  console.log(`New wallet:   ${newWallet}`);
  console.log(`\n⚠️  This redirects future release() calls only. Already-released tokens are unaffected.`);

  if (action === "schedule") {
    scheduleOne({ target: addrs.TEAM_VESTING, calldata, label });
  } else {
    executeOne({ target: addrs.TEAM_VESTING, calldata, label });
  }
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
