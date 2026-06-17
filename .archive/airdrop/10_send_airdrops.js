// scripts/10_send_airdrops.js
const fs = require("fs");
const csv = require("csv-parser");
const minimist = require("minimist");
const { ethers } = require("hardhat");

// Load envs: .env first, then .env.airdrop (airdrop-specific overrides)
require("dotenv").config();
require("dotenv").config({ path: ".env.airdrop" });

const {
  AIRDROPPER_ADDRESS,
  BASE_MAINNET_URL,   // primary RPC (e.g., Alchemy)
  BASE_MAINNET_URL_2, // optional secondary RPC (e.g., https://mainnet.base.org)
  AIRDROP_PRIVATE_KEY,
} = process.env;

if (!AIRDROPPER_ADDRESS) throw new Error("Missing AIRDROPPER_ADDRESS in env.");
if (!BASE_MAINNET_URL) throw new Error("Missing BASE_MAINNET_URL in env.");
if (!AIRDROP_PRIVATE_KEY) throw new Error("Missing AIRDROP_PRIVATE_KEY in env.");

if (!ethers.isAddress(AIRDROPPER_ADDRESS)) {
  throw new Error("AIRDROPPER_ADDRESS is not a valid address.");
}

const CSV_FILE_PATH = "./airdrop_list.csv";
const DEFAULT_CHUNK_SIZE = 300;
const DECIMALS = 18;
const CHECKPOINT_FILE = ".airdrop_checkpoint.json";
const DEFAULT_PAUSE_MS = 1500;
const MAX_RETRIES = 5;

console.log("🔐 Using AIRDROPPER_ADDRESS:", AIRDROPPER_ADDRESS);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientError(e) {
  const code = e && (e.code || e.name);
  const status = e?.info?.responseStatus;
  const body = e?.info?.responseBody || "";
  return (
    code === "SERVER_ERROR" ||
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    status === "503 Service Unavailable" ||
    /Forwarder error/i.test(body)
  );
}

