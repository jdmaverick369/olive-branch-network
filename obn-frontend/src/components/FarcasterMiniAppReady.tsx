"use client";
import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export default function FarcasterMiniAppReady() {
  useEffect(() => {
    let done = false;
    const markReady = async () => {
      if (done) return;
      try {
        await sdk.actions.ready();
        done = true;
      } catch {
        // no-op if not in Farcaster host
      }
    };

    // Double-RAF ensures the green background has been painted before we signal
    // the host to dismiss its splash screen. Without this, Base App (which cuts
    // instantly rather than crossfading) shows a white frame on transition.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        markReady();
      });
    });

    const t = setTimeout(() => markReady(), 1200);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, []);
  return null;
}
