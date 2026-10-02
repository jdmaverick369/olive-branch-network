import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { useAccount } from "wagmi";
import { isMiniAppRuntime, detectMiniApp } from "@/lib/miniapp";
import { isBaseAccountConnector } from "@/lib/baseAccountConnector";

// Other wallets' in-app browsers and extensions often also claim isCoinbaseWallet for compatibility.
const OTHER_WALLET_FLAGS = [
  "isRainbow", "isTrust", "isTrustWallet", "isPhantom", "isOkxWallet", "isOKExWallet", "isRabby", "isZerion",
  "isBraveWallet", "isTokenPocket", "isBitKeep", "isExodus", "isCoin98", "isSafePal", "isMEWwallet", "isImToken",
] as const;

/**
 * Only the in-app browser of the Coinbase Wallet (Base) mobile app, the way Coinbase's own SDK detects
 * it (isCoinbaseBrowser). isCoinbaseWallet alone isn't enough: the desktop extension sets it, and so do
 * other wallets' in-app browsers (e.g. Rainbow) for compatibility. Everyone else connects manually.
 */
function isCoinbaseWalletBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ethereum = (window as { ethereum?: Record<string, unknown> }).ethereum;
  if (!ethereum || ethereum.isCoinbaseBrowser !== true) return false;
  return !OTHER_WALLET_FLAGS.some((flag) => ethereum[flag]);
}

/**
 * Auto-connects to the appropriate wallet based on the runtime environment:
 * - Farcaster Mini App: connects via the Farcaster connector
 * - Base App / Coinbase Wallet mobile in-app browser: connects via the baseAccount connector
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
  const [inFarcaster, setInFarcaster] = useState(() => isMiniAppRuntime());

  useEffect(() => {
    let cancelled = false;
    void detectMiniApp().then((inMini) => {
      if (!cancelled && inMini) setInFarcaster(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
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
      const baseConnector = connectors.find(isBaseAccountConnector);

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
  }, [isConnected, connectors, connect, inFarcaster]);
}