// Load CSV rows as { address, amountBig }
async function loadCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        const addr = (data.address || "").trim();
        const amtStr = (data.amount || "").trim();
        if (!addr || !amtStr) return;
        if (!ethers.isAddress(addr)) return;
        try {
          const amountBig = ethers.parseUnits(amtStr, DECIMALS);
          rows.push({ address: addr, amountBig });
        } catch {
          // skip invalid numeric rows
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// Optional: write a simple checkpoint so we can resume
function saveCheckpoint(obj) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(obj, null, 2));
}
function loadCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const CHUNK_SIZE = Number(argv["chunk-size"] || DEFAULT_CHUNK_SIZE);
  const START_BATCH = Number(argv["start-batch"] || 1);
  const PAUSE_MS = Number(argv["pause-ms"] || DEFAULT_PAUSE_MS);

  // Provider with optional fallback
  const p1 = new ethers.JsonRpcProvider(BASE_MAINNET_URL);
  const provider =
    BASE_MAINNET_URL_2 && BASE_MAINNET_URL_2 !== ""
      ? new ethers.FallbackProvider(
          [p1, new ethers.JsonRpcProvider(BASE_MAINNET_URL_2)],
          1 // quorum: first that works
        )
      : p1;

  const signer = new ethers.Wallet(AIRDROP_PRIVATE_KEY, provider);

  const abi = [
    "function batchAirdrop(address[] recipients, uint256[] amounts) external",
  ];
  const contract = new ethers.Contract(AIRDROPPER_ADDRESS, abi, signer);

  // Load CSV
  const entries = await loadCsv(CSV_FILE_PATH);
  if (!entries.length) {
    throw new Error(`No valid rows found in ${CSV_FILE_PATH}. Make sure it has "address,amount" headers.`);
  }
  console.log(`📦 Total recipients loaded from CSV: ${entries.length}`);

  // Optional checkpoint resume
  const cp = loadCheckpoint();
  let resumeBatch = START_BATCH;
  if (cp?.lastBatchSuccess && cp.total === entries.length) {
    resumeBatch = Math.max(resumeBatch, cp.lastBatchSuccess + 1);
  }
  if (resumeBatch > START_BATCH) {
    console.log(`⏩ Resuming from batch ${resumeBatch} based on checkpoint (${CHECKPOINT_FILE})`);
  }

  // Chunk into batches
  const batches = [];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    batches.push(entries.slice(i, i + CHUNK_SIZE));
  }

  // Helper: estimate gas with a 20% buffer
  async function estimateGasBuffered(recipients, amounts) {
    try {
      const est = await contract.estimateGas.batchAirdrop(recipients, amounts);
      return (est * 12n) / 10n; // +20%
    } catch (e) {
      // If estimate fails due to provider flake or non-static call paths, fall back to a safe ceiling.
      console.warn("⚠️ estimateGas failed, using static gas limit 10,500,000:", e?.message || e);
      return 10_500_000n;
    }
  }

  async function getFeeOverrides() {
    try {
      const fd = await provider.getFeeData();
      // On OP-stack L2s, base fees are small; add a small bump to be safe
      const maxFee = fd.maxFeePerGas ? (fd.maxFeePerGas * 11n) / 10n : undefined;
      const maxPriority = fd.maxPriorityFeePerGas || 0n;
      return (maxFee && maxPriority !== undefined)
        ? { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPriority }
        : {};
    } catch {
      return {};
    }
  }

  async function sendBatchWithRetry(batchIndex, recipients, amounts) {
    const tag = `batch ${batchIndex}`;
    const gasLimit = await estimateGasBuffered(recipients, amounts);
    const feeOverrides = await getFeeOverrides();

    let tx;
    // Retry the *send* step
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        tx = await contract.batchAirdrop(recipients, amounts, {
          gasLimit,
          ...feeOverrides,
        });
        console.log(`⏳ TX sent for ${tag}: ${tx.hash}`);
        break;
      } catch (e) {
        if (!isTransientError(e) || attempt === MAX_RETRIES) {
          throw new Error(`Send failed (${tag}) after ${attempt} attempts: ${e.message || e}`);
        }
        const delay = Math.min(30_000, 2 ** attempt * 1_000);
        console.warn(`⚠️ Transient send error (${tag}) attempt ${attempt}: ${e.code || e}. Retrying in ${delay}ms`);
        await sleep(delay);
      }
    }

    // Retry the *wait/receipt* step
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // You can also do: const receipt = await tx.wait(1);
        const receipt = await provider.waitForTransaction(tx.hash, 1, 120_000);
        if (!receipt) throw new Error("No receipt (timeout)");
        if (receipt.status !== 1) throw new Error(`Receipt status 0 (reverted)`);
        console.log(`✅ ${tag} confirmed in block ${receipt.blockNumber}. Gas used: ${receipt.gasUsed}`);
        return receipt;
      } catch (e) {
        // If it might actually be mined, try to fetch receipt directly before declaring failure
        try {
          const rc = await provider.getTransactionReceipt(tx.hash);
          if (rc && rc.status === 1) {
            console.log(`✅ ${tag} confirmed (polled) in block ${rc.blockNumber}. Gas used: ${rc.gasUsed}`);
            return rc;
          }
          if (rc && rc.status === 0) {
            throw new Error(`Receipt status 0 (reverted)`);
          }
        } catch {}
        if (!isTransientError(e) || attempt === MAX_RETRIES) {
          throw new Error(`Wait failed (${tag}) after ${attempt} attempts: ${e.message || e}`);
        }
        const delay = Math.min(30_000, 2 ** attempt * 1_000);
        console.warn(`⚠️ Transient wait error (${tag}) attempt ${attempt}: ${e.code || e}. Retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  for (let b = resumeBatch; b <= batches.length; b++) {
    const batch = batches[b - 1];
    const recipients = batch.map((x) => x.address);
    const amounts = batch.map((x) => x.amountBig);

    console.log(`🚀 Sending batch ${b} (${recipients.length} addresses)…`);

    try {
      await sendBatchWithRetry(b, recipients, amounts);
      saveCheckpoint({ lastBatchSuccess: b, total: entries.length, chunkSize: CHUNK_SIZE });
      if (PAUSE_MS > 0) await sleep(PAUSE_MS);
    } catch (err) {
      console.error(`❌ TX failed for batch ${b}`);
      console.error("Recipients sample:", recipients.slice(0, 5), recipients.length > 5 ? `… (+${recipients.length - 5} more)` : "");
      console.error(
        "Amounts sample:",
        amounts.slice(0, 5).map((a) => a.toString()),
        amounts.length > 5 ? `… (+${amounts.length - 5} more)` : ""
      );
      console.error("Error:", err?.message || err);
      throw err;
    }
  }

  console.log("🎉 All airdrop batches completed.");
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
