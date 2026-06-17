// scripts/governance/check_timelock_status.js
const { ethers } = require("hardhat");

function csvToArray(csv) {
  if (!csv || !csv.trim()) return null;
  return csv.split(",").map(s => s.trim());
}
function get(name, def) {
  const v = process.env[name];
  return (v && v.trim()) ? v.trim() : def;
}

async function main() {
  const TL = get("TIMELOCK_ADDR", "0x86396526286769ace21982E798Df5eef2389f51c");

  // Fallbacks = the exact params you just scheduled
  const targetsCsv = get("TARGETS_CSV", "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2");
  const valuesCsv  = get("VALUES_CSV",  "0");
  const datasCsv   = get("DATAS_HEX_CSV","0xd914cd4b000000000000000000000000a23fa5a73c6366f6a829ac1f452a24efdc5ecff7");
  const predecessor = get("PREDECESSOR","0x0000000000000000000000000000000000000000000000000000000000000000");
  const salt        = get("SALT",       "0x0dc5e3283834d6ba54b852253dcd272648d1df8ab2d13ce781983f6d8e527df8");

  const targets = csvToArray(targetsCsv);
  const values  = csvToArray(valuesCsv)?.map(v => BigInt(v));
  const datas   = csvToArray(datasCsv);

  if (!targets || !values || !datas) {
    throw new Error("Missing arrays. Set env vars TARGETS_CSV, VALUES_CSV, DATAS_HEX_CSV or keep the defaults.");
  }

  const tl = await ethers.getContractAt("OBNTimeLock", TL);

  const opId = await tl.hashOperationBatch(targets, values, datas, predecessor, salt);
  const state = Number(await tl.getOperationState(opId)); // 0=Unset,1=Waiting,2=Ready,3=Done
  const ts = Number(await tl.getTimestamp(opId));
  const minDelay = Number(await tl.getMinDelay());

  const now = Math.floor(Date.now()/1000);
  const remaining = Math.max(0, ts - now);
  const fmt = s => new Date(s*1000).toLocaleString();

  console.log("Timelock:    ", TL);
  console.log("Operation ID:", opId);
  console.log("Min Delay:   ", minDelay, "sec");
  console.log("State:       ", state === 0 ? "0 (Unset)" : state === 1 ? "1 (Waiting)" : state === 2 ? "2 (Ready)" : "3 (Done)");
  console.log("ETA (unix):  ", ts);
  if (ts) {
    console.log("ETA (local): ", fmt(ts));
    console.log("Now:         ", fmt(now));
  }

  if (state === 1) {
    const h = Math.floor(remaining/3600), m = Math.floor((remaining%3600)/60), s = remaining%60;
    console.log(`⏳ Remaining: ${h}h ${m}m ${s}s`);
  } else if (state === 2) {
    console.log("✅ Timelock delay passed — operation is READY to execute.");
  } else if (state === 3) {
    console.log("✅ Already executed (Done).");
  } else {
    console.log("⚠️  Unset — not scheduled with these arrays/salt.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
