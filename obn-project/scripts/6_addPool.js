// scripts/6_addPool.js
const { ethers } = require("hardhat");
require("dotenv").config();

const POOL_ABI = [
  "function addPool(address charityWallet) external",
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, bool active, uint256 totalStaked)",
  "function owner() view returns (address)",
  // Event so we can read the PID deterministically
  "event PoolAdded(uint256 indexed pid, address charityWallet)"
];

const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const mustAddr = (a, name) => {
  if (!isAddr(a)) throw new Error(`❌ ${name}: invalid or missing -> ${a}`);
  return a;
};

async function main() {
  const argv = require("minimist")(process.argv.slice(2));

  const staking = mustAddr(process.env.OBN_STAKING_CONTRACT, "OBN_STAKING_CONTRACT");

  // PID: --pid or TARGET_PID
  const pidRaw = argv.pid ?? process.env.TARGET_PID;
  if (pidRaw === undefined) throw new Error("❌ Provide --pid or set TARGET_PID in .env");
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid < 0) throw new Error("❌ PID must be a non-negative integer");

  // Charity: --charity or PID_<PID>
  const charity = mustAddr(argv.charity ?? process.env[`PID_${pid}`], `PID_${pid} / --charity`);

  const [deployer] = await ethers.getSigners();
  const pool = new ethers.Contract(staking, POOL_ABI, deployer);

  // Ensure caller is owner (fail fast with a short message)
  try {
    const owner = await pool.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(`❌ Deployer is not contract owner (${owner})`);
    }
  } catch {
    // If owner() not present (e.g., proxy hiccup), skip this check
  }

  console.log("🚀 Adding staking pool");
  console.log("👤 Deployer:", deployer.address);
  console.log("🔗 Staking:", staking);
  console.log("PID:", pid);
  console.log("🎗️ Charity:", charity);

  const len = Number(await pool.poolLength());

  // Helper: append a pool and return the actual PID using the event (with fallbacks)
  const appendAndGetPid = async () => {
    const preLen = Number(await pool.poolLength());
    const tx = await pool.addPool(charity);
    const receipt = await tx.wait();

    // Try to parse PoolAdded(pid, charityWallet)
    let eventPid = null;
    try {
      for (const log of receipt.logs) {
        try {
          const parsed = pool.interface.parseLog(log);
          if (parsed?.name === "PoolAdded") {
            eventPid = Number(parsed.args.pid);
            break;
          }
        } catch {/* ignore non-matching logs */}
      }
    } catch {/* ignore */}

    if (eventPid !== null && Number.isInteger(eventPid)) {
      return eventPid;
    }

    // Fallback 1: new length - 1
    try {
      const postLen = Number(await pool.poolLength());
      if (postLen > 0) return postLen - 1;
    } catch {/* ignore */}

    // Fallback 2: we just appended one, so PID should be preLen
    return preLen;
  };

  // If PID exists and matches charity, nothing to do
  if (pid < len) {
    const info = await pool.getPoolInfo(pid);
    const current = info.charityWallet ?? info[0];
    if (current.toLowerCase() === charity.toLowerCase()) {
      console.log(`✅ Pool already set at PID ${pid} for this charity.`);
      return;
    }
    const newPid = await appendAndGetPid();
    console.log(`✅ Added pool for charity at PID ${newPid}.`);
    return;
  }

  // If PID is beyond current end, just append once (addPool always appends).
  const finalPid = await appendAndGetPid();
  console.log(`✅ Added pool for charity at PID ${finalPid}.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
