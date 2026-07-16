// src/components/InteractionRescue.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function InteractionRescue() {
  const pathname = usePathname();

  useEffect(() => {
    let lastRun = 0;
    const run = () => {
      // Cooldown to avoid redundant work in rapid-fire webview events
      const now = Date.now();
      if (now - lastRun < 50) return;
      lastRun = now;

      // 1) Restore scrolling in case any modal left it locked.
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.height = "";

      // 2b) Extra: clear accidental pointer-event locks on root containers
      document.documentElement.style.pointerEvents = "";
      document.body.style.pointerEvents = "";

      // 3) Force app root clickable (Farcaster webview safety)
      const root = document.getElementById("obn-app-root") as HTMLElement | null;
      if (root) root.style.pointerEvents = "auto";

      // 3b) Kill our loading overlay if it survived navigation (Farcaster edge case)
      const loading = document.querySelector<HTMLElement>('[data-obn-overlay="loading"]');

      if (loading) {
        loading.style.pointerEvents = "none";
        loading.style.opacity = "0";
        loading.style.visibility = "hidden";
        loading.style.display = "none";
        // extra hardening so it can't keep participating in hit-testing/layout weirdness
        loading.style.position = "static";
        loading.style.inset = "auto";
      }

      // 4) Only neutralize OUR overlays that are likely stale
      const overlays = document.querySelectorAll<HTMLElement>("[data-obn-overlay]");
      overlays.forEach((el) => {
        // never touch a still-visible overlay
        const cs = window.getComputedStyle(el);
        const opacity = Number.parseFloat(cs.opacity || "1");

        const isEffectivelyInvisible =
          opacity < 0.05 || cs.display === "none" || cs.visibility === "hidden";

        if (!isEffectivelyInvisible) return;

        // determine if it's a "full screen-ish" fixed layer (likely tap blocker)
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;

        const coversMostOfViewport =
          rect.width >= vw * 0.9 &&
          rect.height >= vh * 0.9 &&
          rect.left <= vw * 0.05 &&
          rect.top <= vh * 0.05;

        const isLikelyTapBlocker = cs.position === "fixed" && coversMostOfViewport;

        if (isLikelyTapBlocker) {
          el.style.pointerEvents = "none";
        }
      });
    };

    // Run on route change (immediate + delayed passes)
    run();
    const t0 = window.setTimeout(run, 0);
    const t1 = window.setTimeout(run, 250);

    // ✅ Also run on webview restore/resume (Farcaster common)
    const onPageShow: EventListener = () => {
      // Always run (especially critical when restored from bfcache)
      run();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    const onFocus = () => run();

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  return null;
}
