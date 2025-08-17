// src/components/FooterDisclaimer.tsx
"use client";

import { useEffect, useRef } from "react";

export default function FooterDisclaimer() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const setVar = () =>
      document.documentElement.style.setProperty(
        "--footer-h",
        `${el.offsetHeight}px`
      );

    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    window.addEventListener("resize", setVar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setVar);
    };
  }, []);

  return (
    <footer
      ref={ref}
      role="contentinfo"
      className="
        fixed inset-x-0 bottom-0 z-50 w-full
        border-t border-gray-200 bg-white/90 backdrop-blur
        px-4 py-2 text-center text-xs text-gray-600
        dark:bg-gray-900/80 dark:border-gray-800 dark:text-gray-400
      "
    >
      <div className="mx-auto max-w-screen-xl">
        Olive Branch Network is a decentralized protocol and does not have any direct
        affiliation with any of the organizations displayed.
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </footer>
  );
}
