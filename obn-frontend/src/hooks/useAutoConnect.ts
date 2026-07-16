import { useEffect, useRef } from "react";
import { useConnect } from "wagmi";
import { useAccount } from "wagmi";
import { isMiniAppRuntime } from "@/lib/miniapp";

function isCoinbaseWalletBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as { ethereum?: { isCoinbaseWallet?: boolean } }).ethereum
      ?.isCoinbaseWallet
  );
}

/**
 * Auto-connects to the appropriate wallet based on the runtime environment:
 * - Farcaster Mini App: connects via the Farcaster connector
 * - Base App / Coinbase Wallet browser: connects via the baseAccount connector
 * - Standard web: does nothing (manual connection via ConnectButton)
 *
 * Uses a ref to track if we've already attempted connection to avoid
 * infinite loops while still allowing retry if the connector isn't available yet.
 */
export function useAutoConnect() {
  const { isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const attemptedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const inFarcaster = isMiniAppRuntime();
    const inBaseApp = !inFarcaster && isCoinbaseWalletBrowser();

    // Only auto-connect in known wallet-injected environments
    if (!inFarcaster && !inBaseApp) {
      return;
    }

    // Don't auto-connect if already connected
    if (isConnected) {
      attemptedRef.current = false; // Reset for next time if disconnected
      return;
    }

    // Only attempt if we haven't already
    if (attemptedRef.current) {
      return;
    }

    if (inFarcaster) {
      const farcasterConnector = connectors.find(
        (connector) =>
          connector.id === "farcaster" ||
          connector.name.toLowerCase().includes("farcaster")
      );

      if (farcasterConnector) {
        attemptedRef.current = true;
        connect({ connector: farcasterConnector });
      } else if (connectors.length === 0) {
        timeoutRef.current = setTimeout(() => {
          attemptedRef.current = false;
        }, 100);
      }
    } else if (inBaseApp) {
      const baseConnector = connectors.find(
        (connector) => connector.id === "baseAccount"
      );

      if (baseConnector) {
        attemptedRef.current = true;
        connect({ connector: baseConnector });
      } else if (connectors.length === 0) {
        timeoutRef.current = setTimeout(() => {
          attemptedRef.current = false;
        }, 100);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isConnected, connectors, connect]);
}
