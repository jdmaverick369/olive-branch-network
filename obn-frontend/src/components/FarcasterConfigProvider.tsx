// src/components/FarcasterConfigProvider.tsx
// Handles Farcaster MiniApp wagmi config detection and swapping.
// Kept isolated from the main app shell per Path B migration guardrails.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiWebConfig, makeMiniAppConfig } from "@/wagmiConfig";
import { isMiniAppRuntime } from "@/lib/miniapp";

const enableByEnv = process.env.NEXT_PUBLIC_ENABLE_MINIKIT === "1";

const queryClient = new QueryClient();

export function FarcasterConfigProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isMiniRuntime, setIsMiniRuntime] = useState(false);
  useEffect(() => {
    setIsMiniRuntime(isMiniAppRuntime());
  }, []);

  const [wagmiConfig, setWagmiConfig] = useState(wagmiWebConfig);
  const [configKey, setConfigKey] = useState<"web" | "mini">("web");

  useEffect(() => {
    const wantMini = enableByEnv || isMiniRuntime;
    if (!wantMini) {
      setWagmiConfig(wagmiWebConfig);
      setConfigKey("web");
      return;
    }

    try {
      const miniCfg = makeMiniAppConfig();
      setWagmiConfig(miniCfg);
      setConfigKey("mini");
    } catch (e) {
      console.warn("[MiniApp] connector unavailable, falling back to web:", e);
      setWagmiConfig(wagmiWebConfig);
      setConfigKey("web");
    }
  }, [isMiniRuntime]);

  return (
    <WagmiProvider key={configKey} config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
