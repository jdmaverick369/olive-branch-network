// scripts/7_bootstrapPool.js
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

const POOL_ABI = [
  "function addPool(address charityWallet) external",
  "function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary) external",
  "function poolLength() view returns (uint256)",
  "function owner() view returns (address)",
  "function charityFund() view returns (address)",
  // UPDATED signature: no 'active' in return values
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function lockedAmount(uint256 pid, address user) view returns (uint256)",
  "function unlockedBalance(uint256 pid, address user) view returns (uint256)",
  "function getUserStakeValue(uint256 pid, address userAddr) view returns (uint256)"
];

const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const mustAddr = (a, name) => {
  if (!isAddr(a)) throw new Error(`❌ ${name}: invalid or missing address -> ${a}`);
  return a;
};

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log("🚀 Add & Bootstrap Pool");

  const {
    OBN_STAKING_CONTRACT,
    OBN_TOKEN_CONTRACT,
    OBN_CHARITY_FUND_PK,
  } = process.env;

  mustAddr(OBN_STAKING_CONTRACT, "OBN_STAKING_CONTRACT");
  mustAddr(OBN_TOKEN_CONTRACT, "OBN_TOKEN_CONTRACT");
  if (!OBN_CHARITY_FUND_PK) throw new Error("❌ Set OBN_CHARITY_FUND_PK in .env");

  const amountHuman = String(argv.amount ?? process.env.AMOUNT_OBN ?? "");
  if (!amountHuman) throw new Error("❌ Provide --amount or AMOUNT_OBN in .env");

  let pidArg = argv.pid ?? process.env.TARGET_PID;
  let pid = pidArg !== undefined ? Number(pidArg) : undefined;
  if (pid !== undefined && (!Number.isInteger(pid) || pid < 0)) {
    throw new Error("❌ --pid / TARGET_PID must be a non-negative integer");
  }

  let charityWallet = argv.charity;
  if (!charityWallet && pid !== undefined) {
    const envKey = `PID_${pid}`;
    charityWallet = process.env[envKey];
  }

  const [ownerSigner] = await ethers.getSigners();
  const charitySigner = new ethers.Wallet(OBN_CHARITY_FUND_PK, ethers.provider);

  const poolOwner = new ethers.Contract(OBN_STAKING_CONTRACT, POOL_ABI, ownerSigner);
  const poolRead  = new ethers.Contract(OBN_STAKING_CONTRACT, POOL_ABI, ownerSigner);
  const poolChar  = new ethers.Contract(OBN_STAKING_CONTRACT, POOL_ABI, charitySigner);
  const tokenChar = new ethers.Contract(OBN_TOKEN_CONTRACT, ERC20_MIN_ABI, charitySigner);

  const charityFundOnChain = await poolRead.charityFund();
  const ourCharityFund = await charitySigner.getAddress();
  if (charityFundOnChain.toLowerCase() !== ourCharityFund.toLowerCase()) {
    throw new Error(`❌ charityFund mismatch. On-chain: ${charityFundOnChain}  Your key: ${ourCharityFund}`);
  }

  let poolLen = Number(await poolRead.poolLength());
  console.log(`ℹ️ poolLength = ${poolLen}`);

  if (poolLen === 0) {
    if (!charityWallet) charityWallet = process.env.PID_0;
    mustAddr(charityWallet, "charityWallet for first pool");
    const tx = await poolOwner.addPool(charityWallet);
    console.log(`✅ Pool created at PID=0 (tx: ${tx.hash})`);
    await tx.wait();
    pid = 0;
  } else {
    if (pid === undefined) {
      if (!charityWallet) throw new Error("❌ Provide --pid or --charity");
      mustAddr(charityWallet, "charityWallet");
      let foundPid = -1;
      for (let i = 0; i < poolLen; i++) {
        const info = await poolRead.getPoolInfo(i); // returns [charityWallet, totalStaked]
        const cw = info.charityWallet ?? info[0];
        if (cw.toLowerCase() === charityWallet.toLowerCase()) {
          foundPid = i;
          break;
        }
      }
      if (foundPid >= 0) {
        pid = foundPid;
      } else {
        const tx = await poolOwner.addPool(charityWallet);
        await tx.wait();
        pid = Number(await poolRead.poolLength()) - 1;
        console.log(`✅ Pool added at PID=${pid}`);
      }
    } else if (pid >= poolLen) {
      if (!charityWallet) charityWallet = process.env[`PID_${pid}`];
      mustAddr(charityWallet, `PID_${pid} / --charity`);
      const tx = await poolOwner.addPool(charityWallet);
      await tx.wait();
      pid = Number(await poolRead.poolLength()) - 1;
      console.log(`✅ Pool added at PID=${pid}`);
    } else {
      if (!charityWallet) {
        const info = await poolRead.getPoolInfo(pid);
        charityWallet = info.charityWallet ?? info[0];
      }
    }
  }

  // UPDATED: no 'active' flag to check anymore
  const info = await poolRead.getPoolInfo(pid);
  mustAddr(charityWallet, "beneficiary/charityWallet");

  let decimals = 18;
  try { decimals = await tokenChar.decimals(); } catch {}
  const amountWei = ethers.parseUnits(amountHuman, decimals);

  console.log("\n🌱 Bootstrapping deposit...");
  console.log(`  PID           : ${pid}`);
  console.log(`  Beneficiary   : ${charityWallet}`);
  console.log(`  Amount        : ${amountHuman} OBN (${amountWei} wei)`);
  console.log(`  Charity Signer: ${ourCharityFund}`);

  const bal = await tokenChar.balanceOf(ourCharityFund);
  if (bal < amountWei) throw new Error(`❌ Insufficient OBN: need ${amountWei} wei, have ${bal} wei`);

  // Ensure allowance
  let allowance = await tokenChar.allowance(ourCharityFund, OBN_STAKING_CONTRACT);
  if (allowance < amountWei) {
    console.log("🪙 Approving staking to spend charity fund tokens…");
    try {
      const txA = await tokenChar.approve(OBN_STAKING_CONTRACT, amountWei);
      console.log(`   approve tx: ${txA.hash}`);
      await txA.wait();
    } catch {
      const tx0 = await tokenChar.approve(OBN_STAKING_CONTRACT, 0);
      await tx0.wait();
      const txA2 = await tokenChar.approve(OBN_STAKING_CONTRACT, amountWei);
      console.log(`   approve(amount) tx: ${txA2.hash}`);
      await txA2.wait();
    }

    // 🔄 Poll allowance until the RPC indexes it (avoids stale-estimate reverts)
    const deadline = Date.now() + 20_000; // up to ~20s
    while (Date.now() < deadline) {
      allowance = await tokenChar.allowance(ourCharityFund, OBN_STAKING_CONTRACT);
      if (allowance >= amountWei) break;
      await sleep(1200);
    }
    if (allowance < amountWei) {
      throw new Error(`❌ Allowance still < amount after approval. allowance=${allowance} need=${amountWei}`);
    }
  }

  // Call charityFundBootstrap with a retry that bypasses estimateGas if needed
  let sent = false;
  try {
    const txB = await poolChar.charityFundBootstrap(pid, amountWei, charityWallet);
    console.log(`🌾 charityFundBootstrap tx: ${txB.hash}`);
    await txB.wait();
    sent = true;
  } catch (e) {
    console.warn("⚠️ charityFundBootstrap estimation failed, retrying with manual gasLimit…", e.message || e);
    await sleep(2000);
    const txB2 = await poolChar.charityFundBootstrap(pid, amountWei, charityWallet, { gasLimit: 600_000 });
    console.log(`🌾 charityFundBootstrap (retry) tx: ${txB2.hash}`);
    await txB2.wait();
    sent = true;
  }

  if (!sent) throw new Error("❌ charityFundBootstrap could not be sent");

  // 🕒 Small delay to ensure state is fully updated before reading
  await sleep(2000);

  const staked   = await poolRead.getUserStakeValue(pid, charityWallet);
  const locked   = await poolRead.lockedAmount(pid, charityWallet);
  const unlocked = await poolRead.unlockedBalance(pid, charityWallet);

  console.log("\n✅ Done");
  console.log(`  staked (wei)     : ${staked}`);
  console.log(`  lockedAmount     : ${locked}`);
  console.log(`  unlockedBalance  : ${unlocked}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
