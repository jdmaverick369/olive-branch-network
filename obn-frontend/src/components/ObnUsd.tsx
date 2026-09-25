"use client";
import { type ReactNode } from "react";
import { useDisplayMode } from "@/hooks/useDisplayMode";
import { formatUnits } from "viem";
import { useMarketPrices } from "@/hooks/useMarketPrices";

type Amount = bigint | number | string | undefined | null;

function useUsdLabel(amount: Amount) {
  const prices = useMarketPrices();
  const price = prices.data?.find(item => item.symbol === "OBN")?.priceUsd;
  const tokens = typeof amount === "bigint" ? Number(formatUnits(amount, 18)) : Number(amount);
  const valid = amount !== undefined && amount !== null && amount !== "" && Number.isFinite(tokens) && tokens >= 0;
  const usd = valid && price !== undefined && !prices.isError ? tokens * price : null;
  const label = usd === null || !Number.isFinite(usd) ? "USD unavailable"
    : usd > 0 && usd < 0.01 ? "< $0.01"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);
  return label;
}

/** Inherits the original headline's typography and color in either mode. */
export function ObnPrimary({ amount, children }: { amount: Amount; children: ReactNode }) {
  const { displayMode } = useDisplayMode();
  const label = useUsdLabel(amount);
  return <>{displayMode === "normal" ? label : children}</>;
}

/** Optional tokenLabel enables swapping a paired amount while preserving its formatting. */
export function ObnUsd({ amount, block = false, size, tokenLabel }: {
  amount: Amount; block?: boolean; size?: string; tokenLabel?: ReactNode;
}) {
  const { displayMode } = useDisplayMode();
  const label = useUsdLabel(amount);
  const showTokens = displayMode === "normal" && tokenLabel !== undefined;
  return (
    <span
      className={`max-w-full align-baseline ${size ?? "text-[0.75em]"} font-normal leading-snug whitespace-normal ${block ? "block text-center" : "inline-block"}`}
      style={{ color: "var(--card-subtext)", marginInlineStart: block ? 0 : "0.35em", marginTop: block ? "0.15em" : undefined, overflowWrap: "anywhere" }}
      title={showTokens ? "OBN token amount" : "Estimated USD value at the current OBN market price, not the historical dollar value or a swap quote."}
    >
      ({showTokens ? tokenLabel : label})
    </span>
  );
}
