"use client";

import { useEffect, useState } from "react";
import { useMarketPrices, type TickerItem } from "@/hooks/useMarketPrices";



// Prices with 3+ zeros after the decimal point use subscript notation:
// 0.00001951 → $0.0₄1951, where the subscript counts the zeros.
const SUBSCRIPT_MIN_ZEROS = 3;

function SubscriptPrice({ value, digits }: { value: number; digits: number }) {
  const [mantissa, exponent] = value.toExponential(digits - 1).split("e");
  const zeros = -Number(exponent) - 1;
  const significant = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  const plain = `$${value.toLocaleString(undefined, { maximumSignificantDigits: digits })}`;
  if (!(value > 0) || zeros < SUBSCRIPT_MIN_ZEROS) return <>{plain}</>;
  return (
    <>
      <span className="sr-only">{plain}</span>
      <span aria-hidden="true">
        $0.0<sub className="text-[0.7em] leading-none">{zeros}</sub>{significant}
      </span>
    </>
  );
}

function formatPrice(symbol: TickerItem["symbol"], value: number) {
  if (symbol === "OBN") {
    return value < 0.01
      ? `$${value.toLocaleString(undefined, { minimumSignificantDigits: 2, maximumSignificantDigits: 5 })}`
      : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCompactPrice(value: number) {
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function MarketTicker() {
  const { data: items = [] } = useMarketPrices();
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(true);


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
        <span className="font-medium text-white/95 sm:hidden">
          {item.symbol === "OBN" ? <SubscriptPrice value={item.priceUsd} digits={3} /> : formatCompactPrice(item.priceUsd)}
        </span>
        <span className="hidden sm:inline font-medium text-white/95">
          {item.symbol === "OBN" && item.priceUsd < 0.01 ? <SubscriptPrice value={item.priceUsd} digits={4} /> : formatPrice(item.symbol, item.priceUsd)}
        </span>
      </span>
      <span className={`flex items-center gap-1 font-bold ${positive ? "text-emerald-200" : "text-red-200"}`}>
        <span>{positive ? "+" : ""}{item.change24h.toFixed(2)}%</span>
        <span className="sm:hidden text-[8px] font-medium text-white/60">24h</span>
      </span>
      <span className="hidden sm:inline text-[10px] text-white/65">24h</span>
    </div>
  );
}
