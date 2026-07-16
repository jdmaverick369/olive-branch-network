"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { isXBrowser } from "@/lib/txUtils";

type DebugInfo = {
  ua: string;
  referrer: string;
  hasOpener: string;
  isTopFrame: string;
  url: string;
  search: string;
  historyLen: string;
  navType: string;
  platform: string;
  touch: string;
  hasFocus: string;
  visState: string;
  cookieEnabled: string;
};

// Wagmi hooks only run when the overlay is actually shown, preventing
// unnecessary store subscriptions for the 99.9% of users not in X's WebView.
function DebugPanel({ info }: { info: DebugInfo }) {
  const { address, connector, status } = useAccount();
  const { error: connectError } = useConnect();
  const [collapsed, setCollapsed] = useState(false);
  const [popupResult, setPopupResult] = useState<string | null>(null);

  function testPopup() {
    try {
      const w = window.open("about:blank", "_blank", "width=1,height=1");
      if (w) {
        w.close();
        setPopupResult("ALLOWED — window.open() succeeded");
      } else {
        setPopupResult("BLOCKED — window.open() returned null");
      }
    } catch (e) {
      setPopupResult(`ERROR — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-9999 font-mono text-xs"
      style={{ backgroundColor: "rgba(0,0,0,0.93)", color: "#4ade80" }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full text-left px-3 py-1.5 font-bold flex justify-between"
        style={{ color: "white", backgroundColor: "rgba(255,255,255,0.07)" }}
      >
        <span>X WebView Debug</span>
        <span style={{ color: "#9ca3af" }}>{collapsed ? "▲" : "▼"}</span>
      </button>

      {!collapsed && (
        <div className="px-3 py-2 space-y-0.5 max-h-64 overflow-y-auto">
          <Section label="Entry context" />
          <Row label="historyLen" value={info.historyLen} note="1=fresh WebView(card), >1=navigated" />
          <Row label="navType" value={info.navType} />
          <Row label="referrer" value={info.referrer} />
          <Row label="search" value={info.search} />

          <Section label="Window / frame" />
          <Row label="hasOpener" value={info.hasOpener} />
          <Row label="isTopFrame" value={info.isTopFrame} />
          <Row label="hasFocus" value={info.hasFocus} />
          <Row label="visState" value={info.visState} />

          <Section label="Device" />
          <Row label="platform" value={info.platform} />
          <Row label="touch" value={info.touch} />
          <Row label="cookieEnabled" value={info.cookieEnabled} />

          <Section label="Popup test" />
          <div className="flex items-center gap-3 py-0.5">
            <button
              onClick={testPopup}
              className="px-2 py-0.5 rounded text-xs font-bold"
              style={{ backgroundColor: "#166534", color: "white" }}
            >
              Test window.open()
            </button>
            {popupResult && (
              <span style={{ color: popupResult.startsWith("ALLOWED") ? "#4ade80" : "#f87171" }}>
                {popupResult}
              </span>
            )}
          </div>

          <Section label="Wallet" />
          <Row label="connector" value={connector?.id ?? "(none)"} />
          <Row label="status" value={status} />
          <Row label="address" value={address ?? "(none)"} />
          {connectError && <Row label="connectError" value={connectError.message} wrap error />}

          <Section label="UA" />
          <Row label="ua" value={info.ua} wrap />
          <Row label="url" value={info.url} wrap />
        </div>
      )}
    </div>
  );
}

export function XDebugOverlay() {
  const [info, setInfo] = useState<DebugInfo | null>(null);

  useEffect(() => {
    if (!isXBrowser()) return;
    if (!new URLSearchParams(window.location.search).has("xdebug")) return;

    let navType = "unknown";
    try {
      const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      navType = entry?.type ?? "unavailable";
    } catch { /* */ }

    setInfo({
      ua: navigator.userAgent,
      referrer: document.referrer || "(none)",
      hasOpener: String(window.opener !== null),
      isTopFrame: String(window.top === window.self),
      url: window.location.href,
      search: window.location.search || "(none)",
      historyLen: String(window.history.length),
      navType,
      platform: navigator.platform || "(none)",
      touch: String("ontouchstart" in window),
      hasFocus: String(document.hasFocus()),
      visState: document.visibilityState,
      cookieEnabled: String(navigator.cookieEnabled),
    });
  }, []);

  if (!info) return null;
  return <DebugPanel info={info} />;
}

function Section({ label }: { label: string }) {
  return (
    <div className="pt-1.5 pb-0.5 font-bold" style={{ color: "#facc15", fontSize: "0.65rem", letterSpacing: "0.05em" }}>
      {label.toUpperCase()}
    </div>
  );
}

function Row({
  label,
  value,
  note,
  wrap = false,
  error = false,
}: {
  label: string;
  value: string;
  note?: string;
  wrap?: boolean;
  error?: boolean;
}) {
  return (
    <div className={wrap ? "space-y-0.5" : "flex gap-2 items-baseline"}>
      <span style={{ color: "#9ca3af", minWidth: wrap ? undefined : "7rem", flexShrink: 0 }}>
        {label}:
      </span>
      <span style={{ color: error ? "#f87171" : "#4ade80", wordBreak: wrap ? "break-all" : "normal" }}>
        {value}
      </span>
      {note && <span style={{ color: "#6b7280", fontSize: "0.6rem" }}> {note}</span>}
    </div>
  );
}
