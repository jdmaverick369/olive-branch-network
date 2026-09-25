"use client";
import { useMarketPrices } from "@/hooks/useMarketPrices";

/** amount is whole ETH (not wei). Renders as its own centered line, sized to sit under small labels like a mint price. */
export function EthUsd({ amount }: { amount: number | undefined | null }) {
  const prices = useMarketPrices();
  const price = prices.data?.find(item => item.symbol === "ETH")?.priceUsd;
  const valid = amount !== undefined && amount !== null && Number.isFinite(amount) && amount >= 0;
  const usd = valid && price !== undefined && !prices.isError ? amount * price : null;
  const label = usd === null || !Number.isFinite(usd) ? "USD unavailable"
    : usd > 0 && usd < 0.01 ? "< $0.01"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);
  return (
    <span
      className="block text-center max-w-full text-[9px] font-normal leading-snug whitespace-normal"
      style={{ color: "var(--card-subtext)", marginTop: "2px", overflowWrap: "anywhere" }}
      title="Estimated USD value at the current ETH market price, not a checkout quote."
    >
      ({label})
    </span>
  );
}
