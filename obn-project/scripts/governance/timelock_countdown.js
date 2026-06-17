// scripts/governance/timelock_countdown.js
// Live countdown to a Timelock execution window.
// Run: OP_ID=0x... node scripts/governance/timelock_countdown.js
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");

const RPC_URL  = process.env.BASE_MAINNET_URL || "https://mainnet.base.org";
const TIMELOCK = process.env.TIMELOCK_ADDR    || "0x86396526286769ace21982E798Df5eef2389f51c";
const OP_ID    = process.env.OP_ID;

if (!OP_ID || !/^0x[a-fA-F0-9]{64}$/.test(OP_ID)) {
  console.error("Usage: OP_ID=0x<64 hex chars> node scripts/governance/timelock_countdown.js");
  console.error("Tip:   gen_safe_addPool.js prints the OP_ID after generating the Safe JSON.");
  process.exit(1);
}

const TIMELOCK_ABI = [
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function isOperationReady(bytes32 id) view returns (bool)",
  "function isOperationDone(bytes32 id) view returns (bool)",
];

function pad(n) { return String(n).padStart(2, "0"); }

function formatDuration(secs) {
  if (secs <= 0) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  });
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const timelock  = new ethers.Contract(TIMELOCK, TIMELOCK_ABI, provider);

  const rawTs = await timelock.getTimestamp(OP_ID);
  const readyAt = Number(rawTs);

  if (readyAt === 0) {
    console.error("Operation not found — opId may be wrong or not yet scheduled.");
    process.exit(1);
  }
  if (readyAt === 1) {
    console.log("Operation is DONE — already executed.");
    process.exit(0);
  }

  console.clear();
  console.log("═".repeat(60));
  console.log("  OBN Timelock Countdown");
  console.log("═".repeat(60));
  console.log(`  opId:     ${OP_ID}`);
  console.log(`  Unlocks:  ${formatTs(readyAt)}`);
  console.log("═".repeat(60));

  const tick = async () => {
    const now      = Math.floor(Date.now() / 1000);
    const secsLeft = readyAt - now;

    const ready = await timelock.isOperationReady(OP_ID).catch(() => false);
    const done  = await timelock.isOperationDone(OP_ID).catch(() => false);

    process.stdout.write("\r" + " ".repeat(70) + "\r");

    if (done) {
      console.log("\n  ✅ EXECUTED — operation is done.");
      process.exit(0);
    } else if (ready || secsLeft <= 0) {
      process.stdout.write("  🟢 READY TO EXECUTE NOW                                    ");
    } else {
      const pct  = Math.max(0, Math.min(100, Math.round(((86400 - secsLeft) / 86400) * 100)));
      const bar  = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
      process.stdout.write(`  ⏳ ${formatDuration(secsLeft)}  [${bar}] ${pct}%`);
    }
  };

  await tick();
  const interval = setInterval(tick, 5000);

  // Re-check every minute for done/ready state; exit cleanly on Ctrl-C
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\n\nStopped.");
    process.exit(0);
  });
}

main().catch(e => { console.error(e.message); process.exit(1); });
