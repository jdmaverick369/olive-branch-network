// src/app/providers.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

import { wagmiWebConfig, makeMiniAppConfig } from "@/wagmiConfig";
import { isMiniAppRuntime } from "@/lib/miniapp";

const queryClient = new QueryClient();

// Optional override via env to force MiniApp mode for testing
const enableByEnv = process.env.NEXT_PUBLIC_ENABLE_MINIKIT === "1";

export function Providers({ children }: { children: ReactNode }) {
  // Detect Farcaster Mini App environment once on mount
  const [isMiniRuntime, setIsMiniRuntime] = useState(false);
  useEffect(() => {
    setIsMiniRuntime(isMiniAppRuntime());
  }, []);

  // Build/swap the correct wagmi config
  const [wagmiConfig, setWagmiConfig] = useState(wagmiWebConfig);
  const [configKey, setConfigKey] = useState<"web" | "mini">("web");

  useEffect(() => {
    const wantMini = enableByEnv || isMiniRuntime;
    if (!wantMini) {
      setWagmiConfig(wagmiWebConfig);
      setConfigKey("web");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const miniCfg = await makeMiniAppConfig();
        if (!cancelled) {
          setWagmiConfig(miniCfg);
          setConfigKey("mini");
        }
      } catch (e) {
        // Fallback to web config if the Mini App connector isn't available
        console.warn("[MiniApp] connector unavailable, falling back to web:", e);
        if (!cancelled) {
          setWagmiConfig(wagmiWebConfig);
          setConfigKey("web");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMiniRuntime]); // env flag is static; no need to include

  return (
    <WagmiProvider key={configKey} config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}