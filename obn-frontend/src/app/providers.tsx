// src/app/providers.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

import { OnchainKitProvider } from '@coinbase/onchainkit';
import {
  wagmiWebConfig,
  makeMiniAppConfig,
  targetChain,
} from '../wagmiConfig';

const queryClient = new QueryClient();

const okApiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;
const enableByEnv = process.env.NEXT_PUBLIC_ENABLE_MINIKIT === '1';

function probablyInFarcasterWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('warpcast') || ua.includes('farcaster');
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Detect environment once on mount
  const [isMiniRuntime, setIsMiniRuntime] = useState(false);
  useEffect(() => {
    setIsMiniRuntime(probablyInFarcasterWebView());
  }, []);

  // Build (or swap to) the correct wagmi config
  const [wagmiConfig, setWagmiConfig] = useState(wagmiWebConfig);
  const [configKey, setConfigKey] = useState<'web' | 'mini'>('web');

  useEffect(() => {
    const wantMini = enableByEnv || isMiniRuntime;
    if (!wantMini) {
      // ensure we’re on web config if user navigates out of mini runtime
      setWagmiConfig(wagmiWebConfig);
      setConfigKey('web');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const miniCfg = await makeMiniAppConfig();
        if (!cancelled) {
          setWagmiConfig(miniCfg);
          setConfigKey('mini');
        }
      } catch (e) {
        // fallback to web config if connector import fails
        console.warn('[MiniApp] connector unavailable, falling back to web:', e);
        if (!cancelled) {
          setWagmiConfig(wagmiWebConfig);
          setConfigKey('web');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMiniRuntime]);

  // Only wrap with OnchainKit when we actually want MiniKit + you provided an API key
  const shouldWrapWithOnchainKit = useMemo(
    () => !!okApiKey && (enableByEnv || isMiniRuntime),
    [okApiKey, isMiniRuntime]
  );

  const core = (
    <WagmiProvider key={configKey} config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );

  return shouldWrapWithOnchainKit ? (
    <OnchainKitProvider apiKey={okApiKey!} chain={targetChain}>
      {core}
    </OnchainKitProvider>
  ) : (
    core
  );
}
