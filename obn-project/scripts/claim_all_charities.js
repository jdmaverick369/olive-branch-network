// Force-claim all pools' charity wallets without skipping.
// Attempts every pid from 0..poolLength-1.
// If a tx reverts, it logs and continues to the next pid.
//
// Usage (PowerShell):
//   npx hardhat run --network base scripts/claim_all_charities_force.js
//
// Optional env:
//   OBN_STAKING_CONTRACT  (preferred)
//   NEXT_PUBLIC_STAKING_CONTRACT
//   STAKING_CONTRACT
//   GAS_LIMIT   (default 300000)
//   GAS_LIMIT_RETRY (default 500000)
//   MAX_FEE_GWEI (optional; e.g. "1.5")
//   MAX_PRIORITY_FEE_GWEI (optional; e.g. "0.1")

require("dotenv").config();
const { ethers } = require("hardhat");

const ABI = [
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function claimFor(uint256 pid, address user) external",
];

function gweiToWeiStr(g) {
  return g ? ethers.parseUnits(String(g), "gwei") : undefined;
}

function errMsg(e) {
  try {
    if (e?.error?.message) return e.error.message;
    if (e?.shortMessage) return e.shortMessage;
    if (e?.info?.error?.message) return e.info.error.message;
    if (e?.message) return e.message;
  } catch {}
  return "reverted (no message)";
}

async function main() {
  const stakingAddr =
    process.env.OBN_STAKING_CONTRACT ||
    process.env.NEXT_PUBLIC_STAKING_CONTRACT ||
    process.env.STAKING_CONTRACT;

  if (!stakingAddr) {
    throw new Error(
      "Missing OBN_STAKING_CONTRACT (or NEXT_PUBLIC_STAKING_CONTRACT / STAKING_CONTRACT) in env."
    );
  }

  const gasLimitPrimary = Number(process.env.GAS_LIMIT || 300000);
  const gasLimitRetry = Number(process.env.GAS_LIMIT_RETRY || 500000);
  const maxFeePerGas = gweiToWeiStr(process.env.MAX_FEE_GWEI);
  const maxPriorityFeePerGas = gweiToWeiStr(process.env.MAX_PRIORITY_FEE_GWEI);

  const [signer] = await ethers.getSigners();
  const net = await signer.provider.getNetwork();
  const from = await signer.getAddress();

  console.log(
    `\n== OBN | FORCE CLAIM FOR ALL CHARITY WALLETS ==\n` +
      `Network: ${net.name || ""} (chainId ${net.chainId})\n` +
      `From signer: ${from}\n` +
      `Staking contract: ${stakingAddr}\n` +
      `Gas: primary=${gasLimitPrimary}, retry=${gasLimitRetry}\n` +
      (maxFeePerGas ? `maxFeePerGas=${maxFeePerGas} wei\n` : "") +
      (maxPriorityFeePerGas ? `maxPriorityFeePerGas=${maxPriorityFeePerGas} wei\n` : "")
  );

  const staking = new ethers.Contract(stakingAddr, ABI, signer);

  const poolLen = Number(await staking.poolLength());
  console.log(`Found ${poolLen} pools.\n`);

  let sent = 0;
  for (let pid = 0; pid < poolLen; pid++) {
    console.log(`PID ${pid}:`);

    // Always fetch the charity wallet; we still attempt even if it's zero (will revert).
    let charityWallet;
    try {
      const info = await staking.getPoolInfo(pid);
      charityWallet = info.charityWallet;
    } catch (e) {
      console.log(`  ⚠️ getPoolInfo failed: ${errMsg(e)} (continuing)`);
      continue;
    }

    console.log(`  charityWallet: ${charityWallet}`);

    // Build base overrides to avoid estimation
    const baseOverrides = {
      gasLimit: gasLimitPrimary,
    };
    if (maxFeePerGas) baseOverrides.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas) baseOverrides.maxPriorityFeePerGas = maxPriorityFeePerGas;

    // Attempt 1: direct contract call with gasLimit
    try {
      const tx = await staking.claimFor(pid, charityWallet, baseOverrides);
      console.log(`  tx sent: ${tx.hash}`);
      const rcpt = await tx.wait();
      console.log(`  ✅ confirmed in block ${rcpt.blockNumber}\n`);
      sent++;
      // slight pause (RPC polite)
      await new Promise((r) => setTimeout(r, 200));
      continue; // next pid
    } catch (e1) {
      console.log(`  ❌ direct send failed: ${errMsg(e1)}`);
    }

    // Attempt 2: populate raw transaction and send via signer with a bigger gasLimit
    try {
      const overridesRetry = {
        gasLimit: gasLimitRetry,
      };
      if (maxFeePerGas) overridesRetry.maxFeePerGas = maxFeePerGas;
      if (maxPriorityFeePerGas) overridesRetry.maxPriorityFeePerGas = maxPriorityFeePerGas;

      const txReq = await staking.claimFor.populateTransaction(pid, charityWallet, overridesRetry);
      // Ensure 'to' and 'data' set:
      txReq.to = stakingAddr;
      txReq.from = from;
      const sentTx = await signer.sendTransaction(txReq);
      console.log(`  (retry) tx sent: ${sentTx.hash}`);
      const rcpt2 = await sentTx.wait();
      console.log(`  ✅ (retry) confirmed in block ${rcpt2.blockNumber}\n`);
      sent++;
      await new Promise((r) => setTimeout(r, 200));
      continue;
    } catch (e2) {
      console.log(`  ❌ (retry) failed: ${errMsg(e2)}\n`);
      // continue to next pid regardless
    }
  }

  console.log(`Done. Transactions sent: ${sent}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
