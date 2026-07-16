import { NextResponse } from "next/server";

const OBN_PAIR_ID = "0x8fce8be03745fa2821cb25f7dfebbfc5573a9beaca433f69a53c998a6fff1e94";

type TickerItem = {
  symbol: "OBN" | "ETH" | "BTC";
  priceUsd: number;
  change24h: number;
};

export async function GET() {
  try {
    const [obnResponse, majorsResponse] = await Promise.all([
      fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${OBN_PAIR_ID}`, {
        next: { revalidate: 60 },
      }),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true", {
        next: { revalidate: 60 },
        headers: { accept: "application/json" },
      }),
    ]);

    if (!obnResponse.ok || !majorsResponse.ok) {
      throw new Error("A market data provider was unavailable");
    }

    const obnData = await obnResponse.json();
    const majorsData = await majorsResponse.json();
    const pair = obnData?.pair ?? obnData?.pairs?.[0];

    const candidates: TickerItem[] = [
      {
        symbol: "OBN",
        priceUsd: Number(pair?.priceUsd),
        change24h: Number(pair?.priceChange?.h24),
      },
      {
        symbol: "ETH",
        priceUsd: Number(majorsData?.ethereum?.usd),
        change24h: Number(majorsData?.ethereum?.usd_24h_change),
      },
      {
        symbol: "BTC",
        priceUsd: Number(majorsData?.bitcoin?.usd),
        change24h: Number(majorsData?.bitcoin?.usd_24h_change),
      },
    ];
    const items = candidates.filter(
      (item) => Number.isFinite(item.priceUsd) && Number.isFinite(item.change24h),
    );

    if (items.length === 0) throw new Error("No market data was returned");

    return NextResponse.json(
      { items, updatedAt: Date.now() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ error: "Market data is temporarily unavailable" }, { status: 503 });
  }
}
