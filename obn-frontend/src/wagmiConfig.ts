// src/wagmiConfig.ts
import { connectorsForWallets, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { createConfig, createStorage, http, fallback, type Config } from "wagmi";
import { walletConnect, baseAccount } from "@wagmi/connectors";
import { base, baseSepolia, type Chain } from "wagmi/chains";

import { isFarcasterHost } from "./isFarcasterHost";

// NOTE: This package likely exports a factory function
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

export const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID!;
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
const cdpProjectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID;
const cdpRpcUrl = cdpProjectId
  ? `https://api.developer.coinbase.com/rpc/v1/base/${cdpProjectId}`
  : undefined;

const transport = fallback([
  http(rpcUrl),
  ...(cdpRpcUrl ? [http(cdpRpcUrl)] : []),
]);
const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);

export const targetChain: Chain =
  targetChainId === base.id ? base : baseSepolia;

// ---- Standard Web (RainbowKit + Base Account) Config ----
const { wallets } = getDefaultWallets({ appName: "Olive Branch Network", projectId });
const webConnectors = connectorsForWallets(wallets, {
  appName: "Olive Branch Network",
  projectId,
});

export const wagmiWebConfig: Config = createConfig({
  chains: [targetChain],
  connectors: [
    ...webConnectors,
    baseAccount({ appName: "Olive Branch Network" }),
  ],
  storage: createStorage({ storage: typeof window !== "undefined" ? sessionStorage : undefined }),
  transports: { [targetChain.id]: transport },
  ssr: true,
});

// ---- Farcaster MiniApp Config ----
export function makeMiniAppConfig(): Config {
  const farcaster = farcasterMiniApp(); // <-- instantiate here

  const wc = walletConnect({
    projectId,
    showQrModal: !isFarcasterHost,
    metadata: {
      name: "Olive Branch Network",
      description: "Stake OBN to support verified nonprofits.",
      url: "https://dapp.olivebranch.network",
      icons: ["https://dapp.olivebranch.network/icon.png"],
    },
  });

  return createConfig({
    chains: [targetChain],
    transports: { [targetChain.id]: transport },
    connectors: isFarcasterHost ? [farcaster, wc] : [wc],
    ssr: true,
  });
}

// Helper for runtime config
export function getRuntimeWagmiConfig(): Config {
  return isFarcasterHost ? makeMiniAppConfig() : wagmiWebConfig;
}
