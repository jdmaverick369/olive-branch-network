"use client";

import { useEffect, useState } from "react";
import { isMiniAppRuntime } from "@/lib/miniapp";

export function MiniAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show banner only when *not* inside a Farcaster MiniApp
    setShow(!isMiniAppRuntime());
  }, []);

  if (!show) return null;

  const href = typeof window !== "undefined" ? window.location.href : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      // Fallback if clipboard API isn't available
      const ta = document.createElement("textarea");
      ta.value = href;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const openInApp = () => {
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full bg-amber-50 border-y border-amber-200 text-amber-900 py-2 px-4 text-sm flex items-center justify-between">
      <span>
        Want the in-app experience? Open this in <b>Warpcast/Base App</b>.
      </span>
      <div className="flex gap-2">
        <button
          onClick={copyLink}
          className="px-3 py-1 border rounded hover:bg-amber-100"
        >
          Copy link
        </button>
        <button
          onClick={openInApp}
          className="px-3 py-1 border rounded hover:bg-amber-100"
        >
          Open in app
        </button>
      </div>
    </div>
  );
}
