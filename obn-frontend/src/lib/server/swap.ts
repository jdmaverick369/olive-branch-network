import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { EURC_BASE_ADDRESS } from "@/lib/eurc";
import { ApiError, createResourceGuard, fetchJsonBounded, isRecord } from "./http";

const UINT256_MAX = (1n << 256n) - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const allowedFields = new Set(["fromToken", "toToken", "fromAmount", "taker", "slippageBps"]);
export type SwapInput = { fromToken: string; toToken: string; fromAmount: string; taker: string; slippageBps: number };

export function parseSwapInput(value: unknown): SwapInput {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedFields.has(key))) throw new ApiError(400, "Invalid swap parameters");
  const { fromToken, toToken, fromAmount, taker, slippageBps = 100 } = value;
  if (typeof fromToken !== "string" || typeof toToken !== "string" || typeof taker !== "string" ||
      !ADDRESS.test(fromToken) || !ADDRESS.test(toToken) || !ADDRESS.test(taker) ||
      typeof fromAmount !== "string" || !/^[1-9]\d{0,77}$/.test(fromAmount) || BigInt(fromAmount) > UINT256_MAX ||
      (slippageBps !== 50 && slippageBps !== 100)) throw new ApiError(400, "Invalid swap parameters");
  const obn = (process.env.NEXT_PUBLIC_OBN_TOKEN ?? "").toLowerCase();
  const allowed = new Set([
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", EURC_BASE_ADDRESS.toLowerCase(), obn,
  ]);
  const from = fromToken.toLowerCase(), to = toToken.toLowerCase();
  if (!allowed.has(from) || !allowed.has(to) || from === to || (from !== obn && to !== obn)) {
    throw new ApiError(400, "Unsupported token pair");
  }
  return { fromToken, toToken, fromAmount, taker, slippageBps };
}

const prices = createResourceGuard({ requestsPerMinute: 120, maxConcurrent: 8, cacheMs: 3_000, maxEntries: 128 });
// Executable quotes may contain a unique Permit2 nonce: never cache or coalesce them.
const quotes = createResourceGuard({ requestsPerMinute: 60, maxConcurrent: 4, coalesce: false });

function unsigned(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value) || BigInt(value) > UINT256_MAX) throw new Error("Invalid provider amount");
  return BigInt(value).toString();
}

function fee(value: unknown) {
  if (value == null) return undefined;
  if (!isRecord(value) || typeof value.token !== "string" || !ADDRESS.test(value.token)) throw new Error("Invalid provider fee");
  return { amount: unsigned(value.amount), token: value.token };
}

function quoteIssues(value: Record<string, unknown>) {
  let allowance, balance;
  if (value.allowance != null) {
    if (!isRecord(value.allowance) || typeof value.allowance.spender !== "string" || !ADDRESS.test(value.allowance.spender)) throw new Error("Invalid provider allowance");
    allowance = { currentAllowance: unsigned(value.allowance.currentAllowance), spender: value.allowance.spender };
  }
  if (value.balance != null) {
    if (!isRecord(value.balance) || typeof value.balance.token !== "string" || !ADDRESS.test(value.balance.token)) throw new Error("Invalid provider balance");
    balance = { token: value.balance.token, currentBalance: unsigned(value.balance.currentBalance), requiredBalance: unsigned(value.balance.requiredBalance) };
  }
  if (value.simulationIncomplete !== undefined && typeof value.simulationIncomplete !== "boolean") throw new Error("Invalid provider simulation");
  return { allowance, balance, simulationIncomplete: value.simulationIncomplete };
}

async function requestSwap(method: "GET" | "POST", input: SwapInput) {
  const apiKeyId = process.env.CDP_API_KEY_NAME;
  const apiKeySecret = process.env.CDP_API_KEY_PRIVATE_KEY;
  if (!apiKeyId || !apiKeySecret) throw new ApiError(503, "Swap service unavailable");
  // Matches the pinned CDP SDK's generated evm-swaps endpoints and auth hook.
  // Its public signing helper plus fetch allow cancellation and bounded response reads.
  const pathname = method === "GET" ? "/platform/v2/evm/swaps/quote" : "/platform/v2/evm/swaps";
  const token = await generateJwt({ apiKeyId, apiKeySecret, requestMethod: method,
    requestHost: "api.cdp.coinbase.com", requestPath: pathname, expiresIn: 120 });
  const payload = { network: "base", ...input };
  const query = new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)]));
  const data = await fetchJsonBounded(`https://api.cdp.coinbase.com${pathname}${method === "GET" ? "?" + query : ""}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  }, { timeoutMs: 10_000, maxBytes: 512 * 1024 });
  if (!isRecord(data) || typeof data.liquidityAvailable !== "boolean") throw new Error("Invalid provider response");
  if (!data.liquidityAvailable) return { liquidityAvailable: false };
  if (method === "GET") return { liquidityAvailable: true, toAmount: unsigned(data.toAmount), minToAmount: unsigned(data.minToAmount) };
  if (typeof data.fromToken !== "string" || data.fromToken.toLowerCase() !== input.fromToken.toLowerCase() ||
      typeof data.toToken !== "string" || data.toToken.toLowerCase() !== input.toToken.toLowerCase() ||
      unsigned(data.fromAmount) !== input.fromAmount || !isRecord(data.fees) || !isRecord(data.issues)) throw new Error("Invalid provider quote");
  const tx = data.transaction;
  if (tx != null && (!isRecord(tx) || typeof tx.to !== "string" || !ADDRESS.test(tx.to) ||
      typeof tx.data !== "string" || !/^0x(?:[a-fA-F0-9]{2})*$/.test(tx.data))) throw new Error("Invalid provider transaction");
  if (data.permit2 != null && (!isRecord(data.permit2) || !isRecord(data.permit2.eip712))) throw new Error("Invalid provider permit");
  return {
    liquidityAvailable: true, fromToken: data.fromToken, toToken: data.toToken, fromAmount: unsigned(data.fromAmount),
    toAmount: unsigned(data.toAmount), minToAmount: unsigned(data.minToAmount), blockNumber: unsigned(data.blockNumber),
    fees: { gasFee: fee(data.fees.gasFee), protocolFee: fee(data.fees.protocolFee) }, issues: quoteIssues(data.issues),
    transaction: isRecord(tx) ? { to: tx.to, data: tx.data, value: unsigned(tx.value), gas: unsigned(tx.gas) } : null,
    permit2: isRecord(data.permit2) ? { eip712: data.permit2.eip712 } : null,
  };
}

export function swapResponse(method: "GET" | "POST", input: SwapInput) {
  const key = JSON.stringify(input).toLowerCase();
  return (method === "GET" ? prices : quotes)(key, () => requestSwap(method, input));
}

export function swapError(error: unknown) {
  const status = error instanceof ApiError ? error.status : 502;
  return { status, body: { error: error instanceof ApiError ? error.message : "Swap service unavailable" },
    headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } };
}
