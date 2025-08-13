// src/components/HeaderBar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useRouter, usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import Link from "next/link";

export default function HeaderBar() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current || !menuRef.current) return;
      if (!btnRef.current.contains(t) && !menuRef.current.contains(t)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close when route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleDisconnect = () => {
    disconnect();
    router.push("/");
  };

  const showHeader = mounted && pathname !== "/";

  const MenuItem = ({
    href,
    label,
    external = false,
  }: {
    href: string;
    label: string;
    external?: boolean;
  }) =>
    external ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100"
        role="menuitem"
      >
        {label}
      </a>
    ) : (
      <Link
        href={href}
        className="block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100"
        role="menuitem"
      >
        {label}
      </Link>
    );

  if (!showHeader) return null;

  return (
    <div className="fixed top-0 left-0 w-full bg-green-700 text-white z-50 shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        {/* Left: Logo button + dropdown */}
        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls="obn-header-menu"
            className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-white/70 rounded-md"
            title="Menu"
          >
            <Image
              src="/logo.png"
              alt="Menu"
              width={28}
              height={28}
              priority
              className="rounded-full"
            />
            <span className="sr-only">Open menu</span>
          </button>

          {open && (
            <div
              ref={menuRef}
              id="obn-header-menu"
              role="menu"
              className="absolute left-0 mt-2 w-48 rounded-lg bg-white text-gray-800 shadow-lg ring-1 ring-black/5 overflow-hidden"
            >
              <MenuItem href="https://x.com/OliveBranch_Net" label="X / Twitter" external />
              <MenuItem href="https://farcaster.xyz/olivebranch" label="Farcaster" external />
              <MenuItem href="https://discord.gg/KfMSCsss2z" label="Discord" external />
              <MenuItem href="https://github.com/jdmaverick369/olive-branch-network/releases/download/v1.0/Olive.Branch.Network.OBN.Whitepaper.pdf" label="Whitepaper" external />
            </div>
          )}
        </div>

        {/* Right: Wallet / Disconnect */}
        <div className="flex items-center gap-3">
          <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
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
