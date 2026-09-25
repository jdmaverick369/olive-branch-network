// Read-only readiness check. No signing, account creation, or broadcast methods.
import { ethers } from "ethers";
import { CdpClient } from "@coinbase/cdp-sdk";
import { disableSubmissionRetries } from "./transport.mjs";

function required(name) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
}
async function main() {
  const names = ["AUTOCLAIM_RPC_URL", "AUTOCLAIM_PAYMASTER_URL", "AUTOCLAIM_CDP_API_KEY_ID",
    "AUTOCLAIM_CDP_API_KEY_SECRET", "AUTOCLAIM_CDP_WALLET_SECRET", "AUTOCLAIM_OWNER", "AUTOCLAIM_EXECUTOR"];
  for (const name of names) required(name);
  const providers = ["AUTOCLAIM_RPC_URL", "AUTOCLAIM_PAYMASTER_URL"].map(name => {
    const url = new URL(required(name));
    if (url.protocol !== "https:") throw new Error("HTTPS endpoint required");
    return new ethers.JsonRpcProvider(url.href);
  });
  try {
    for (const provider of providers) if ((await provider.getNetwork()).chainId !== 8453n) throw new Error("Base mainnet required");
    const owner = ethers.getAddress(required("AUTOCLAIM_OWNER"));
    const executor = ethers.getAddress(required("AUTOCLAIM_EXECUTOR"));
    const cdp = new CdpClient({apiKeyId:required("AUTOCLAIM_CDP_API_KEY_ID"),apiKeySecret:required("AUTOCLAIM_CDP_API_KEY_SECRET"),walletSecret:required("AUTOCLAIM_CDP_WALLET_SECRET")});
    await disableSubmissionRetries();
    const account = await cdp.evm.getAccount({address:owner});
    const smart = await cdp.evm.getSmartAccount({address:executor,owner:account});
    if (smart.address.toLowerCase() !== executor.toLowerCase()) throw new Error("Executor mismatch");
    const staking = new ethers.Contract("0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2", [
      "function version() view returns(string)", "function owner() view returns(address)",
      "function autoClaimExecutor() view returns(address)",
    ], providers[0]);
    const version = await staking.version();
    if ((await staking.owner()).toLowerCase() !== "0x86396526286769ace21982e798df5eef2389f51c") throw new Error("Unexpected staking owner");
    if (!["9.3", "9.3.1"].includes(version)) throw new Error("Unreviewed staking version");
    const upgraded = version === "9.3.1";
    if (upgraded && (await staking.autoClaimExecutor()).toLowerCase() !== executor.toLowerCase()) throw new Error("On-chain executor mismatch");
    const startBlock = Number(process.env.AUTOCLAIM_START_BLOCK);
    const startBlockConfigured = Number.isSafeInteger(startBlock) && startBlock > 0;
    const automationEnabled = process.env.AUTOCLAIM_ENABLED === "true";
    if (automationEnabled && (!upgraded || !startBlockConfigured)) throw new Error("Automation enabled before upgrade configuration is complete");
    if (startBlockConfigured && !await providers[0].getBlock(startBlock)) throw new Error("Upgrade block unavailable");
    console.log(JSON.stringify({configuration:"verified",chainId:8453,version,executor,automationEnabled,startBlockConfigured,readyToClaim:upgraded && startBlockConfigured,transactionsSubmitted:0}));
  } finally { for (const provider of providers) provider.destroy(); }
}
main().catch(() => {
  console.error("Read-only readiness check failed. Check required secret/variable names, endpoint networks, CDP permissions and contract state. Credential-bearing errors suppressed.");
  process.exitCode = 1;
});
