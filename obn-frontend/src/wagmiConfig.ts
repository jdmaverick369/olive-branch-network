import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  createConfig,
  http,
  type Config,
  type CreateConnectorFn,
} from "wagmi";
import { base, baseSepolia, type Chain } from "wagmi/chains";

export const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID!;
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL; // optional override
const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);

// Export target chain for consumers that need it
export const targetChain: Chain =
  targetChainId === base.id ? base : baseSepolia;

/**
 * Standard web (RainbowKit) config
 */
export const wagmiWebConfig: Config = getDefaultConfig({
  appName: "Olive Branch Network",
  projectId,
  chains: [targetChain],
  transports: {
    [targetChain.id]: http(rpcUrl),
  },
  ssr: true,
});

/**
 * MiniApp (Farcaster) config — built lazily so we don’t load it on web.
 * This expects the package to export a connector **factory** that already
 * conforms to Wagmi’s `CreateConnectorFn` (common in wagmi v2).
 *
 * No OnchainKit/BaseApp code here.
 */
type MiniAppModule = Partial<Record<string, unknown>>;

function pickConnectorFactory(mod: MiniAppModule): CreateConnectorFn | null {
  // Try common factory export names that return a CreateConnectorFn
  const candidates = [
    "farcasterMiniApp",      // hypothetical factory
    "createFarcasterConnector",
    "miniAppConnector",
    "default",
  ] as const;

  for (const key of candidates) {
    const maybe = mod[key];
    if (typeof maybe === "function") {
      // We assume the function conforms to CreateConnectorFn
      return maybe as unknown as CreateConnectorFn;
    }
  }
  return null;
}

export async function makeMiniAppConfig(): Promise<Config> {
  // Dynamic import keeps this out of the web bundle
  const mod = (await import(
    "@farcaster/miniapp-wagmi-connector"
  )) as MiniAppModule;

  const connectorFactory = pickConnectorFactory(mod);
  if (!connectorFactory) {
    throw new Error(
      "Expected a CreateConnectorFn factory from @farcaster/miniapp-wagmi-connector"
    );
  }

  return createConfig({
    chains: [targetChain],
    transports: {
      [targetChain.id]: http(rpcUrl),
    },
    connectors: [connectorFactory],
    ssr: true,
  });
}
