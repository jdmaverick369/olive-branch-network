// src/components/ShareToFarcaster.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Props = {
  text?: string;
  className?: string;
};

export function ShareToFarcaster({ text, className }: Props) {
  const pathname = usePathname();
  const [pageUrl, setPageUrl] = useState("");

  // Build absolute URL on the client
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(`${window.location.origin}${pathname}`);
    }
  }, [pathname]);

  // Warpcast composer URL (prefills text + embeds the current page)
  const href = useMemo(() => {
    const u = new URL("https://warpcast.com/~/compose");
    u.searchParams.set(
      "text",
      text ?? "Staking OBN to support the Olive Branch Network 🌱"
    );
    if (pageUrl) u.searchParams.append("embeds[]", pageUrl);
    return u.toString();
  }, [text, pageUrl]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        className ??
        "inline-flex items-center gap-2 px-4 py-3 rounded-lg border " +
          "border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white transition"
      }
    >
      Share on Farcaster
    </a>
  );
}
