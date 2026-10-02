"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * The header's white account pill: portrait (if any) and name or address in one rounded button,
 * the same size as the browser-wallet pill on phones. Used for the Farcaster and Coinbase Wallet
 * app accounts; `children` can overlay badges on the pill.
 */
export function AccountPill({ portrait, round = false, label, mono = false, className = "", children, ...button }:
  ButtonHTMLAttributes<HTMLButtonElement> & {
    portrait?: string | null;
    /** Crop the portrait to a circle. Farcaster pictures are made for circles; many are a round logo on a dark square. */
    round?: boolean;
    label: ReactNode;
    mono?: boolean;
  }) {
  const [failed, setFailed] = useState<string | null>(null);
  const image = portrait && failed !== portrait ? portrait : null;
  return (
    <button
      type="button"
      {...button}
      className={`relative flex min-w-0 max-w-full items-center justify-center gap-1.5 rounded-xl bg-white text-gray-900 shadow-sm hover:shadow-lg hover:scale-105 transition-all ${image ? "py-[3px] pl-[3px] pr-3 max-[359px]:pr-2.5" : "px-3 py-2 max-[359px]:px-2.5"} ${className}`}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setFailed(image)} className={`h-6 w-6 shrink-0 object-cover ${round ? "rounded-full" : "rounded-lg"}`} />
      )}
      <span className={`min-w-0 text-[13px] font-bold leading-none ${mono ? "overflow-hidden whitespace-nowrap font-mono" : "truncate"}`}>{label}</span>
      {children}
    </button>
  );
}
