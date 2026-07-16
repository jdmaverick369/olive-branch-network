// src/components/HeaderBar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectButton, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { FarcasterHeaderUser } from "@/components/FarcasterHeaderUser";
import { isMiniAppRuntime } from "@/lib/miniapp";
import MarketTicker from "@/components/MarketTicker";
import { useName } from "@coinbase/onchainkit/identity";
import { targetChain } from "@/wagmiConfig";

const DEV_MODE = process.env.NODE_ENV === "development";

const STORAGE_KEY = "obnTheme"; // ← same as ThemeInitScript

export default function HeaderBar() {
  const pathname = usePathname();
  const { connector, address } = useAccount();
  const isBaseAccount = connector?.id === "baseAccount";
  const { openAccountModal } = useAccountModal();
  const { data: baseName } = useName({ address, chain: targetChain });

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  // Sync best-effort guess so the Connect chip never flashes inside the
  // Farcaster webview while the async isInMiniApp detection resolves
  const [likelyMiniApp] = useState(() => isMiniAppRuntime());
  const handleMiniAppDetected = (detected: boolean) => setIsInMiniApp(detected);

  const isEmbed = pathname.startsWith("/embed");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;

      const initial =
        saved === "dark" || saved === "light"
          ? saved
          : prefersDark
          ? "dark"
          : "light";

      applyTheme(initial);
      setTheme(initial);
    } catch {
      applyTheme("light");
      setTheme("light");
    }
  }, [mounted]);

  function applyTheme(next: "light" | "dark") {
    const html = document.documentElement;
    html.classList.toggle("dark", next === "dark");
    html.setAttribute("data-theme", next === "dark" ? "dark" : "earthtone");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Desktop only: open the menu on hover and keep it open while the pointer
  // is over the button or the dropdown. The close delay lets the pointer
  // cross the small gap between them without the menu snapping shut.
  const hoverCloseTimer = useRef<number | null>(null);
  const isDesktopHover = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (min-width: 768px)").matches;

  const onMenuHoverEnter = () => {
    if (!isDesktopHover()) return;
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setOpen(true);
  };

  const onMenuHoverLeave = () => {
    if (!isDesktopHover()) return;
    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = null;
      setOpen(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  const showHeader = mounted && pathname !== "/" && !isEmbed;

  const MenuItem = ({
    href,
    label,
    external = false,
  }: {
    href: string;
    label: string;
    external?: boolean;
  }) => {
    const menuItemStyle = {
      backgroundColor: "transparent",
      color: theme === "dark" ? "#e5e7eb" : "#1f2937",
      transition: "background-color 0.2s ease-in-out",
    };

    return external ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-left px-3 py-2 text-sm rounded-md transition-colors"
        role="menuitem"
        style={menuItemStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = theme === "dark" ? "#374151" : "#f3f4f6";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
        }}
      >
        {label}
      </a>
    ) : (
      <Link
        href={href}
        className="block w-full text-left px-3 py-2 text-sm rounded-md transition-colors"
        role="menuitem"
        style={menuItemStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = theme === "dark" ? "#374151" : "#f3f4f6";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
        }}
      >
        {label}
      </Link>
    );
  };

  if (!showHeader) {
    if (isEmbed) return null;
    return (
      <div className="fixed top-0 left-0 w-full z-50 " style={{ backgroundColor: "#0D9921" }}>
        <div className="w-full px-4 md:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 invisible"><div className="h-4 w-4" /></div>
            <div className="p-1.5 invisible"><div className="h-4 w-4" /></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 w-full text-white z-50 " style={{ backgroundColor: "#0D9921" }}>
      <div className="relative w-full px-4 md:px-8 py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center md:flex md:justify-between">

        {/* Left: Menu button + Theme toggle */}
        <div className="flex items-center gap-2 z-10">
          <div className="relative" onMouseEnter={onMenuHoverEnter} onMouseLeave={onMenuHoverLeave}>
            <button
              ref={btnRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls="obn-header-menu"
              aria-label="Open menu"
              title="Menu"
              className="group flex items-center justify-center rounded-md p-1.5 md:px-2.5 md:gap-2
                         border border-white/70 text-white
                         hover:bg-white hover:text-green-700
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                         transition-colors
                         dark:border-white/60 dark:hover:bg-white dark:hover:text-green-900"
            >
              <Image
                src="/logo.png"
                alt="Menu"
                width={20}
                height={20}
                priority
                className="rounded-full transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-6"
              />
              <span className="hidden md:inline text-sm font-bold whitespace-nowrap leading-none">
                Olive Branch Network
              </span>
              <ChevronDown
                className={`hidden md:block h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
              <span className="sr-only">Open menu</span>
            </button>

            {open && (
              <div
                ref={menuRef}
                id="obn-header-menu"
                role="menu"
                className="absolute left-0 mt-2 w-48 rounded-lg bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200 shadow-lg ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
                style={{
                  backgroundColor: theme === "dark" ? "#1f2937" : "white",
                  color: theme === "dark" ? "#e5e7eb" : "#1f2937",
                  borderColor: theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                }}
              >
                <MenuItem href="/profile" label="Profile" />
                <MenuItem href="/stake-earn-contribute" label="Stake, Earn, Contribute" />
                <MenuItem href="/protocol-funds" label="Protocol Funds" />
                <MenuItem href="/trade" label="Trade OBN" />
                <MenuItem href="/analytics" label="Analytics" />
                <MenuItem href="/faq" label="FAQ" />
                <MenuItem href="/terms-of-service" label="Terms of Service" />
              </div>
            )}
          </div>

          {/* ✅ Theme toggle - same size as menu button */}
          <button
            onClick={toggleTheme}
            className="group flex items-center justify-center rounded-md p-1.5
                       border border-white/70 text-white
                       hover:bg-white hover:text-green-700
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                       transition-colors
                       dark:border-white/60 dark:hover:bg-white dark:hover:text-green-900"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Center: rotating market prices */}
        <div className="min-w-0 overflow-hidden px-1 flex justify-center md:absolute md:left-1/2 md:-translate-x-1/2 md:max-w-[42vw] md:px-0">
          <MarketTicker />
        </div>

        {/* Right: User info */}
        <div className="flex items-center gap-3 z-10">

          {/* Priority 1: Farcaster MiniApp user */}
          <FarcasterHeaderUser onMiniAppDetected={handleMiniAppDetected} />

          {/* Priority 2: Base Account — rendered directly from wagmi state (no RainbowKit loading gate) */}
          {!isInMiniApp && isBaseAccount && address && (
            <button
              type="button"
              onClick={openAccountModal}
              className="flex items-center justify-center px-3 py-2 rounded-xl bg-white text-gray-900 shadow-sm hover:shadow-lg hover:scale-105 transition-all"
              title={baseName ? `${baseName} — click to manage wallet` : "Click to manage wallet"}
            >
              <span className={`${baseName ? "font-sans" : "font-mono"} max-w-[108px] sm:max-w-[160px] truncate text-[13px] font-bold leading-none`}>
                {baseName || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
            </button>
          )}

          {/* Priority 3: All other wallets via RainbowKit */}
          {!isInMiniApp && !isBaseAccount && (
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal: openModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted: rainbowMounted,
              }) => {
                const ready = rainbowMounted && authenticationStatus !== "loading";
                const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");

                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        if (likelyMiniApp) return null;
                        return (
                          <button
                            onClick={openConnectModal}
                            type="button"
                            className="flex items-center justify-center px-3 py-2 rounded-xl bg-white text-gray-900 shadow-sm hover:shadow-lg hover:scale-105 transition-all"
                            title="Connect your wallet"
                          >
                            <span className="text-[13px] font-bold leading-none">Connect</span>
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="px-3 py-1.5 rounded-md border border-red-500/70 hover:bg-red-500 hover:text-white transition text-sm"
                          >
                            Wrong network
                          </button>
                        );
                      }

                      return (
                        <button
                          onClick={openModal}
                          type="button"
                          className="flex items-center justify-center px-3 py-2 rounded-xl bg-white text-gray-900 shadow-sm hover:shadow-lg hover:scale-105 transition-all"
                          title="Click to disconnect"
                        >
                          <span className="font-mono text-[13px] font-bold leading-none">{`${account.address.slice(0, 6)}...${account.address.slice(-4)}`}</span>
                        </button>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          )}

        </div>
      </div>
    </div>
  );
}
