// scripts/vesting_status.js
require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;

const VESTING_ABI = [
  "function token() view returns (address)",
  "function teamWallet() view returns (address)",
  "function start() view returns (uint256)",
  "function CLIFF() view returns (uint256)",
  "function DURATION() view returns (uint256)",
  "function released() view returns (uint256)",
  "function vestedAmount() view returns (uint256)",
  // helpers added in your latest contract:
  "function claimableNow() view returns (uint256)",
  "function timeUntilCliff() view returns (uint256)",
  "function timeUntilNextRelease() view returns (uint256)",
  "function nextReleaseTimestamp() view returns (uint256)",
];

const ERC20_MIN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

function fmtAmount(v, decimals) {
  try { return ethers.formatUnits(v, decimals); } catch { return v.toString(); }
}

function fmtDuration(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return "0s";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  return [
    d ? `${d}d` : null,
    h ? `${h}h` : null,
    m ? `${m}m` : null,
    r ? `${r}s` : null,
  ].filter(Boolean).join(" ");
}

async function main() {
  const vestingAddr = process.env.TEAM_VESTING_CONTRACT;
  const tokenAddrEnv = process.env.OBN_TOKEN_CONTRACT; // optional (we can read from vesting)

  if (!vestingAddr || !ethers.isAddress(vestingAddr)) {
    throw new Error("❌ Set TEAM_VESTING_CONTRACT in .env");
  }

  const vesting = new ethers.Contract(vestingAddr, VESTING_ABI, ethers.provider);

  // Resolve token address (prefer the contract’s own token())
  let tokenAddr;
  try {
    tokenAddr = await vesting.token();
  } catch {
    tokenAddr = tokenAddrEnv;
  }
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) {
    throw new Error("❌ Could not determine token address (token() failed and OBN_TOKEN_CONTRACT not set).");
  }

  const token = new ethers.Contract(tokenAddr, ERC20_MIN_ABI, ethers.provider);

  // Static reads
  const [
    teamWallet,
    start,
    CLIFF,
    DURATION,
    released,
    vested,
    timeUntilCliff,
  ] = await Promise.all([
    vesting.teamWallet(),
    vesting.start(),
    vesting.CLIFF(),
    vesting.DURATION(),
    vesting.released(),
    vesting.vestedAmount(),
    vesting.timeUntilCliff().catch(() => 0n),
  ]);

  const [bal, decimals, symbol] = await Promise.all([
    token.balanceOf(vestingAddr),
    token.decimals().catch(() => 18),
    token.symbol().catch(() => "TOKEN"),
  ]);

  // Prefer direct helper for claimable; fallback to vested - released
  let claimable;
  try {
    claimable = await vesting.claimableNow();
  } catch {
    claimable = vested - released;
    if (claimable < 0n) claimable = 0n;
  }

  const now = Math.floor(Date.now() / 1000);
  const cliffAt = Number(start + CLIFF);
  const vestEnd = Number(start + CLIFF + DURATION);

  console.log("📊 Team Vesting Status");
  console.log("──────────────────────");
  console.log("Vesting contract:", vestingAddr);
  console.log("Token address   :", tokenAddr, `(${symbol})`);
  console.log("Team wallet     :", teamWallet);
  console.log("");

  console.log("Schedule");
  console.log("  start (unix)        :", Number(start));
  console.log("  cliff (unix)        :", cliffAt);
  console.log("  vest end (unix)     :", vestEnd);
  console.log("  now (unix)          :", now);
  console.log("");

  console.log("Balances");
  console.log(`  contract balance    : ${fmtAmount(bal, decimals)} ${symbol}`);
  console.log(`  total released      : ${fmtAmount(released, decimals)} ${symbol}`);
  console.log(`  total vested (so far): ${fmtAmount(vested, decimals)} ${symbol}`);
  console.log(`  claimable (unlocked): ${fmtAmount(claimable, decimals)} ${symbol}`);
  console.log("");

  // Vesting status
  if (now < cliffAt) {
    console.log("⏳ Cliff not reached yet.");
    console.log("  time until cliff    :", fmtDuration(timeUntilCliff));
    console.log("  cliff date (unix)   :", cliffAt);
  } else if (now >= vestEnd) {
    console.log("✅ Fully vested. All remaining tokens are unlocked (if any remain in the contract).");
  } else {
    // Calculate vesting progress and rates
    const elapsed = now - cliffAt;
    const vestingDuration = Number(DURATION);
    const progressPct = (elapsed / vestingDuration) * 100;
    const totalAllocation = bal + released;

    // Unlock rates (tokens are in wei, need to convert)
    const tokensPerSecond = Number(totalAllocation) / 1e18 / vestingDuration;
    const tokensPerDay = tokensPerSecond * 86400;
    const tokensPerMonth = tokensPerDay * 30;

    const timeRemaining = vestEnd - now;
    const daysRemaining = Math.floor(timeRemaining / 86400);
    const monthsRemaining = Math.floor(daysRemaining / 30);
    const daysRemainingAfterMonths = daysRemaining % 30;

    console.log("⏱️  Vesting in progress");
    console.log(`  progress            : ${progressPct.toFixed(2)}% complete`);
    console.log(`  unlock rate         : ${tokensPerDay.toLocaleString(undefined, {maximumFractionDigits: 2})} OBN per day`);
    console.log(`                      : ${tokensPerMonth.toLocaleString(undefined, {maximumFractionDigits: 2})} OBN per month`);
    console.log(`  time remaining      : ${monthsRemaining} month${monthsRemaining !== 1 ? 's' : ''}, ${daysRemainingAfterMonths} day${daysRemainingAfterMonths !== 1 ? 's' : ''}`);
    console.log(`  full vesting at     : ${vestEnd} (unix)`);
  }

  console.log("");
  console.log("Tip: run again after calling release() to see updated totals.");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
