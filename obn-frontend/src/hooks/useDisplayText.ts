"use client";

import { useCallback } from "react";
import { formatDisplayText } from "@/lib/displayText";
import { useDisplayMode } from "@/hooks/useDisplayMode";

export function useDisplayText() {
  const { displayMode } = useDisplayMode();
  return useCallback((text: string) => formatDisplayText(text, displayMode === "normal"), [displayMode]);
}
