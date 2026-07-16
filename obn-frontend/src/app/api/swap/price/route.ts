import { NextRequest, NextResponse } from "next/server";
import { CdpClient } from "@coinbase/cdp-sdk";

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const OBN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN || "";

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromToken = searchParams.get("fromToken");
  const toToken = searchParams.get("toToken");
  const fromAmount = searchParams.get("fromAmount");
  const taker = searchParams.get("taker");
  const slippageBps = Number(searchParams.get("slippageBps") || 100);

  if (!fromToken || !toToken || !fromAmount || !taker) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const allowedTokens = new Set(
    [ETH_ADDRESS, USDC_ADDRESS, OBN_ADDRESS].filter(Boolean).map((token) => token.toLowerCase()),
  );
  const from = fromToken.toLowerCase();
  const to = toToken.toLowerCase();
  const obn = OBN_ADDRESS.toLowerCase();

  if (!allowedTokens.has(from) || !allowedTokens.has(to) || from === to || (from !== obn && to !== obn)) {
    return NextResponse.json({ error: "Unsupported token pair" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(taker) || !/^[1-9]\d*$/.test(fromAmount)) {
    return NextResponse.json({ error: "Invalid swap parameters" }, { status: 400 });
  }
  if (slippageBps !== 50 && slippageBps !== 100) {
    return NextResponse.json({ error: "Unsupported slippage" }, { status: 400 });
  }

  try {
    const price = await getClient().evm.getSwapPrice({
      fromToken: fromToken as `0x${string}`,
      toToken: toToken as `0x${string}`,
      fromAmount: BigInt(fromAmount),
      network: "base",
      taker: taker as `0x${string}`,
      slippageBps,
    });

    if (!price.liquidityAvailable) {
      return NextResponse.json({ liquidityAvailable: false });
    }

    return NextResponse.json({
      liquidityAvailable: true,
      toAmount: price.toAmount.toString(),
      minToAmount: price.minToAmount.toString(),
    });
  } catch {
    return NextResponse.json({ error: "Unable to fetch swap price" }, { status: 502 });
  }
}
