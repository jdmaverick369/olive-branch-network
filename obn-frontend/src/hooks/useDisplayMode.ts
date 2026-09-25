"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "obnDisplayMode";
const CHANGE_EVENT = "obn-display-mode-change";
let mode: "crypto" | "normal" = "crypto";

function getSnapshot() {
  try {
    mode = localStorage.getItem(STORAGE_KEY) === "normal" ? "normal" : "crypto";
  } catch { /* Keep the in-memory preference when storage is unavailable. */ }
  return mode;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useDisplayMode() {
  const displayMode = useSyncExternalStore(subscribe, getSnapshot, () => "crypto" as const);
  const toggleDisplayMode = () => {
    mode = getSnapshot() === "crypto" ? "normal" : "crypto";
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Storage is optional. */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return { displayMode, toggleDisplayMode };
}
