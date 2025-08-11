// src/components/HeaderBar.tsx
"use client";

import { useAccount, useDisconnect } from "wagmi";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function HeaderBar() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  const handleDisconnect = () => {
    disconnect();
    router.push("/"); // back to landing
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-green-700 text-white z-50 shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="font-bold text-lg">🌱 Olive Branch Network</div>

        <div className="flex items-center gap-3">
          {/* Small RainbowKit button for quick status / switching */}
          <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />

          {/* One-click disconnect + redirect */}
          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-md border border-white/70 hover:bg-white hover:text-green-700 transition text-sm"
              aria-label="Disconnect wallet"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
