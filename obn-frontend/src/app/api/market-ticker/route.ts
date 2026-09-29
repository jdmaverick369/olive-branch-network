import { NextResponse } from "next/server";

const OBN_PAIR_ID = "0x8fce8be03745fa2821cb25f7dfebbfc5573a9beaca433f69a53c998a6fff1e94";

type TickerItem = {
  symbol: "OBN" | "ETH" | "BTC";
  priceUsd: number;
  change24h: number | null;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tickerItem(symbol: TickerItem["symbol"], price: unknown, change: unknown): TickerItem | null {
  const priceUsd = finiteNumber(price);
  if (priceUsd === null || priceUsd <= 0) return null;
  return { symbol, priceUsd, change24h: finiteNumber(change) };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: 60 },
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
  return response.json();
}

async function getObnPrice(): Promise<TickerItem[]> {
  type Pair = { priceUsd?: unknown; priceChange?: { h24?: unknown } };
  const data = await fetchJson<{ pair?: Pair; pairs?: Pair[] }>(
    `https://api.dexscreener.com/latest/dex/pairs/base/${OBN_PAIR_ID}`,
  );
  const pair = data?.pair ?? data?.pairs?.[0];
  const item = tickerItem("OBN", pair?.priceUsd, pair?.priceChange?.h24);
  return item ? [item] : [];
}

async function getCoinbasePrice(symbol: "ETH" | "BTC"): Promise<TickerItem | null> {
  // Coinbase's rolling 24-hour stats provide the last and opening USD prices.
  // https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats
  const data = await fetchJson<{ last?: unknown; open?: unknown }>(
    `https://api.exchange.coinbase.com/products/${symbol}-USD/stats`,
  );
  const last = finiteNumber(data?.last);
  const open = finiteNumber(data?.open);
  const change = last !== null && open !== null && open > 0 ? (last / open - 1) * 100 : null;
  return tickerItem(symbol, last, change);
}

async function getMajorPrices(): Promise<TickerItem[]> {
  type Major = { usd?: unknown; usd_24h_change?: unknown };
  const data = await fetchJson<{ ethereum?: Major; bitcoin?: Major }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
  ).catch(() => null);
  const results = await Promise.allSettled([
    tickerItem("ETH", data?.ethereum?.usd, data?.ethereum?.usd_24h_change) ?? getCoinbasePrice("ETH"),
    tickerItem("BTC", data?.bitcoin?.usd, data?.bitcoin?.usd_24h_change) ?? getCoinbasePrice("BTC"),
  ]);
  return results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
}

export async function GET() {
  // A provider failure must not suppress prices from the other providers.
  const results = await Promise.allSettled([getObnPrice(), getMajorPrices()]);
  const items = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "Market data is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { items, updatedAt: Date.now() },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
