/**
 * phase_countdown.js
 * Reads the emission phase schedule from StakingPools and shows:
 *   - Current phase and APY
 *   - Exact time remaining until the next phase
 *   - Full phase schedule with dates
 *
 * Usage:
 *   npx hardhat run scripts/phase_countdown.js --network base
 */

require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_ABI = [
  "function phases(uint256 index) view returns (uint256 start, uint256 end, uint256 bps)",
  "function currentRewardsPerSecond() view returns (uint256)",
  "function globalTotalStaked() view returns (uint256)",
];

const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
];

function mustAddr(val, name) {
  if (!val || !/^0x[a-fA-F0-9]{40}$/.test(val)) {
    throw new Error(`❌ Missing or invalid address for ${name}: "${val}"`);
  }
  return val;
}

function formatDuration(seconds) {
  const s = Number(seconds);
  const days    = Math.floor(s / 86400);
  const hours   = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs    = s % 60;

  const parts = [];
  if (days    > 0) parts.push(`${days}d`);
  if (hours   > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs    > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

function formatDate(ts) {
  return new Date(Number(ts) * 1000).toUTCString();
}

function bpsToApy(bps) {
  return (Number(bps) / 100).toFixed(2);
}

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`\n🌐 Network: ${network.name} (chainId ${network.chainId})`);

  const STAKING = mustAddr(process.env.OBN_STAKING_CONTRACT, "OBN_STAKING_CONTRACT");
  const TOKEN   = mustAddr(process.env.OBN_TOKEN_CONTRACT,   "OBN_TOKEN_CONTRACT");

  const [signer] = await ethers.getSigners();
  const staking  = new ethers.Contract(STAKING, STAKING_ABI, signer);
  const token    = new ethers.Contract(TOKEN,   TOKEN_ABI,   signer);

  const decimals    = await token.decimals();
  const nowTs       = BigInt(Math.floor(Date.now() / 1000));
  const globalStaked = await staking.globalTotalStaked();
  const rps         = await staking.currentRewardsPerSecond();

  // Read all phases until we get a revert (dynamic array)
  const phases = [];
  for (let i = 0; i < 20; i++) {
    try {
      const [start, end, bps] = await staking.phases(i);
      phases.push({ index: i, start, end, bps });
    } catch {
      break;
    }
  }

  if (phases.length === 0) {
    throw new Error("❌ No phases found in contract.");
  }

  // Find current phase
  let currentPhase = null;
  let nextPhase    = null;

  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (nowTs >= ph.start && nowTs < ph.end) {
      currentPhase = ph;
      nextPhase    = phases[i + 1] ?? null;
      break;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  FULL PHASE SCHEDULE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (const ph of phases) {
    const active = (nowTs >= ph.start && nowTs < ph.end) ? " ◀ CURRENT" : "";
    const past   = nowTs >= ph.end ? " (ended)" : "";
    console.log(
      `  Phase ${ph.index + 1} | APY: ${bpsToApy(ph.bps).padStart(5)}%` +
      ` | ${formatDate(ph.start)} → ${formatDate(ph.end)}${active}${past}`
    );
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  CURRENT STATUS`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (!currentPhase) {
    const lastPhase = phases[phases.length - 1];
    if (nowTs >= lastPhase.end) {
      console.log(`  ⚠️  All phases have ended. Emissions are ZERO.`);
      console.log(`      Last phase ended: ${formatDate(lastPhase.end)}`);
    } else {
      // Before first phase
      const timeUntilFirst = phases[0].start - nowTs;
      console.log(`  ⏳ Emissions not yet started.`);
      console.log(`  First phase begins in: ${formatDuration(timeUntilFirst)}`);
      console.log(`  First phase start:     ${formatDate(phases[0].start)}`);
    }
  } else {
    const timeLeft = currentPhase.end - nowTs;
    const pct      = Number((nowTs - currentPhase.start) * 10000n / (currentPhase.end - currentPhase.start)) / 100;

    console.log(`  Current phase : ${currentPhase.index + 1} of ${phases.length}`);
    console.log(`  Current APY   : ${bpsToApy(currentPhase.bps)}%`);
    console.log(`  Phase started : ${formatDate(currentPhase.start)}`);
    console.log(`  Phase ends    : ${formatDate(currentPhase.end)}`);
    console.log(`  Progress      : ${pct.toFixed(2)}% complete`);
    console.log(`\n  ⏳ Time until next phase: ${formatDuration(timeLeft)}`);
    console.log(`     (${timeLeft.toString()} seconds)`);

    if (nextPhase) {
      console.log(`\n  Next phase    : Phase ${nextPhase.index + 1}`);
      console.log(`  Next APY      : ${bpsToApy(nextPhase.bps)}%`);
      console.log(`  APY change    : ${bpsToApy(currentPhase.bps)}% → ${bpsToApy(nextPhase.bps)}% (-${(Number(currentPhase.bps - nextPhase.bps) / 100).toFixed(2)}%)`);
    } else {
      console.log(`\n  ⚠️  No further phases defined. Emissions will cease after this phase.`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  LIVE EMISSION RATE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Global staked     : ${ethers.formatUnits(globalStaked, decimals)} OBN`);
  console.log(`  Rewards/second    : ${ethers.formatUnits(rps, decimals)} OBN`);
  console.log(`  Rewards/day       : ${ethers.formatUnits(rps * 86400n, decimals)} OBN`);
  console.log(`  Rewards/year      : ${ethers.formatUnits(rps * 31536000n, decimals)} OBN`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
