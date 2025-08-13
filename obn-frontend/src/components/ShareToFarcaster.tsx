// src/components/ShareToFarcaster.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Props = {
  text?: string;
};

export function ShareToFarcaster({ text }: Props) {
  const pathname = usePathname();
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(`${window.location.origin}${pathname}`);
    }
  }, [pathname]);

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
      className="px-5 py-2.5 rounded-lg font-semibold border border-purple-600 !text-purple-600 hover:bg-purple-600 hover:!text-white disabled:opacity-50 transition text-sm"
    >
      Share on Farcaster
    </a>
  );
}
