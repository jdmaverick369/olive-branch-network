"use client";

import { useEffect, useState } from "react";
import { Almarai, Libre_Baskerville } from "next/font/google";

// Self-hosted via next/font — no runtime request to fonts.googleapis.com.
// The page previously used a CSS @import for these, which is parser-blocking:
// the browser can't paint anything (not even this page's own text) until an
// external font stylesheet round-trip resolves. This was the actual driver
// behind the route's poor FCP, not the (separately fixed) boot-splash flash.
const almarai = Almarai({
  weight: ["400", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-almarai",
});

const libreBaskerville = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-libre-baskerville",
});

const DUNE_BASE = "/api/dune";

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString();
}

function getLatestValue(data: unknown): number | null {
  try {
    const rows = (data as { result: { rows: Record<string, unknown>[] } }).result.rows;
    const lastRow = rows[rows.length - 1];
    const key = Object.keys(lastRow).find((k) => k !== "day" && k !== "date" && k !== "timestamp");
    return key && typeof lastRow[key] === "number" ? (lastRow[key] as number) : null;
  } catch {
    return null;
  }
}

export default function ImpactEmbed() {
  const [stakers, setStakers] = useState<number | null>(null);
  const [staked, setStaked] = useState<number | null>(null);
  const [contributed, setContributed] = useState<number | null>(null);
  const [pct, setPct] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--obn-header-h", "0px");
    document.documentElement.style.cssText += ";background:white!important;";
    document.body.style.cssText += ";background:white!important;min-height:unset!important;height:auto!important;";
    const bootStyle = document.getElementById("obn-boot-style");
    if (bootStyle) bootStyle.remove();
    // Zero out the layout's paddingTop wrapper
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      if (el.style.paddingTop && el.style.paddingTop.includes("var(--obn-header-h)")) {
        el.style.paddingTop = "0px";
      }
    });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${DUNE_BASE}?queryId=5887886`).then((r) => r.json()),
      fetch(`${DUNE_BASE}?queryId=6172584`).then((r) => r.json()),
      fetch(`${DUNE_BASE}?queryId=6798005`).then((r) => r.json()),
      fetch("/api/supply/total").then((r) => r.text()),
    ]).then(([stakersData, stakedData, contributedData, supplyText]) => {
      const s = getLatestValue(stakersData);
      const t = getLatestValue(stakedData);
      const c = getLatestValue(contributedData);
      const supply = supplyText ? parseFloat(supplyText) : null;
      setStakers(s);
      setStaked(t);
      setContributed(c);
      if (t !== null && supply && supply > 0) {
        setPct((t / supply * 100).toFixed(2) + "% of total supply");
      }
    }).catch(() => {});
  }, []);

  return (
    <>
      <style>{`
        html, body, body > *, body > * > * {
          background: white !important;
          background-color: white !important;
          min-height: unset !important;
          height: auto !important;
        }
        body > * {
          padding-top: 0 !important;
        }
        .obn-wrap {
          background: white;
          padding: 40px 24px;
          text-align: center;
          font-family: var(--font-almarai), sans-serif;
        }
        .obn-title {
          font-size: 1.75rem;
          font-weight: 700;
          margin: 0 0 8px;
          color: #0D9921;
          font-family: var(--font-libre-baskerville), serif;
        }
        .obn-subtitle {
          font-size: 0.9rem;
          color: #6b7280;
          margin: 0 0 32px;
        }
        .obn-stats {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px;
        }
        .obn-card {
          background: white;
          border: 1px solid black;
          border-radius: 12px;
          padding: 24px 28px;
          flex: 1;
          min-width: 160px;
          max-width: 260px;
          text-align: center;
        }
        .obn-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          margin: 0 0 8px;
        }
        .obn-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #0D9921;
          margin: 0 0 4px;
          line-height: 1.1;
        }
        .obn-sub {
          font-size: 0.75rem;
          color: #6b7280;
          margin: 0;
        }
        @media (min-width: 640px) {
          .obn-title { font-size: 7rem; }
          .obn-subtitle { font-size: 1rem; }
          .obn-value { font-size: 2.25rem; }
          .obn-card { min-width: 260px; max-width: 380px; padding: 28px 40px; }
        }
        @media (max-width: 480px) {
          .obn-stats { flex-direction: column; align-items: stretch; }
          .obn-card { max-width: 100%; }
        }
      `}</style>

      <div className={`obn-wrap ${almarai.variable} ${libreBaskerville.variable}`}>
        <h2 className="obn-title">Big Ideas, Real Impact</h2>
        <p className="obn-subtitle">Live protocol stats from the Olive Branch Network</p>

        <div className="obn-stats">
          <div className="obn-card">
            <p className="obn-label">Active Stakers</p>
            <p className="obn-value">{stakers !== null ? stakers.toLocaleString() : "—"}</p>
          </div>

          <div className="obn-card">
            <p className="obn-label">Total Staked</p>
            <p className="obn-value">{staked !== null ? fmt(staked) + " OBN" : "—"}</p>
            {pct && <p className="obn-sub">{pct}</p>}
          </div>

          <div className="obn-card">
            <p className="obn-label">Total Contributed</p>
            <p className="obn-value">{contributed !== null ? fmt(contributed) + " OBN" : "—"}</p>
            <p className="obn-sub">to nonprofits</p>
          </div>
        </div>
      </div>
    </>
  );
}
