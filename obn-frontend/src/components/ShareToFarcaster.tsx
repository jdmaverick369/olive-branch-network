// src/components/ShareToFarcaster.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import sdk from "@farcaster/miniapp-sdk";

type Props = {
  text?: string;
  /** Optional override; if omitted we use NEXT_PUBLIC_CAST_SHARE_URL, then current page */
  url?: string;
  className?: string;
};

// Minimal typing for the parts of the MiniApp SDK we use
type MiniAppSDK = {
  actions?: {
    composeCast?: (args: { text?: string; embeds?: string[] }) => Promise<void>;
  };
};

type NavigatorWithShare = Navigator & { share?: (data: ShareData) => Promise<void> };

const ENV_CAST_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CAST_SHARE_URL) || "";

const WARPCAST_COMPOSE_BASE = "https://warpcast.com/~/compose"; // reliable composer URL

export function ShareToFarcaster({
  text = "Staking OBN to support the Olive Branch Network 🌱",
  url,
  className,
}: Props) {
  const pathname = usePathname();
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(`${window.location.origin}${pathname}`);
    }
  }, [pathname]);

  const shareTarget = useMemo(() => url || ENV_CAST_URL || pageUrl || "", [url, pageUrl]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("text", text);
    if (shareTarget) params.append("embeds[]", shareTarget);
    return params.toString();
  }, [text, shareTarget]);

  const webComposeUrl = `${WARPCAST_COMPOSE_BASE}?${query}`;

  const shareData: ShareData = useMemo(
    () => ({ text, url: shareTarget || undefined }),
    [text, shareTarget]
  );

  // Narrow sdk to our minimal typed shape without using `any`
  const miniSdk: MiniAppSDK | null = (sdk as unknown as MiniAppSDK) ?? null;
  const inMiniApp = Boolean(miniSdk?.actions?.composeCast);

  const isMobile = () =>
    typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // 1) Inside Warpcast/Base MiniApp → use official composer
    if (inMiniApp && miniSdk?.actions?.composeCast) {
      try {
        await miniSdk.actions.composeCast({
          text,
          embeds: shareTarget ? [shareTarget] : [],
        });
        return;
      } catch {
        // fall back to web composer
        try {
          window.location.href = webComposeUrl;
        } catch {
          window.open(webComposeUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }
    }

    // 2) Good mobile browsers → Web Share API
    const nav = (typeof navigator !== "undefined" ? (navigator as NavigatorWithShare) : undefined);
    if (isMobile() && nav?.share) {
      try {
        await nav.share(shareData);
        return;
      } catch {
        // user cancelled or not supported → fall through
      }
    }

    // 3) Fallback everywhere → Warpcast composer URL
    try {
      window.location.assign(webComposeUrl);
    } catch {
      window.open(webComposeUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          className ??
          "px-5 py-2.5 rounded-lg font-semibold border border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white disabled:opacity-50 transition text-sm"
        }
        aria-label="Share on Farcaster"
        data-share-target={shareTarget}
      >
        Share
      </button>

      {/* No-JS fallback for crawlers / locked-down browsers */}
      <noscript>
        <a
          href={webComposeUrl}
          className="px-5 py-2.5 rounded-lg font-semibold border border-purple-600 text-purple-600"
        >
          Share
        </a>
      </noscript>
    </>
  );
}
