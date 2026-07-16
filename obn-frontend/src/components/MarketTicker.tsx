"use client";

import { useEffect, useState } from "react";

type TickerItem = {
  symbol: "OBN" | "ETH" | "BTC";
  priceUsd: number;
  change24h: number;
};

function formatPrice(symbol: TickerItem["symbol"], value: number) {
  if (symbol === "OBN") {
    return value < 0.01
      ? `$${value.toLocaleString(undefined, { minimumSignificantDigits: 2, maximumSignificantDigits: 5 })}`
      : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCompactPrice(symbol: TickerItem["symbol"], value: number) {
  if (symbol === "OBN") {
    return `$${value.toLocaleString(undefined, { maximumSignificantDigits: 3 })}`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function MarketTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/market-ticker");
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data.items)) setItems(data.items);
      } catch {}
    };

    void load();
    const refresh = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const rotate = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setActiveIndex((current) => (current + 1) % items.length);
        setVisible(true);
      }, 220);
    }, 3_500);
    return () => window.clearInterval(rotate);
  }, [items.length]);

  const item = items[activeIndex];
  if (!item) return null;
  const positive = item.change24h >= 0;

  return (
    <div
      className={`pointer-events-none min-w-0 flex flex-col sm:flex-row items-center justify-center sm:gap-1.5 whitespace-nowrap text-[10px] leading-tight sm:text-xs md:text-sm transition-all duration-200 ${visible ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"}`}
      aria-live="polite"
      title="Price and rolling 24-hour change"
    >
      <span className="flex items-center gap-1 sm:contents">
        <span className="font-bold">{item.symbol}</span>
        <span className="font-medium text-white/95 sm:hidden">{formatCompactPrice(item.symbol, item.priceUsd)}</span>
        <span className="hidden sm:inline font-medium text-white/95">{formatPrice(item.symbol, item.priceUsd)}</span>
      </span>
      <span className={`flex items-center gap-1 font-bold ${positive ? "text-emerald-200" : "text-red-200"}`}>
        <span>{positive ? "+" : ""}{item.change24h.toFixed(2)}%</span>
        <span className="sm:hidden text-[8px] font-medium text-white/60">24h</span>
      </span>
      <span className="hidden sm:inline text-[10px] text-white/65">24h</span>
    </div>
  );
}
