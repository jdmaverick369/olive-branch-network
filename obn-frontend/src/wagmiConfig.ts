// src/wagmiConfig.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http, type Config } from 'wagmi';
import { base, baseSepolia, type Chain } from 'wagmi/chains';

export const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID!;
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL; // optional override
const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);

// export this so Providers can pass it into OnchainKitProvider
export const targetChain: Chain = targetChainId === base.id ? base : baseSepolia;

/**
 * Standard web (RainbowKit) config — your current behavior
 */
export const wagmiWebConfig: Config = getDefaultConfig({
  appName: 'Olive Branch Network',
  projectId,
  chains: [targetChain],
  transports: {
    [targetChain.id]: http(rpcUrl),
  },
  ssr: true,
});

/**
 * MiniApp (Farcaster) config — built lazily so we don’t import the connector on web.
 * We intentionally type this loosely so it won’t break if the connector export name changes.
 */
export async function makeMiniAppConfig(): Promise<Config> {
  const mod: any = await import('@farcaster/miniapp-wagmi-connector');
  // Try a few likely export names, fall back to default
  const ConnectorClass =
    mod?.FarcasterWagmiConnector ||
    mod?.MiniAppConnector ||
    mod?.FarcasterMiniAppConnector ||
    mod?.default;

  if (!ConnectorClass) {
    throw new Error('MiniApp wagmi connector not found in @farcaster/miniapp-wagmi-connector');
  }

  const miniConnector = new ConnectorClass({
    options: {
      // most apps don’t need extra options; add if your flow requires
      // e.g. appName: 'Olive Branch Network'
    },
  });

  return createConfig({
    chains: [targetChain],
    transports: {
      [targetChain.id]: http(rpcUrl),
    },
    connectors: [miniConnector],
    ssr: true,
  });
}
