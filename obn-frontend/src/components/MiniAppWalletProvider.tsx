// src/components/MiniAppWalletProvider.tsx
// Farcaster mini app only: lets a user view any of their Farcaster-verified
// wallets, and connect one through WalletConnect to transact from it. Base
// Accounts don't support WalletConnect, so those open OBN in the Base app instead.
// Outside the mini app every value stays inert (viewAddress null, viewOnly false).
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient } from "wagmi";
import { getAddress, type Address } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";
import { detectMiniApp } from "@/lib/miniapp";

// Coinbase Smart Wallet (Base Account) factory on Base. Deployed accounts are
// ERC-1967 proxies whose implementation matches the factory's.
const BASE_ACCOUNT_FACTORY = "0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a" as const;
const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const factoryAbi = [{ type: "function", name: "implementation", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }] as const;

/** Opens a URL in the Base app's browser (Coinbase's documented dapp link). */
export const baseAppLink = (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`;

type MiniAppWallet = {
  inMiniApp: boolean;
  /** Address of the Farcaster client's built-in wallet, if known. */
  farcasterAddress: Address | null;
  /** Farcaster-verified addresses for the signed-in user. */
  verified: Address[];
  primary: Address | null;
  /** True for deployed Base Accounts (Coinbase Smart Wallets). */
  isBaseAccount: (address: string) => boolean;
  /** Address pages should display; null means use their default wallet logic. */
  viewAddress: Address | null;
  /** True when the displayed address is not the wallet that would sign. */
  viewOnly: boolean;
  connectedViaWalletConnect: boolean;
  connecting: boolean;
  error: string;
  select: (address: Address | null) => void;
  connectViewed: () => Promise<void>;
  switchToFarcaster: () => Promise<void>;
};

const noop = async () => {};
const MiniAppWalletContext = createContext<MiniAppWallet>({
  inMiniApp: false,
  farcasterAddress: null,
  verified: [],
  primary: null,
  isBaseAccount: () => false,
  viewAddress: null,
  viewOnly: false,
  connectedViaWalletConnect: false,
  connecting: false,
  error: "",
  select: () => {},
  connectViewed: noop,
  switchToFarcaster: noop,
});

export const useMiniAppWallet = () => useContext(MiniAppWalletContext);

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isFarcasterConnector = (c: { id: string; name: string }) =>
  c.id === "farcaster" || c.name.toLowerCase().includes("farcaster");

export function MiniAppWalletProvider({ children }: { children: ReactNode }) {
  const { address, connector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const publicClient = usePublicClient();

  const [inMiniApp, setInMiniApp] = useState(false);
  const [farcasterAddress, setFarcasterAddress] = useState<Address | null>(null);
  const [verified, setVerified] = useState<Address[]>([]);
  const [primary, setPrimary] = useState<Address | null>(null);
  const [baseAccounts, setBaseAccounts] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await detectMiniApp()) || cancelled) return;
      setInMiniApp(true);

      try {
        const accounts = await sdk.wallet.ethProvider.request({ method: "eth_accounts" });
        const first = Array.isArray(accounts) ? accounts[0] : undefined;
        if (!cancelled && typeof first === "string") setFarcasterAddress(getAddress(first));
      } catch { /* Built-in wallet may be unavailable; verified wallets still work. */ }

      try {
        const fid = (await sdk.context)?.user?.fid;
        if (!fid) return;
        const res = await fetch(`/api/farcaster/verified-addresses?fid=${fid}`);
        if (!res.ok) return;
        const body = (await res.json()) as { addresses?: string[]; primary?: string | null };
        if (cancelled) return;
        setVerified((body.addresses ?? []).map((a) => getAddress(a)));
        setPrimary(body.primary ? getAddress(body.primary) : null);
      } catch { /* Picker just lists fewer wallets. */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!publicClient || verified.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const implementation = await publicClient.readContract({
          address: BASE_ACCOUNT_FACTORY, abi: factoryAbi, functionName: "implementation",
        });
        const found = new Set<string>();
        await Promise.all(verified.map(async (a) => {
          try {
            const code = await publicClient.getCode({ address: a });
            if (!code || code === "0x") return;
            const slot = await publicClient.getStorageAt({ address: a, slot: ERC1967_IMPLEMENTATION_SLOT });
            if (slot && same(`0x${slot.slice(-40)}`, implementation)) found.add(a.toLowerCase());
          } catch { /* Unknown wallets simply stay unlabelled. */ }
        }));
        if (!cancelled) setBaseAccounts(found);
      } catch { /* Detection is a hint; WalletConnect remains available. */ }
    })();
    return () => { cancelled = true; };
  }, [publicClient, verified]);

  const isBaseAccount = useCallback((a: string) => baseAccounts.has(a.toLowerCase()), [baseAccounts]);

  const connectedViaWalletConnect = inMiniApp && connector?.id === "walletConnect" && !!address;
  // A restored WalletConnect session is what signs, so it is also what we show.
  const viewAddress = inMiniApp ? selected ?? (connectedViaWalletConnect ? address! : null) : null;
  const viewOnly = !!viewAddress && !same(viewAddress, address);

  const select = useCallback((next: Address | null) => {
    setError("");
    setSelected(next);
  }, []);

  const connectViewed = useCallback(async () => {
    const target = viewAddress;
    if (target && isBaseAccount(target)) {
      // Base Accounts sign only inside the Base app, so hand off there.
      const url = baseAppLink(window.location.origin + window.location.pathname);
      try { await sdk.actions.openUrl(url); } catch { window.open(url, "_blank", "noopener,noreferrer"); }
      return;
    }
    const wc = connectors.find((c) => c.id === "walletConnect");
    if (!wc) { setError("WalletConnect is unavailable."); return; }
    setConnecting(true);
    setError("");
    try {
      if (connector?.id === "walletConnect") await disconnectAsync({ connector });
      const { accounts } = await connectAsync({ connector: wc });
      if (target && !same(accounts[0], target)) {
        setError(`Connected ${shortAddress(accounts[0])}, not ${shortAddress(target)}. Switch accounts in your wallet app and connect again.`);
      }
    } catch {
      setError("Wallet connection was cancelled or failed.");
    } finally {
      setConnecting(false);
    }
  }, [viewAddress, isBaseAccount, connectors, connector, connectAsync, disconnectAsync]);

  const switchToFarcaster = useCallback(async () => {
    setError("");
    setSelected(null);
    try {
      if (connector?.id === "walletConnect") await disconnectAsync({ connector });
      const fc = connectors.find(isFarcasterConnector);
      if (fc && connector?.id !== fc.id) await connectAsync({ connector: fc });
    } catch { /* useAutoConnect reconnects the Farcaster wallet if this fails. */ }
  }, [connectors, connector, connectAsync, disconnectAsync]);

  const value = useMemo<MiniAppWallet>(() => ({
    inMiniApp, farcasterAddress, verified, primary, isBaseAccount, viewAddress, viewOnly,
    connectedViaWalletConnect, connecting, error, select, connectViewed, switchToFarcaster,
  }), [inMiniApp, farcasterAddress, verified, primary, isBaseAccount, viewAddress, viewOnly,
    connectedViaWalletConnect, connecting, error, select, connectViewed, switchToFarcaster]);

  return <MiniAppWalletContext.Provider value={value}>{children}</MiniAppWalletContext.Provider>;
}
