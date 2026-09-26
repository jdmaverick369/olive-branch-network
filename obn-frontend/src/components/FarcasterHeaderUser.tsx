// src/components/FarcasterHeaderUser.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import type { Address } from "viem";
import { Eye } from "lucide-react";
import { useMiniAppWallet, shortAddress } from "@/components/MiniAppWalletProvider";

type MiniAppUser = {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type Props = {
  onMiniAppDetected?: (isInMiniApp: boolean) => void;
};

export function FarcasterHeaderUser({ onMiniAppDetected }: Props) {
  const router = useRouter();
  const wallet = useMiniAppWallet();
  const [user, setUser] = useState<MiniAppUser | null>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(inMiniApp);
        onMiniAppDetected?.(inMiniApp);

        if (inMiniApp) {
          const context = await sdk.context;
          setUser(context.user);
        }
      } catch (e) {
        console.debug("Mini app context not available:", e);
      }
    };

    load();
  }, [onMiniAppDetected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isInMiniApp || !user) return null;

  const { farcasterAddress, verified, primary, isBaseAccount, viewAddress, viewOnly, connectedViaWalletConnect, connecting, error } = wallet;
  const viewingBaseAccount = !!viewAddress && isBaseAccount(viewAddress);
  // Verified wallets other than the built-in one; the built-in wallet is the default entry.
  const others = verified.filter((a) => a.toLowerCase() !== farcasterAddress?.toLowerCase());
  const onDefault = !viewAddress;

  const choose = (address: Address | null) => {
    if (address === null && connectedViaWalletConnect) void wallet.switchToFarcaster();
    else wallet.select(address);
  };

  const rowClass = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
      active ? "bg-green-50 font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-200" : "hover:bg-gray-100 dark:hover:bg-white/10"
    }`;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={viewOnly && viewAddress ? `Viewing ${shortAddress(viewAddress)} (view only). Open wallet menu` : undefined}
        className="relative flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
      >
        {user.pfpUrl && (
          <div className="flex items-center justify-center rounded-md p-0.5 border border-white/70 bg-white dark:border-white/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.pfpUrl}
              alt="Profile"
              className="h-5 w-5 rounded-full"
            />
          </div>
        )}
        {/*
          Avatar box (h-5 img + p-0.5 padding + border) is ~26px and gap-2 is 8px,
          so the text caps at (34px less than) the rainbow wallet pill's own
          max-w-27/40 + its px-3 padding on each side — same total on-screen footprint
          for avatar+username as that pill, not just the text itself.
        */}
        <span className="max-w-24.5 sm:max-w-37.5 truncate text-sm text-white">
          {viewAddress ? shortAddress(viewAddress) : user.username ? `@${user.username}` : `FID ${user.fid}`}
        </span>
        {/* Overlaid on the avatar corner so it adds no width to the header row. */}
        {viewOnly && (
          <span
            aria-hidden="true"
            title="View only"
            className="pointer-events-none absolute -left-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-green-900 ring-2 ring-white"
          >
            <Eye className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border p-2 shadow-xl"
          style={{ background: "var(--card-bg, white)", color: "var(--card-text, #111827)", borderColor: "var(--card-border, #e5e7eb)" }}
        >
          <button type="button" role="menuitem" className={rowClass(false)} onClick={() => { setOpen(false); router.push("/profile"); }}>
            View profile
          </button>

          <p className="mt-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--card-subtext)" }}>Wallet</p>

          <button type="button" role="menuitemradio" aria-checked={onDefault} className={rowClass(onDefault)} onClick={() => choose(null)}>
            <span>Farcaster wallet</span>
            <span className="font-mono text-xs">{farcasterAddress ? shortAddress(farcasterAddress) : ""}</span>
          </button>

          {others.map((a) => {
            const active = viewAddress?.toLowerCase() === a.toLowerCase();
            return (
              <button key={a} type="button" role="menuitemradio" aria-checked={active} className={rowClass(active)} onClick={() => choose(a)}>
                <span>
                  {isBaseAccount(a) ? "Base Account" : "Verified wallet"}
                  {primary?.toLowerCase() === a.toLowerCase() && <span className="font-normal opacity-70"> · primary</span>}
                </span>
                <span className="font-mono text-xs">{shortAddress(a)}</span>
              </button>
            );
          })}

          {connectedViaWalletConnect && viewAddress && !others.some((a) => a.toLowerCase() === viewAddress.toLowerCase()) && (
            <div className={rowClass(true)}>
              <span>Connected wallet</span>
              <span className="font-mono text-xs">{shortAddress(viewAddress)}</span>
            </div>
          )}

          {others.length === 0 && (
            <p className="px-3 py-1 text-xs" style={{ color: "var(--card-subtext)" }}>
              Verify more wallets in your Farcaster settings to see them here.
            </p>
          )}

          {viewOnly && (
            <div className="mt-2 border-t pt-2 px-1" style={{ borderColor: "var(--card-border, #e5e7eb)" }}>
              <p className="px-2 text-xs" style={{ color: "var(--card-subtext)" }}>
                {viewingBaseAccount
                  ? "Viewing only. This Base Account signs in the Base app — open OBN there to stake, claim or change autoclaim."
                  : "Viewing only. Connect this wallet to stake, claim or change autoclaim."}
              </p>
              <button
                type="button"
                disabled={connecting}
                onClick={() => void wallet.connectViewed()}
                className="mt-2 w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {viewingBaseAccount ? "Open in Base app" : connecting ? "Connecting…" : "Connect this wallet"}
              </button>
            </div>
          )}

          {connectedViaWalletConnect && !viewOnly && (
            <p className="mt-2 px-3 text-xs" style={{ color: "var(--card-subtext)" }}>Connected with WalletConnect.</p>
          )}

          {error && <p role="alert" className="mt-2 px-3 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
