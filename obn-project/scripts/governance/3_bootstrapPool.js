// scripts/7_bootstrapPool.js
// Bootstraps an existing pool's charity deposit using the charity fund key.
// NOTE: This will NOT create pools anymore (owner-only). Create via Timelock first.

require("dotenv").config();
const { ethers } = require("hardhat");
const minimist = require("minimist");

const ERC20_MIN_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const POOL_ABI = [
  "function poolLength() view returns (uint256)",
  "function charityFund() view returns (address)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary) external",
  "function lockedAmount(uint256 pid, address user) view returns (uint256)",
  "function unlockedBalance(uint256 pid, address user) view returns (uint256)",
  "function getUserStakeValue(uint256 pid, address userAddr) view returns (uint256)",
];

function isAddr(a) { return !!a && /^0x[a-fA-F0-9]{40}$/.test(a); }
function mustAddr(a, name = "address") {
  if (!isAddr(a)) throw new Error(`❌ ${name}: invalid or missing -> ${a}`);
  return a;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const argv = minimist(process.argv.slice(2));
  const STAKING = mustAddr(process.env.OBN_STAKING_CONTRACT, "OBN_STAKING_CONTRACT");
  const TOKEN = mustAddr(process.env.OBN_TOKEN_CONTRACT, "OBN_TOKEN_CONTRACT");
  const OBN_CHARITY_FUND_PK = process.env.OBN_CHARITY_FUND_PK;
  if (!OBN_CHARITY_FUND_PK) throw new Error("❌ Set OBN_CHARITY_FUND_PK in .env");

  const amountHuman = String(argv.amount ?? process.env.AMOUNT_OBN ?? "");
  if (!amountHuman) throw new Error("❌ Provide --amount or AMOUNT_OBN in .env");

  let pidArg = argv.pid ?? process.env.TARGET_PID;
  let pid = pidArg !== undefined ? Number(pidArg) : undefined;
  if (pid !== undefined && (!Number.isInteger(pid) || pid < 0)) {
    throw new Error("❌ --pid / TARGET_PID must be a non-negative integer");
  }

  let charityWallet = argv.charity;
  if (!charityWallet && pid !== undefined) charityWallet = process.env[`PID_${pid}`];

  const [reader] = await ethers.getSigners(); // for reads
  const charitySigner = new ethers.Wallet(OBN_CHARITY_FUND_PK, ethers.provider);

  const poolRead = new ethers.Contract(STAKING, POOL_ABI, reader);
  const poolWrite = new ethers.Contract(STAKING, POOL_ABI, charitySigner);
  const tokenChar = new ethers.Contract(TOKEN, ERC20_MIN_ABI, charitySigner);

  // Confirm on-chain charityFund matches our signer
  const chainCharityFund = await poolRead.charityFund();
  const ourCharityFund = await charitySigner.getAddress();
  if (chainCharityFund.toLowerCase() !== ourCharityFund.toLowerCase()) {
    throw new Error(`❌ charityFund mismatch. On-chain: ${chainCharityFund}  Your key: ${ourCharityFund}`);
  }

  // Resolve PID from existing pools
  const poolLen = Number(await poolRead.poolLength());
  if (poolLen === 0) throw new Error("❌ No pools exist. Create via Timelock first.");

  if (pid === undefined) {
    if (!charityWallet) throw new Error("❌ Provide --pid or --charity (or PID_<pid> in .env)");
    mustAddr(charityWallet, "charityWallet");
    let found = -1;
    for (let i = 0; i < poolLen; i++) {
      const info = await poolRead.getPoolInfo(i);
      const cw = info.charityWallet ?? info[0];
      if (cw.toLowerCase() === charityWallet.toLowerCase()) { found = i; break; }
    }
    if (found < 0) throw new Error("❌ Pool for that charity not found. Add via Timelock first.");
    pid = found;
  } else {
    if (pid >= poolLen) throw new Error(`❌ PID ${pid} >= poolLength (${poolLen}). Add via Timelock first.`);
    if (!charityWallet) {
      const info = await poolRead.getPoolInfo(pid);
      charityWallet = info.charityWallet ?? info[0];
    }
  }
  mustAddr(charityWallet, "beneficiary/charityWallet");

  // Amount to wei
  let decimals = 18;
  try { decimals = await tokenChar.decimals(); } catch {}
  const amountWei = ethers.parseUnits(amountHuman, decimals);

  console.log("\n🌱 Bootstrapping deposit…");
  console.log({
    pid,
    beneficiary: charityWallet,
    amountHuman,
    amountWei: amountWei.toString(),
    charitySigner: ourCharityFund,
  });

  const bal = await tokenChar.balanceOf(ourCharityFund);
  if (bal < amountWei) throw new Error(`❌ Insufficient OBN: need ${amountWei} wei, have ${bal} wei`);

  // Ensure allowance
  let allowance = await tokenChar.allowance(ourCharityFund, STAKING);
  if (allowance < amountWei) {
    console.log("🪙 Approving staking to spend charity fund tokens…");
    try {
      const txA = await tokenChar.approve(STAKING, amountWei);
      console.log(`   approve tx: ${txA.hash}`); await txA.wait();
    } catch {
      const tx0 = await tokenChar.approve(STAKING, 0); await tx0.wait();
      const txA2 = await tokenChar.approve(STAKING, amountWei);
      console.log(`   approve(amount) tx: ${txA2.hash}`); await txA2.wait();
    }
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      allowance = await tokenChar.allowance(ourCharityFund, STAKING);
      if (allowance >= amountWei) break;
      await sleep(1200);
    }
    if (allowance < amountWei) throw new Error("❌ Allowance still < amount after approval.");
  }

  // Bootstrap
  try {
    const txB = await poolWrite.charityFundBootstrap(pid, amountWei, charityWallet);
    console.log(`🌾 charityFundBootstrap tx: ${txB.hash}`); await txB.wait();
  } catch (e) {
    console.warn("⚠️ Estimation failed, retrying with manual gasLimit…", e?.message || e);
    await sleep(1500);
    const txB2 = await poolWrite.charityFundBootstrap(pid, amountWei, charityWallet, { gasLimit: 600_000 });
    console.log(`🌾 charityFundBootstrap (retry) tx: ${txB2.hash}`); await txB2.wait();
  }

  await sleep(1200);
  const staked   = await poolRead.getUserStakeValue(pid, charityWallet);
  const locked   = await poolRead.lockedAmount(pid, charityWallet);
  const unlocked = await poolRead.unlockedBalance(pid, charityWallet);

  console.log("\n✅ Done");
  console.log({
    staked: staked.toString(),
    locked: locked.toString(),
    unlocked: unlocked.toString(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
