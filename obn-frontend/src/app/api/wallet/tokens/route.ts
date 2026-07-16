import { NextRequest, NextResponse } from "next/server";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const OBN_TOKEN = (process.env.NEXT_PUBLIC_OBN_TOKEN || "").toLowerCase();

function rpc(id: number, method: string, params: unknown[]) {
  return fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, jsonrpc: "2.0", method, params }),
  }).then((r) => r.json());
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const [ethData, balancesData] = await Promise.all([
      rpc(1, "eth_getBalance", [address, "latest"]),
      rpc(2, "alchemy_getTokenBalances", [address, "erc20"]),
    ]);

    const tokens: { symbol: string; address: string; decimals: number; image: string | null; rawBalance: string }[] = [];

    // Native ETH
    const ethBalance = BigInt(ethData.result || "0x0");
    if (ethBalance > 0n) {
      tokens.push({
        symbol: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
        rawBalance: ethBalance.toString(),
      });
    }

    // Filter ERC-20s: non-zero balance, not OBN
    const allBalances: { contractAddress: string; tokenBalance: string }[] =
      balancesData.result?.tokenBalances || [];

    const nonZero = allBalances.filter((t) => {
      if (t.contractAddress.toLowerCase() === OBN_TOKEN) return false;
      try { return BigInt(t.tokenBalance) > 0n; } catch { return false; }
    });

    if (nonZero.length > 0) {
      // Fetch metadata for all non-zero tokens in parallel
      const metadataResults = await Promise.all(
        nonZero.map((t, i) => rpc(10 + i, "alchemy_getTokenMetadata", [t.contractAddress]))
      );

      for (let i = 0; i < nonZero.length; i++) {
        const t = nonZero[i];
        const meta = metadataResults[i]?.result ?? {};
        tokens.push({
          symbol: meta.symbol || t.contractAddress.slice(0, 6),
          address: t.contractAddress,
          decimals: meta.decimals ?? 18,
          image: meta.logo || null,
          rawBalance: BigInt(t.tokenBalance).toString(),
        });
      }
    }

    return NextResponse.json({ tokens });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
