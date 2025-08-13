// src/app/page.tsx
"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (isConnected) {
      router.push("/dashboard");
    }
  }, [isConnected, router]);

  // Dropdown state/refs (same behavior as HeaderBar)
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // Reusable menu item
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

  return (
    <div className="min-h-screen w-full flex flex-col bg-base-100">
      {/* Fake Header with Logo + Dropdown (no connect button here) */}
      <div className="fixed top-0 left-0 w-full bg-green-700 text-white z-50 shadow-md">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          {/* Left: Logo dropdown trigger */}
          <div className="relative">
            <button
              ref={btnRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls="landing-header-menu"
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
                id="landing-header-menu"
                role="menu"
                className="absolute left-0 mt-2 w-48 rounded-lg bg-white text-gray-800 shadow-lg ring-1 ring-black/5 overflow-hidden"
              >
                <MenuItem href="https://x.com/OliveBranch_Net" label="X / Twitter" external />
                <MenuItem href="https://farcaster.xyz/olivebranch" label="Farcaster" external />
                <MenuItem
                  href="https://discord.gg/KfMSCsss2z"
                  label="Discord"
                  external
                />
                <MenuItem
                  href="https://github.com/jdmaverick369/olive-branch-network/releases/download/v1.0/Olive.Branch.Network.OBN.Whitepaper.pdf"
                  label="Whitepaper"
                  external
                />
              </div>
            )}
          </div>

          {/* Right side intentionally empty on landing */}
          <div />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center mt-[64px]">
        <h1
          className="
            text-[clamp(2.5rem,8vw,4rem)]
            font-extrabold
            flex flex-wrap justify-center items-center gap-3
            mb-6
          "
        >
          {/* Bouncing Logo */}
          <span
            className="inline-block animate-bounce"
            style={{ animationDuration: "2s" }}
          >
            <Image
              src="/logo.png"
              alt="Olive Branch Network Logo"
              width={50}
              height={50}
              priority
            />
          </span>
          Olive Branch Network
        </h1>

        <div className="flex flex-col items-center gap-y-8 max-w-md">
          <p className="text-lg md:text-xl">
            A decentralized staking protocol designed to support those in need.
          </p>
          <ConnectButton />
        </div>
      </main>
    </div>
  );
}
