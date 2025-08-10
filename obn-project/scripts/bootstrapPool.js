// scripts/bootstrapPool.js
require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;
const argv = require("minimist")(process.argv.slice(2));

const ERC20_MIN_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const POOL_READ_ABI = [
  "function getUserStakeValue(uint256 pid, address userAddr) view returns (uint256)",
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, bool active, uint256 totalStaked)",
  "function paused() view returns (bool)",
  "function lockedAmount(uint256 pid, address user) view returns (uint256)",
  "function unlockedBalance(uint256 pid, address user) view returns (uint256)"
];

function assertAddr(a, why) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`${why}: invalid or missing address -> ${a}`);
  return a;
}

async function main() {
  const {
    OBN_STAKING_ADDRESS,
    OBN_TOKEN_ADDRESS,
    OBN_CHARITY_FUND_PK,
  } = process.env;

  assertAddr(OBN_STAKING_ADDRESS, "OBN_STAKING_ADDRESS");
  assertAddr(OBN_TOKEN_ADDRESS,   "OBN_TOKEN_ADDRESS");
  if (!OBN_CHARITY_FUND_PK) throw new Error("Set OBN_CHARITY_FUND_PK (charity fund signer) in .env");

  // Avoid PowerShell PID var: prefer TARGET_PID; allow CLI --pid
  const targetPidRaw = argv.pid ?? process.env.TARGET_PID ?? process.env.PID;
  const amountHuman  = String(argv.amount ?? process.env.AMOUNT_OBN ?? "");
  console.log("DEBUG → argv.pid =", argv.pid, "| TARGET_PID env =", process.env.TARGET_PID, "| PID env =", process.env.PID);
  console.log("DEBUG → amount =", argv.amount, "| AMOUNT_OBN env =", process.env.AMOUNT_OBN);

  const pid = Number(targetPidRaw);
  if (!Number.isInteger(pid) || pid < 0) throw new Error("TARGET_PID/--pid must be a non-negative integer (e.g. 0,1,2)");
  if (!amountHuman) throw new Error("Provide --amount or AMOUNT_OBN in .env (human units, e.g. 1000000)");

  const envKey = `PID_${pid}`;
  const beneficiary = process.env[envKey];
  assertAddr(beneficiary, `${envKey} (charity wallet for this pool)`);

  const provider = hre.ethers.provider;
  const charitySigner = new ethers.Wallet(OBN_CHARITY_FUND_PK, provider);

  const pool  = await ethers.getContractAt("OBNStakingPools", OBN_STAKING_ADDRESS, charitySigner);
  const poolR = new ethers.Contract(OBN_STAKING_ADDRESS, POOL_READ_ABI, charitySigner);
  const obn   = new ethers.Contract(OBN_TOKEN_ADDRESS,   ERC20_MIN_ABI, charitySigner);

  // Token decimals (fallback 18)
  let decimals = 18;
  try { decimals = await obn.decimals(); } catch (_) {}
  const amountWei = ethers.parseUnits(amountHuman, decimals);
  const fundAddr = await charitySigner.getAddress();

  console.log(`\nBootstrapping PID=${pid}`);
  console.log(`  Beneficiary (${envKey}): ${beneficiary}`);
  console.log(`  Amount: ${amountHuman} OBN (wei: ${amountWei})`);
  console.log(`  PermaLock (this deposit only): true`);
  console.log(`  Charity fund signer: ${fundAddr}`);

  // ---- Preflight checks ----
  const paused = await poolR.paused();
  const len = await poolR.poolLength();
  const info = await poolR.getPoolInfo(pid);
  const active = info.active ?? info[1];
  const totalStaked = info.totalStaked ?? info[2];
  const bal = await obn.balanceOf(fundAddr);
  const allowanceBefore = await obn.allowance(fundAddr, OBN_STAKING_ADDRESS);

  console.log("Preflight:");
  console.log("  paused:", paused);
  console.log("  poolLength:", Number(len));
  console.log("  pool.active:", active, "totalStaked:", totalStaked.toString());
  console.log("  fund balance (wei):", bal.toString());
  console.log("  allowance before (wei):", allowanceBefore.toString());
  console.log("  decimals:", decimals);

  if (paused) throw new Error("Contract is paused");
  if (pid >= Number(len)) throw new Error(`pid ${pid} >= poolLength ${len}`);
  if (!active) throw new Error(`Pool ${pid} is not active`);
  if (bal < amountWei) throw new Error(`Insufficient OBN: need ${amountWei} wei, have ${bal} wei`);

  // ---- Approvals (only if needed) ----
  let didApprove = false;
  if (allowanceBefore < amountWei) {
    console.log("Approving spender…");
    try {
      const txA1 = await obn.approve(OBN_STAKING_ADDRESS, amountWei);
      console.log("  approve(amount) tx:", txA1.hash);
      await txA1.wait();
      didApprove = true;
    } catch (e) {
      console.log("  approve(amount) reverted, trying approve(0) → approve(amount) fallback…");
      const tx0 = await obn.approve(OBN_STAKING_ADDRESS, 0);
      console.log("  approve(0) tx:", tx0.hash);
      await tx0.wait();
      const txA2 = await obn.approve(OBN_STAKING_ADDRESS, amountWei);
      console.log("  approve(amount) tx:", txA2.hash);
      await txA2.wait();
      didApprove = true;
    }
  } else {
    console.log("Allowance sufficient; skipping approve.");
  }

  // ---- If we just approved, wait for the NEXT BLOCK to dodge token cooldown rules ----
  if (didApprove) {
    const startBlock = await provider.getBlockNumber();
    console.log(`Waiting for next block (current ${startBlock}) to avoid token cooldown…`);
    while ((await provider.getBlockNumber()) <= startBlock) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    const newAllowance = await obn.allowance(fundAddr, OBN_STAKING_ADDRESS);
    console.log("  allowance after delay (wei):", newAllowance.toString());
    if (newAllowance < amountWei) throw new Error("Allowance unexpectedly decreased after delay");
  }

  // ---- Live deposit + lock THIS deposit ----
  const txD = await pool.depositForWithLock(pid, amountWei, beneficiary, 0);
  console.log("depositForWithLock tx:", txD.hash);
  await txD.wait();

  // ---- Verify stake & lock slice ----
  let staked;
  try { staked = await poolR.getUserStakeValue(pid, beneficiary); }
  catch { staked = await pool.getUserStakeValue(pid, beneficiary); } // fallback via full ABI if available
  const locked = await poolR.lockedAmount(pid, beneficiary);
  const unlocked = await poolR.unlockedBalance(pid, beneficiary);

  console.log("beneficiary staked (wei):", staked.toString());
  console.log("lockedAmount (wei):", locked.toString());
  console.log("unlockedBalance (wei):", unlocked.toString());
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});