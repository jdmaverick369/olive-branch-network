"use client";

import { useSyncExternalStore } from "react";

function readTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  return () => observer.disconnect();
}

// The server always renders "light". useSyncExternalStore hydrates with that same
// value and then re-renders with the real theme, so React patches any theme-based
// inline styles. (Reading the DOM in a useState initializer returned "dark" during
// hydration, React kept the server's light styles, and nothing ever re-rendered.)
export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}
