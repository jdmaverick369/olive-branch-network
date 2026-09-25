// src/components/MiniAppWalletProvider.tsx
// Farcaster mini app only: lets a user view any of their Farcaster-verified
// wallets, and connect one through WalletConnect to transact from it.
// Outside the mini app every value stays inert (viewAddress null, viewOnly false).
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { getAddress, type Address } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";
import { detectMiniApp } from "@/lib/miniapp";

type MiniAppWallet = {
  inMiniApp: boolean;
  /** Address of the Farcaster client's built-in wallet, if known. */
  farcasterAddress: Address | null;
  /** Farcaster-verified addresses for the signed-in user. */
  verified: Address[];
  primary: Address | null;
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

  const [inMiniApp, setInMiniApp] = useState(false);
  const [farcasterAddress, setFarcasterAddress] = useState<Address | null>(null);
  const [verified, setVerified] = useState<Address[]>([]);
  const [primary, setPrimary] = useState<Address | null>(null);
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
  }, [viewAddress, connectors, connector, connectAsync, disconnectAsync]);

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
    inMiniApp, farcasterAddress, verified, primary, viewAddress, viewOnly,
    connectedViaWalletConnect, connecting, error, select, connectViewed, switchToFarcaster,
  }), [inMiniApp, farcasterAddress, verified, primary, viewAddress, viewOnly,
    connectedViaWalletConnect, connecting, error, select, connectViewed, switchToFarcaster]);

  return <MiniAppWalletContext.Provider value={value}>{children}</MiniAppWalletContext.Provider>;
}
