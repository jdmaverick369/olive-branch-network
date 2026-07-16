import { NextRequest, NextResponse } from "next/server";
import { CdpClient } from "@coinbase/cdp-sdk";

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const OBN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN || "";
const ALLOWED_SLIPPAGE_BPS = new Set([50, 100]);

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]),
    );
  }
  return value;
}

let cdp: CdpClient | null = null;
function getClient() {
  if (!cdp) {
    cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_NAME,
      apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY,
    });
  }
  return cdp;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { fromToken, toToken, fromAmount, taker, slippageBps = 100 } = body;

  if (!fromToken || !toToken || !fromAmount || !taker) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const allowedTokens = new Set(
    [ETH_ADDRESS, USDC_ADDRESS, OBN_ADDRESS].filter(Boolean).map((token) => token.toLowerCase()),
  );
  const from = String(fromToken).toLowerCase();
  const to = String(toToken).toLowerCase();
  const obn = OBN_ADDRESS.toLowerCase();

  if (!allowedTokens.has(from) || !allowedTokens.has(to) || from === to) {
    return NextResponse.json({ error: "Unsupported token pair" }, { status: 400 });
  }
  if (from !== obn && to !== obn) {
    return NextResponse.json({ error: "One side of the swap must be OBN" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(taker))) {
    return NextResponse.json({ error: "Invalid taker address" }, { status: 400 });
  }
  if (!/^[1-9]\d*$/.test(String(fromAmount))) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!ALLOWED_SLIPPAGE_BPS.has(Number(slippageBps))) {
    return NextResponse.json({ error: "Unsupported slippage" }, { status: 400 });
  }

  try {
    const quote = await getClient().evm.createSwapQuote({
      network: "base",
      fromToken: fromToken as `0x${string}`,
      toToken: toToken as `0x${string}`,
      fromAmount: BigInt(fromAmount),
      taker: taker as `0x${string}`,
      slippageBps,
    });

    if (!quote.liquidityAvailable) {
      return NextResponse.json({ liquidityAvailable: false });
    }

    return NextResponse.json({
      liquidityAvailable: true,
      fromToken: quote.fromToken,
      toToken: quote.toToken,
      fromAmount: quote.fromAmount.toString(),
      toAmount: quote.toAmount.toString(),
      minToAmount: quote.minToAmount.toString(),
      blockNumber: quote.blockNumber.toString(),
      fees: jsonSafe(quote.fees),
      issues: jsonSafe(quote.issues),
      transaction: quote.transaction
        ? {
            to: quote.transaction.to,
            data: quote.transaction.data,
            value: quote.transaction.value.toString(),
            gas: quote.transaction.gas.toString(),
          }
        : null,
      permit2: quote.permit2 ? { eip712: jsonSafe(quote.permit2.eip712) } : null,
    });
  } catch {
    return NextResponse.json({ error: "Unable to create swap quote" }, { status: 502 });
  }
}
