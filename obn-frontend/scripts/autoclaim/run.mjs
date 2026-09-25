import { readFile, writeFile, rename, mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ethers } from "ethers";
import { CdpClient } from "@coinbase/cdp-sdk";
import { executeJob, applyPreferences, findEligiblePools, isAutoClaimDay } from "./core.mjs";
import { disableSubmissionRetries } from "./transport.mjs";

const STAKING = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const LENS = "0x2ae4df523040c0245a6F84342E4B06850c5bdb9b";
const abi = [
  "error NoClaimableRewards()",
  "error AutoClaimDisabled()",
  "error StaleConsent()",
  "error WrongMonth()",
  "function autoClaimExecutor() view returns(address)",
  "function autoClaimPreference(address) view returns(bool,uint256)",
  "function currentAutoClaimMonth() view returns(uint256)",
  "function lastAutoClaimMonth(uint256,address) view returns(uint256)",
  "function poolLength() view returns(uint256)",
  "function userAmount(uint256,address) view returns(uint256)",
  "function autoClaimFor(uint256[],address,uint256,uint256)",
  "event AutoClaimPreferenceChanged(address indexed user,bool enabled,uint256 consentNonce)",
  "event MonthlyAutoClaimed(address indexed user,uint256 indexed pid,uint256 indexed month,uint256 amount)",
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function positiveInteger(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid ${name}`);
  return n;
}

async function main() {
  const runStarted = performance.now();
  const dryRun = process.env.AUTOCLAIM_SEND !== "true";
  if (!dryRun && !isAutoClaimDay()) {
    console.log(JSON.stringify({ status: "outside-claim-day", claimDayUTC: 14, transactionsSubmitted: 0 }));
    return;
  }
  const provider = new ethers.JsonRpcProvider(required("AUTOCLAIM_RPC_URL"));
  if ((await provider.getNetwork()).chainId !== 8453n) throw new Error("Wrong chain: Base mainnet required");
  const executor = ethers.getAddress(required("AUTOCLAIM_EXECUTOR"));
  if (executor === ethers.ZeroAddress) throw new Error("Executor is zero");
  const staking = new ethers.Contract(STAKING, abi, provider);
  const lens = new ethers.Contract(LENS, ["function pendingRewards(uint256,address) view returns(uint256)"], provider);
  if ((await staking.autoClaimExecutor()).toLowerCase() !== executor.toLowerCase()) throw new Error("Executor is not authorized or automation is paused");
  const startBlock = positiveInteger("AUTOCLAIM_START_BLOCK");
  const logRange = positiveInteger("AUTOCLAIM_LOG_RANGE", 5000);
  const maxClaims = positiveInteger("AUTOCLAIM_MAX_CLAIMS", 300);
  const path = resolve(process.env.AUTOCLAIM_STATE_FILE ?? ".autoclaim/state.json");
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, "wx"); // Also serialize local invocations.
  try {
    let state;
    try { state = JSON.parse(await readFile(path, "utf8")); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
    const identity = `8453:${STAKING.toLowerCase()}:${executor.toLowerCase()}:${startBlock}`;
    if (state && (state.identity !== identity || state.schema !== 1)) throw new Error("Journal configuration mismatch");
    state ??= { schema: 1, identity, cursor: startBlock - 1, blockHash: null, users: {}, journal: {} };
    async function save() {
      await writeFile(`${path}.tmp`, JSON.stringify(state, null, 2) + "\n");
      await rename(`${path}.tmp`, path);
    }
    const finalized = await provider.getBlock("finalized");
    if (!finalized || finalized.number < startBlock) throw new Error("Upgrade block is not finalized");
    if (state.blockHash) {
      const previous = await provider.getBlock(state.cursor);
      if (previous?.hash !== state.blockHash) throw new Error("Finalized index block changed; investigate RPC/reorg before continuing");
    }
    for (let from = state.cursor + 1; from <= finalized.number; from += logRange) {
      const to = Math.min(finalized.number, from + logRange - 1);
      const logs = await staking.queryFilter(staking.filters.AutoClaimPreferenceChanged(), from, to);
      applyPreferences(state.users, logs.map(log => ({ user: log.args.user, enabled: log.args.enabled })));
      const block = await provider.getBlock(to);
      if (!block) throw new Error("Index block unavailable");
      state.cursor = to;
      state.blockHash = block.hash;
      await save();
    }
    const indexingMs = Math.round(performance.now() - runStarted);
    let cdp, smartAccount, paymasterUrl;
    if (!dryRun) {
      paymasterUrl = required("AUTOCLAIM_PAYMASTER_URL");
      if (new URL(paymasterUrl).protocol !== "https:") throw new Error("HTTPS paymaster required");
      cdp = new CdpClient({ apiKeyId: required("AUTOCLAIM_CDP_API_KEY_ID"), apiKeySecret: required("AUTOCLAIM_CDP_API_KEY_SECRET"), walletSecret: required("AUTOCLAIM_CDP_WALLET_SECRET") });
      await disableSubmissionRetries();
      const owner = await cdp.evm.getAccount({ address: ethers.getAddress(required("AUTOCLAIM_OWNER")) });
      smartAccount = await cdp.evm.getSmartAccount({ address: executor, owner });
      if (smartAccount.address.toLowerCase() !== executor.toLowerCase()) throw new Error("CDP account mismatch");
    }
    const adapters = {
      journal: state.journal, save, dryRun,
      isSkippableSimulation: error => {
        if (error?.code !== "CALL_EXCEPTION" || typeof error.data !== "string") return false;
        try {
          return ["NoClaimableRewards", "AutoClaimDisabled", "StaleConsent", "WrongMonth"]
            .includes(staking.interface.parseError(error.data)?.name);
        } catch { return false; }
      },
      isClaimed: async job => {
        const blockTag = Math.max(0, await provider.getBlockNumber() - 2);
        return (await Promise.all(job.pids.map(pid => staking.lastAutoClaimMonth(pid, job.user, { blockTag }))))
          .every(month => month === BigInt(job.month));
      },
      simulate: async job => {
        const data = staking.interface.encodeFunctionData("autoClaimFor", [job.pids, job.user, job.month, job.nonce]);
        await provider.call({ from: executor, to: STAKING, data, value: 0n });
      },
      // Use the atomic server endpoint: sendUserOperation() prepares a new hash
      // before applying idempotency, which is unsuitable for lost-response retries.
      send: async (job, idempotencyKey) => {
        if (!isAutoClaimDay()) throw new Error("Claim window closed before submission");
        return cdp.evm.prepareAndSendUserOperation({
        smartAccount, network: "base", paymasterUrl, idempotencyKey,
        calls: [{ to: STAKING, value: 0n, data: staking.interface.encodeFunctionData("autoClaimFor", [job.pids, job.user, job.month, job.nonce]) }],
      });
      },
      wait: async hash => {
        const deadline = Date.now() + 45_000;
        do {
          const operation = await cdp.evm.getUserOperation({ smartAccount: executor, userOpHash: hash });
          if (operation.status === "complete" || operation.status === "failed") return operation;
          if (operation.status === "dropped") return { ...operation, status: "failed" };
          await new Promise(resolve => setTimeout(resolve, 2000));
        } while (Date.now() < deadline);
        throw new Error("Operation is unresolved");
      },
      verify: async (job, hash) => {
        const receipt = await provider.waitForTransaction(hash, 3, 45_000);
        if (!receipt || receipt.status !== 1) throw new Error("Missing/failed execution receipt");
        const events = receipt.logs.filter(log => log.address.toLowerCase() === STAKING.toLowerCase())
          .map(log => { try { return staking.interface.parseLog(log); } catch { return null; } })
          .filter(log => log?.name === "MonthlyAutoClaimed" && log.args.user.toLowerCase() === job.user.toLowerCase()
            && job.pids.includes(Number(log.args.pid)) && log.args.month === BigInt(job.month) && log.args.amount > 0n);
        if (!events.length) throw new Error("Monthly claim event missing");
        for (const event of events) if (await staking.lastAutoClaimMonth(event.args.pid, job.user, { blockTag: receipt.blockNumber }) !== BigInt(job.month)) throw new Error("Monthly claim state missing");
      },
    };
    // Reconcile all ambiguous submissions first, including consent changed/month ended.
    // They must resolve before using this smart account's nonce for another call.
    if (!dryRun) for (const entry of Object.values(state.journal)) {
      if (["submitting", "broadcast"].includes(entry.status)) {
        const status = await executeJob(entry.job, adapters);
        if (status === "already-claimed") { entry.status = "complete"; await save(); }
        console.log(JSON.stringify({ key: entry.job.key, reconciliation: status }));
      }
    }
    const month = String(await staking.currentAutoClaimMonth());
    const pools = Number(await staking.poolLength());
    if (!Number.isSafeInteger(pools) || pools > 10000) throw new Error("Unexpected pool count");
    let submitted = 0;
    let walletsChecked = 0;
    let eligibilityMs = 0;
    for (const user of Object.keys(state.users).sort()) {
      walletsChecked++;
      const eligibilityStarted = performance.now();
      const [enabled, nonce] = await staking.autoClaimPreference(user);
      if (!enabled) { eligibilityMs += performance.now() - eligibilityStarted; continue; }
      const eligiblePools = await findEligiblePools(user, pools, month, staking, lens);
      eligibilityMs += performance.now() - eligibilityStarted;
      // One operation for all eligible pools; split only above the on-chain gas bound.
      for (let offset = 0; offset < eligiblePools.length && submitted < maxClaims; offset += 32) {
        const pids = eligiblePools.slice(offset, offset + 32);
        const key = `${identity}:${user}:${pids.join(",")}:${month}:${nonce}`;
        const job = { key, user, pids, month, nonce: String(nonce) };
        // An error after submission stops the run with its journal intact.
        const batchStarted = performance.now();
        const status = await executeJob(job, adapters);
        submitted++;
        console.log(JSON.stringify({ user, pools: pids, month, status, durationMs: Math.round(performance.now() - batchStarted) }));
      }
      if (submitted >= maxClaims) break;
    }
    console.log(JSON.stringify({ dryRun, indexedThrough: state.cursor, considered: submitted, limit: maxClaims, walletsChecked, optedInWallets: Object.keys(state.users).length, indexingMs, eligibilityMs: Math.round(eligibilityMs), totalDurationMs: Math.round(performance.now() - runStarted) }));
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(() => {
  // SDK/RPC errors can contain credential-bearing request URLs. Keep them out of CI logs.
  console.error("Autoclaim stopped. Check configuration, chain state and the saved journal before retrying; no uncertain operation was marked successful.");
  process.exitCode = 1;
});
