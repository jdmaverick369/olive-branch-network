"use client";
import { useQuery } from "@tanstack/react-query";
export type TickerItem = { symbol: "OBN" | "ETH" | "BTC"; priceUsd: number; change24h: number };
export function useMarketPrices() {
  return useQuery({
    queryKey: ["market-ticker"],
    queryFn: async (): Promise<TickerItem[]> => {
      const response = await fetch("/api/market-ticker");
      if (!response.ok) throw new Error("Market prices unavailable");
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error("Invalid market prices");
      return data.items.filter((item: TickerItem) => Number.isFinite(item.priceUsd) && item.priceUsd > 0);
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
