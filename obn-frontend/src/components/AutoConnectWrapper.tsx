"use client";

import type { ReactNode } from "react";
import { useAutoConnect } from "@/hooks/useAutoConnect";

export function AutoConnectWrapper({ children }: { children: ReactNode }) {
  useAutoConnect();
  return <>{children}</>;
}
