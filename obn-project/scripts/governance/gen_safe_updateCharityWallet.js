// scripts/governance/gen_safe_updateCharityWallet.js
// Generates Safe JSONs to update a pool's charity wallet through the Timelock.
//
// updateCharityWallet only redirects where future 10% pool emissions go.
// It does NOT move the genesis bootstrap stake — so it is ONLY valid for a pool
// that hasn't been bootstrapped yet. For any pool that already has a genesis
// stake, use gen_safe_migrateBootstrap.js instead, which moves the stake, lock,
// and reward debt to the new wallet AND updates the charity wallet, atomically.
// This script checks userAmount(pid, currentWallet) on-chain and refuses to run
// if the pool is already bootstrapped — see charity_wallet_runbook.md.
//
// When to use which:
//   updateCharityWallet  — pool not yet bootstrapped; nothing to migrate
//   migrateBootstrap     — pool already bootstrapped: move stake + update charity wallet atomically
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
const STAKING_ABI = [
  "function userAmount(uint256 pid, address user) view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
];

function mustAddr(a, name) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing → ${a}`);
  return a;
}

async function main() {
  const argv   = minimist(process.argv.slice(2));
  const action = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const pid = argv.pid !== undefined ? Number(argv.pid) : undefined;
  if (pid === undefined || !Number.isInteger(pid) || pid < 0)
    throw new Error("❌ --pid must be a non-negative integer");

  const np        = getByPid(pid);
  const newWallet = mustAddr(argv.new, "--new");

  const rpcUrl   = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const staking  = new ethers.Contract(addrs.STAKING_PROXY, STAKING_ABI, provider);

  // Authoritative source of "current wallet" is the chain, not nonprofits.js — the registry
  // can drift out of sync with reality (a rotation landed without the file being updated, a
  // merge conflict silently kept a stale entry, etc.). This must run BEFORE any check that uses
  // np.wallet, including the "same as current" guard below — otherwise a stale registry entry
  // that happens to equal --new would exit on the wrong error message without ever surfacing
  // that the registry itself is wrong.
  const [onChainWallet] = await staking.getPoolInfo(pid);
  if (onChainWallet.toLowerCase() !== np.wallet.toLowerCase()) {
    throw new Error(
      `❌ nonprofits.js says PID ${pid}'s current wallet is ${np.wallet}, but the staking proxy ` +
      `reports ${onChainWallet}. The registry is stale — fix nonprofits.js before generating a ` +
      `proposal against the wrong wallet.`
    );
  }

  if (newWallet.toLowerCase() === onChainWallet.toLowerCase())
    throw new Error("❌ --new is the same as the current wallet. No change needed.");

  const existingStake = await staking.userAmount(pid, onChainWallet);

  if (existingStake > 0n) {
    throw new Error(
      `❌ PID ${pid}'s current wallet (${onChainWallet}) already holds a bootstrap stake ` +
      `(${ethers.formatEther(existingStake)} OBN). updateCharityWallet cannot be used alone on an ` +
      `already-bootstrapped pool — it would strand that stake at the old wallet. ` +
      `Use gen_safe_migrateBootstrap.js instead (moves the stake + updates the wallet atomically).`
    );
  }

  const calldata = new ethers.Interface(ABI).encodeFunctionData("updateCharityWallet", [pid, newWallet]);
  const label    = `updateCharityWallet(pid=${pid}, new=${newWallet})`;

  console.log(`\nPool:        PID ${pid}${np.name ? " — " + np.name : ""}`);
  console.log(`Current:     ${onChainWallet} (verified on-chain, matches nonprofits.js)`);
  console.log(`New wallet:  ${newWallet}`);
  console.log(`\n✅ Pool not yet bootstrapped (userAmount == 0) — safe to rewrite the charity wallet alone.`);

  if (action === "schedule") {
    scheduleOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
    console.log(`\n   After execution: remember to update nonprofits.js with the new wallet address.`);
  } else {
    executeOne({ target: addrs.STAKING_PROXY, calldata, label, pid });
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
