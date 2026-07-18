// src/app/stake-earn-contribute/page.tsx
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { sdk } from "@farcaster/miniapp-sdk";
import Image from "next/image";
import { CheckCircle, X as XIcon } from "lucide-react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import LazyPoolCard from "@/components/LazyPoolCard";
import { POOLS, PoolCategory } from "@/lib/pools";
import { useStakingPhase } from "@/hooks/useStakingPhase";
import { useAddMiniAppPrompt } from "@/hooks/useAddMiniAppPrompt";
import { usePublicClient } from "wagmi";
import { stakingAbi } from "@/lib/stakingAbi";
import { isMiniAppRuntime } from "@/lib/miniapp";
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

/**
 * Hook to override body background to match page gradient bottom color
 */
function usePageBackground() {
  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    // Set body to match --page-bg-to (the bottom of the gradient)
    document.body.style.backgroundColor = "var(--page-bg-to)";

    return () => {
      document.body.style.backgroundColor = originalBg;
    };
  }, []);
}

export default function DashboardPage() {
  // Override body background to match page gradient
  usePageBackground();
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const phase = useStakingPhase();
  // Keep the current published rates visible immediately while the single
  // cached phase request resolves.
  const contractPct = phase.contractPct ?? 10.0;
  const displayPct = phase.stakerPct ?? 8.8;

  const EXIT_URL = "https://www.olivebranch.network";

  const [showPopup, setShowPopup] = useState(false);
  const [userAnswer, setUserAnswer] = useState<"agree" | null>("agree");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeCategory, setActiveCategory] = useState<PoolCategory | null>(null);

  const [miniAppAddress, setMiniAppAddress] = useState<string | null>(null);

  // Detect MiniApp environment.
  // isInMiniApp is the authoritative answer from sdk.isInMiniApp() — it starts
  // null and stays null until that async check resolves. Redirect/wallet-fetch
  // logic must keep waiting on it so MiniApp users are never treated as web
  // users prematurely.
  // isLikelyMiniApp is a synchronous best-effort guess (checks for the host's
  // injected bridge object) used only to pick the right layout on first paint,
  // so we don't have to block all rendering on the async check just for styling.
  const [isMounted, setIsMounted] = useState(false);
  const [isInMiniApp, setIsInMiniApp] = useState<boolean | null>(null);
  const [isLikelyMiniApp] = useState(() => isMiniAppRuntime());
  const [isMobileBrowser, setIsMobileBrowser] = useState(false);

  const hasRealAddress = !!(address || miniAppAddress);
  const userAddr = hasRealAddress
    ? ((address ?? miniAppAddress) as `0x${string}`)
    : ZERO_ADDR;

  useEffect(() => {
    setIsMounted(true);
    const checkMiniApp = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(inMiniApp);
      } catch (e) {
        console.debug("Mini app context not available:", e);
        setIsInMiniApp(false);
      }
    };
    checkMiniApp();

    // Detect mobile browser using window width
    const checkMobile = () => {
      setIsMobileBrowser(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Fetch address from Farcaster MiniApp provider if in MiniApp
  useEffect(() => {
    let cancelled = false;

    async function getMiniAppAddress() {
      if (!isInMiniApp) return;
      try {
        const provider = sdk.wallet.ethProvider;
        // Request accounts from the provider
        const accounts = await provider.request({
          method: "eth_requestAccounts",
        });
        const accs = Array.isArray(accounts) ? accounts : [];
        if (accs.length > 0 && !cancelled) {
          setMiniAppAddress(accs[0]);
        }
      } catch (err) {
        console.debug("Failed to get MiniApp address:", err);
        // If eth_requestAccounts fails, try eth_accounts
        try {
          const provider = sdk.wallet.ethProvider;
          const accounts = await provider.request({
            method: "eth_accounts",
          });
          const accs = Array.isArray(accounts) ? accounts : [];
          if (accs.length > 0 && !cancelled) {
            setMiniAppAddress(accs[0]);
          }
        } catch (fallbackErr) {
          console.debug("Failed to get accounts from MiniApp provider:", fallbackErr);
        }
      }
    }

    getMiniAppAddress();
    return () => {
      cancelled = true;
    };
  }, [isInMiniApp]);

  // Consent popup restore
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("obnDashboardConsent") : null;

    if (saved === "agree") {
      setUserAnswer("agree");
      setShowPopup(false);
    } else if (saved === null) {
      // First time user - show popup
      setShowPopup(true);
      setUserAnswer(null);
    } else {
      // Explicitly disagreed or other value
      if (saved) localStorage.removeItem("obnDashboardConsent");
      setShowPopup(true);
      setUserAnswer(null);
    }
  }, []);

  // Disable background scroll while popup visible
  useEffect(() => {
    const restore = () => {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    };
    if (showPopup) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      return restore;
    } else restore();
  }, [showPopup]);

  // Track theme changes
  useEffect(() => {
    const detectTheme = () => {
      const isDark = document.documentElement.classList.contains("dark") ||
                     document.documentElement.getAttribute("data-theme") === "dark";
      setTheme(isDark ? "dark" : "light");
    };

    detectTheme();
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);


  // Trigger mini app prompt after user agrees to consent
  useAddMiniAppPrompt(userAnswer === "agree");

  const handleAgree = () => {
    localStorage.setItem("obnDashboardConsent", "agree");
    setUserAnswer("agree");
    setShowPopup(false);
  };

  const handleNoOrClose = () => {
    try {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    } catch {}
    localStorage.removeItem("obnDashboardConsent");
    setShowPopup(false);
    window.close();
    setTimeout(() => window.location.assign(EXIT_URL), 40);
  };

  // Fetch user's stake amounts for all pools
  const [userStakes, setUserStakes] = useState<Map<number, bigint>>(new Map());

  useEffect(() => {
    if (!publicClient || !hasRealAddress || userAddr === ZERO_ADDR) {
      setUserStakes(new Map());
      return;
    }

    let cancelled = false;

    async function fetchUserStakes() {
      try {
        const contracts = POOLS.map((pool) => ({
          address: STAKING_CONTRACT,
          abi: stakingAbi,
          functionName: "userAmount" as const,
          args: [BigInt(pool.pid), userAddr] as const,
        }));

        const results = await publicClient!.multicall({ contracts });

        if (!cancelled) {
          // Initialize all pools with 0n to ensure consistent sorting even if multicall fails
          const stakeMap = new Map<number, bigint>();
          POOLS.forEach(p => stakeMap.set(p.pid, 0n));

          results.forEach((result, index) => {
            stakeMap.set(
              POOLS[index].pid,
              result.status === "success" ? (result.result as bigint) : 0n
            );
          });
          setUserStakes(stakeMap);
        }
      } catch (error) {
        console.error("Failed to fetch user stakes:", error);
      }
    }

    fetchUserStakes();
    const interval = setInterval(fetchUserStakes, 15000); // Refresh every 15 seconds

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient, hasRealAddress, userAddr]);

  // Sort pools: user's staked pools first (alphabetically), then unstaked (alphabetically)
  const sortedPools = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    return [...POOLS].sort((a, b) => {
      const aStake = userStakes.get(a.pid) ?? 0n;
      const bStake = userStakes.get(b.pid) ?? 0n;

      // Pools with stake come first
      if (aStake > 0n && bStake === 0n) return -1;
      if (aStake === 0n && bStake > 0n) return 1;

      // Alphabetically by name, then by pid
      const byName = collator.compare(a.name, b.name);
      return byName !== 0 ? byName : a.pid - b.pid;
    });
  }, [userStakes]);

  const connectedNonprofitPid = useMemo(() => {
    if (!address) return null;
    const match = POOLS.find((p) => p.ethereumAddress.toLowerCase() === address.toLowerCase());
    return match ? match.pid : null;
  }, [address]);

  const filteredPools = useMemo(() => {
    const base = activeCategory === null ? sortedPools : sortedPools.filter((p) => p.category === activeCategory);
    if (connectedNonprofitPid !== null) return base.filter((p) => p.pid !== connectedNonprofitPid);
    return base;
  }, [sortedPools, activeCategory, connectedNonprofitPid]);

  // Window-virtualize the pool list: every pool stays reachable by scrolling
  // (nothing is hidden behind a button), but only cards near the viewport are
  // ever actually mounted, so render cost stays flat as the list grows from
  // 11 pools today toward 99 rather than scaling with it.
  const poolListRef = useRef<HTMLDivElement>(null);
  const poolListOffsetRef = useRef(0);
  useLayoutEffect(() => {
    poolListOffsetRef.current = poolListRef.current?.offsetTop ?? 0;
  });
  const poolVirtualizer = useWindowVirtualizer({
    count: filteredPools.length,
    estimateSize: () => 98, // ~64px logo + py-3 padding + border + gap-2
    overscan: 8,
    scrollMargin: poolListOffsetRef.current,
  });

  // Prefer the authoritative async result once it resolves; until then, use
  // the synchronous best-guess so first paint picks the right layout instead
  // of always assuming "web" and flashing/reflowing for real MiniApp users.
  const isMiniAppLayout = isInMiniApp ?? isLikelyMiniApp;

  return (
    <div className="flex flex-col relative page-bg" style={{ minHeight: "calc(100dvh - var(--obn-header-h))" }}>
      {/* Consent Modal */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div
            className="relative rounded-2xl shadow-2xl w-[92%] max-w-md overflow-hidden animate-scale-in"
            style={{ backgroundColor: "#ffffff", border: "1px solid #bbf7d0", color: "#111827" }}
          >
            <button
              onClick={handleNoOrClose}
              aria-label="Close"
              className="absolute right-3 top-3 text-white rounded-full p-1.5 transition"
              style={{ backgroundColor: "rgba(21,128,61,0.4)" }}
            >
              <XIcon className="w-4 h-4" />
            </button>

            <div
              className="flex flex-col items-center justify-center py-5"
              style={{ backgroundColor: "#0D9921" }}
            >
              <Image
                src="/logo.png"
                alt="Logo"
                width={70}
                height={70}
                className="mb-2 rounded-md"
              />
              <h2 className="text-2xl font-extrabold" style={{ color: "#ffffff" }}>
                Olive Branch Network
              </h2>
              <p className="text-sm mt-2 max-w-xs mx-auto" style={{ color: "#ffffff" }}>
                A staking protocol empowering non-profits to help better the world.
              </p>
            </div>

            <div className="p-6 text-center">
              <ul className="text-left text-sm mb-5 space-y-3" style={{ color: "#374151" }}>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" style={{ color: "#16a34a" }} />
                  <span>Click on a nonprofit that resonates with you</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" style={{ color: "#16a34a" }} />
                  <span>Type in the amount you want to stake</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" style={{ color: "#16a34a" }} />
                  <span>Hit the &quot;Stake&quot; button</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" style={{ color: "#16a34a" }} />
                  <span>Hit the &quot;Claim&quot; button to receive pending rewards</span>
                </li>
              </ul>

              <p className="text-xs mb-4" style={{ color: "#6b7280" }}>
                By clicking &quot;I Agree&quot; I am confirming I will read the terms of service before using the app.
              </p>

              <div className="flex justify-center gap-3">
                <button
                  onClick={handleAgree}
                  className="px-5 py-2 rounded-xl font-semibold text-white hover:scale-105 transition-transform"
                  style={{ backgroundColor: "#0D9921" }}
                >
                  I Agree
                </button>
                <button
                  onClick={handleNoOrClose}
                  className="px-5 py-2 rounded-xl font-semibold hover:scale-105 transition-transform"
                  style={{ backgroundColor: "#f3f4f6", color: "#1f2937" }}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showPopup && userAnswer === "agree" && (
        <>
          <main
            className="main-content px-4 flex flex-col items-center"
            style={!isMiniAppLayout && !isMobileBrowser ? {
              paddingTop: '32px',
              paddingBottom: '16px',
              zoom: 1.4,
            } : {
              paddingTop: isMiniAppLayout ? '23px' : '20px',
              paddingBottom: '12px',
            }}
          >
            {/* Page title */}
            <h1 className="text-2xl font-bold text-center mb-5" style={{ color: "var(--card-text)" }}>
              Stake <span style={{ color: theme === "dark" ? "#86efac" : "#0D9921" }}>-</span> Earn <span style={{ color: theme === "dark" ? "#86efac" : "#0D9921" }}>-</span> Contribute
            </h1>

            {/* Stake, Earn, Contribute + APY - directly under title */}
            <div className="flex justify-center mb-2">
              <div className="grid items-stretch grid-cols-2 gap-1.5">
                {/* Left: Stake, Earn, Contribute */}
                <div className="flex flex-col rounded-xl border justify-center" style={{ padding: "12px", backgroundColor: "transparent", borderColor: "var(--card-border)" }}>
                  <p className="text-xs font-bold mb-3 text-center" style={{ color: "var(--card-text)" }}>
                    User Guide
                  </p>
                  <div className="flex flex-col space-y-2">
                    {[
                      "Click on a nonprofit organization",
                      "Stake $OBN tokens and earn rewards",
                      "Claim rewards and contribute",
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span
                          className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ backgroundColor: "#16a34a" }}
                        >
                          {i + 1}
                        </span>
                        <p className="text-xs leading-tight" style={{ color: "var(--card-text)" }}>{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: APY */}
                <div className="rounded-xl border" style={{ padding: "12px", backgroundColor: "transparent", borderColor: "var(--card-border)" }}>
                  <div className="grid grid-cols-2 gap-2 pb-1 mb-2">
                    <div className="flex flex-col items-center">
                      <p className="text-[min(2vw,7px)] font-bold uppercase mb-1 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>User APY</p>
                      <p className="text-sm font-bold" style={{ color: theme === "dark" ? "#86efac" : "#0D9921" }}>
                        {displayPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <p className="text-[min(2vw,7px)] font-bold uppercase mb-1 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Contract APY</p>
                      <p className="text-sm font-bold" style={{ color: theme === "dark" ? "#86efac" : "#0D9921" }}>
                        {contractPct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-center">
                    <p className="text-[min(2.5vw,9px)] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap" style={{ backgroundColor: "#16a34a", color: "white" }}>88% to Stakers</p>
                    <p className="text-[min(2.5vw,9px)] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap" style={{ backgroundColor: "#2563eb", color: "white" }}>10% to Nonprofits</p>
                    <p className="text-[min(2.5vw,9px)] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap" style={{ backgroundColor: "#a855f7", color: "white" }}>1% to ExtendOliveBranch</p>
                    <p className="text-[min(2.5vw,9px)] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap" style={{ backgroundColor: "#6b7280", color: "white" }}>1% to TheOffering</p>
                  </div>
                </div>
              </div>
            </div>


            {/* Category filters */}
            <div className="flex justify-center gap-1.5 sm:gap-2 mt-3.5 mb-2.5 flex-nowrap">
              {([
                { label: "All", value: null },
                { label: "Humanitarian", value: "humanitarian" as PoolCategory },
                { label: "Environment", value: "environment" as PoolCategory },
                { label: "Animals", value: "animals" as PoolCategory },
              ] as const).map(({ label, value }) => {
                const isActive = value === null ? activeCategory === null : activeCategory === value;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveCategory(value === null ? null : value)}
                    className="px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: isActive ? "#0D9921" : "transparent",
                      color: isActive ? "white" : "var(--card-text)",
                      border: `1px solid ${isActive ? "#0D9921" : "var(--card-border)"}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Two-column layout for desktop browsers, stacked for mobile/MiniApp */}
            <div className="w-full flex flex-col items-center" style={{ maxWidth: isMobileBrowser || isMiniAppLayout ? '1280px' : '1800px', margin: '0 auto' }}>

              {/* Pools List — virtualized, see poolVirtualizer above */}
              <div
                ref={poolListRef}
                className="w-full relative"
                style={{ maxWidth: "600px", height: poolVirtualizer.getTotalSize() }}
              >
                {poolVirtualizer.getVirtualItems().map((virtualRow) => {
                  const pool = filteredPools[virtualRow.index];
                  return (
                    <div
                      key={pool.pid}
                      ref={poolVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute top-0 left-0 w-full pb-2"
                      style={{
                        transform: `translateY(${virtualRow.start - poolVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <LazyPoolCard
                        pid={pool.pid}
                        logo={pool.logo}
                        name={pool.name}
                        description={pool.listDescription}
                        live={pool.live}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <footer
              className="main-content mt-1 py-2 px-1 text-center text-[9px] italic"
              style={{ color: "var(--card-subtext)" }}
            >
              Olive Branch Network is a decentralized application and does not have any direct
              affiliation with any of the organizations displayed.
            </footer>
          </main>
        </>
      )}

      <style jsx global>{`
        :root:not(.dark) .main-content img:not(.olive-nft-image) {
          border: 1px solid #000 !important;
          border-radius: 0.375rem;
        }
        :root:not(.dark) img.light-img-border {
          border: 1px solid #000 !important;
        }
        /* keep it green in light; override to greener in dark if desired */
        .dark .animate-bounce {
          color: #22c55e !important;
        }
      `}</style>
    </div>
  );
}
