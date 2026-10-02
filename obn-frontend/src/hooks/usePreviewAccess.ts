"use client";

import { useQuery } from "@tanstack/react-query";

/** Whether this browser holds the private preview cookie (set by /api/preview?code=…). */
export function usePreviewAccess() {
  const { data } = useQuery({
    queryKey: ["preview-access"],
    queryFn: async () => {
      const response = await fetch("/api/preview", { cache: "no-store" });
      if (!response.ok) return false;
      return ((await response.json()) as { access?: boolean }).access === true;
    },
    staleTime: Infinity,
    retry: false,
  });
  return data === true;
}
