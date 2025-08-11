// src/hooks/useFarcasterSession.ts
"use client";

import { useEffect, useState } from "react";
import { isMiniAppRuntime, readMiniAppSession, MiniAppSession } from "@/lib/miniapp";

export function useFarcasterSession() {
  const [isMini, setIsMini] = useState(false);
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const mini = isMiniAppRuntime();
      setIsMini(mini);
      if (mini) {
        const s = await readMiniAppSession();
        if (!mounted) return;
        setSession(s);
      }
      setReady(true);
    };
    run();
    return () => { mounted = false; };
  }, []);

  return { isMini, session, ready };
}
