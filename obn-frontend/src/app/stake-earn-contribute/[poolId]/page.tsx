"use client";

import Image from "next/image";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo, type CSSProperties } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  usePublicClient,
  useCapabilities,
  useSendCalls,
  useWaitForCallsStatus,
} from "wagmi";
import { parseUnits, formatUnits, encodeFunctionData } from "viem";
import { stakingAbi } from "@/lib/stakingAbi";
import { lensAbi } from "@/lib/lensAbi";
import { oliveAbi } from "@/lib/oliveAbi";
import { getPoolMeta, type PoolMeta } from "@/lib/pools";
import { ShareToFarcaster } from "@/components/ShareToFarcaster";
import { sdk } from "@farcaster/miniapp-sdk";
import { toast } from "sonner";
import { withTxTimeout } from "@/lib/txUtils";
import { useMobileTxRecovery } from "@/hooks/useMobileTxRecovery";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { useTheme } from "@/hooks/useTheme";
import { isMiniAppRuntime } from "@/lib/miniapp";
import { useConnectModal } from "@rainbow-me/rainbowkit";


const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const LENS_CONTRACT = (process.env.NEXT_PUBLIC_LENS_CONTRACT || undefined) as `0x${string}` | undefined;


const OLIVE_NFT = process.env.NEXT_PUBLIC_OLIVE_NFT as `0x${string}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);

const approveAbi = [{
  type: "function",
  name: "approve",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable",
}] as const;

const allowanceAbi = [{
  type: "function",
  name: "allowance",
  inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
}] as const;

// Smart formatter that adjusts decimals to ensure " OBN" suffix always fits
const fmtStaked = (n: number): string => {
  // Estimate character width: number string + " OBN" (4 chars)
  // Try different decimal places to fit in ~12-14 characters max
  const formatWithDecimals = (decimals: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // Try 4 decimals first (default)
  let formatted = formatWithDecimals(4);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Try 2 decimals
  formatted = formatWithDecimals(2);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Try 1 decimal
  formatted = formatWithDecimals(1);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Use 0 decimals as last resort
  return formatWithDecimals(0);
};

// Smart formatter for pending rewards - shows many decimals for small amounts
const fmtRewards = (n: number): string => {
  const formatWithDecimals = (decimals: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // Try 6 decimals first (for small rewards)
  let formatted = formatWithDecimals(6);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Try 4 decimals
  formatted = formatWithDecimals(4);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Try 2 decimals
  formatted = formatWithDecimals(2);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Try 1 decimal
  formatted = formatWithDecimals(1);
  if ((formatted + " OBN").length <= 14) return formatted;

  // Use 0 decimals as last resort
  return formatWithDecimals(0);
};

export default function PoolDetailPage() {
  // Match body background to page theme so overscroll area blends in
  useEffect(() => {
    const update = () => {
      const isDark = document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark";
      document.body.style.backgroundColor = isDark ? "#0a0f14" : "#ffffff";
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => {
      observer.disconnect();
      document.body.style.backgroundColor = "";
    };
  }, []);

  const { poolId } = useParams() as { poolId?: string };
  const pid = Number(poolId);
  const router = useRouter();
  const { address: wagmiAddress, connector } = useAccount();
  const publicClient = usePublicClient();
  const { openConnectModal } = useConnectModal();

  // MiniApp wallet detection (for Farcaster Android compatibility).
  // isInMiniApp is the authoritative answer from sdk.isInMiniApp() — starts
  // null and stays null until that async check resolves; handleOpenUrl below
  // needs the real answer, not a guess. isLikelyMiniApp is a synchronous
  // best-effort guess used only for layout, so first paint doesn't have to
  // block on the async check just to pick padding/sizing.
  const [miniAppAddress, setMiniAppAddress] = useState<string | null>(null);
  const [isInMiniApp, setIsInMiniApp] = useState<boolean | null>(null);
  const [isLikelyMiniApp] = useState(() => isMiniAppRuntime());
  const [isMobileBrowser, setIsMobileBrowser] = useState(false);

  // Unified address: use wagmi if available, otherwise MiniApp address
  const currentAddress = wagmiAddress ?? miniAppAddress;
  const userAddr = (currentAddress ?? ZERO_ADDR) as `0x${string}`;

  const meta: PoolMeta | undefined = Number.isFinite(pid) ? getPoolMeta(pid) : undefined;
  const invalid = !Number.isFinite(pid) || !meta;

  // Check if the connected wallet is the nonprofit wallet FOR THIS SPECIFIC POOL
  // (only show Claim-only UI on their own pool, allow stake/unstake on other pools)
  const isThisPoolsNonprofitWallet = useMemo(() => {
    if (!currentAddress || !meta || !meta.ethereumAddress) return false;
    return currentAddress.toLowerCase() === meta.ethereumAddress.toLowerCase();
  }, [currentAddress, meta]);

  const title = meta?.name ?? `Pool #${Number.isFinite(pid) ? pid : "?"}`;
  const logo = meta?.logo ?? "/fallback-logo.png";
  const detailDescription = meta?.detailDescription ?? meta?.listDescription ?? "";

  const formatLinkDisplay = (url: string): string => {
    if (url.includes("twitter.com") || url.includes("x.com")) {
      // Extract Twitter handle: x.com/username or twitter.com/username
      const match = url.match(/(?:twitter\.com|x\.com)\/(\w+)/i);
      return match ? `x.com/${match[1]}` : url;
    }
    // For website URLs, extract domain without protocol
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, "");
      return domain;
    } catch {
      return url;
    }
  };

  const urls = useMemo(() => {
    const list = [meta?.websiteUrl, meta?.twitterUrl].filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
    return Array.from(new Set(list));
  }, [meta?.websiteUrl, meta?.twitterUrl]);

  const [amount, setAmount] = useState("");
  const [processingAction, setProcessingAction] = useState<'stake' | 'unstake' | 'claim' | null>(null);
  const loading = processingAction !== null;
  const theme = useTheme();

  useMobileTxRecovery(loading, () => setProcessingAction(null));

  const [userStake, setUserStake] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);
  const [obnBalance, setObnBalance] = useState(0);
  const [charityContributed, setCharityContributed] = useState(0);

  // --- Staking reads ---
  const effectivePid = useMemo(() => (Number.isFinite(pid) ? BigInt(pid) : 0n), [pid]);

  const { data: obnBalRaw, refetch: refetchObn } = useReadContract({
    address: OBN_TOKEN_ADDRESS,
    abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const,
    functionName: "balanceOf",
    args: [userAddr],
    query: { enabled: !!currentAddress, staleTime: 30_000 },
  });
  const obnBal = obnBalRaw !== undefined ? { value: obnBalRaw as bigint, decimals: 18 } : undefined;

  const { refetch: refetchPool } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "getPoolInfo",
    args: [effectivePid],
    query: { enabled: !invalid },
  });

  const { data: userStakeData, refetch: refetchUserStake } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "userAmount",
    args: [effectivePid, userAddr],
    query: { enabled: !invalid && currentAddress != null, staleTime: 30_000 },
  });

  const { data: pendingRewardsData, refetch: refetchPendingRewards } = useReadContract({
    address: LENS_CONTRACT,
    abi: lensAbi,
    functionName: "pendingRewards",
    args: [effectivePid, userAddr],
    query: { enabled: !invalid && currentAddress != null && !!LENS_CONTRACT, staleTime: 30_000 },
  });

  const { data: charityContributedData, refetch: refetchCharityContributed } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "charityContributedByUserInPool",
    args: [effectivePid, userAddr],
    query: { enabled: !invalid && currentAddress != null, staleTime: 30_000 },
  });

  useEffect(() => {
    if (typeof userStakeData !== "undefined") {
      setUserStake(Number.parseFloat(formatUnits(userStakeData as bigint, 18)));
    }
    if (typeof pendingRewardsData !== "undefined") {
      const fullRewards = Number.parseFloat(formatUnits(pendingRewardsData as bigint, 18));
      // Users receive 88% of staking rewards; 10% goes to nonprofits, 1% to charity fund, 1% to treasury
      setPendingRewards(fullRewards * 0.88);
    }
    if (typeof charityContributedData !== "undefined") {
      setCharityContributed(Number.parseFloat(formatUnits(charityContributedData as bigint, 18)));
    }
  }, [userStakeData, pendingRewardsData, charityContributedData]);

  useEffect(() => {
    if (obnBal) setObnBalance(Number.parseFloat(formatUnits(obnBal.value, obnBal.decimals)));
  }, [obnBal]);

  // Detect mobile browser (for desktop-only scaling)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileBrowser(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect MiniApp environment (for Farcaster Android compatibility)
  useEffect(() => {
    let cancelled = false;

    const checkMiniApp = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        if (!cancelled) {
          setIsInMiniApp(inMiniApp);
        }
        if (cancelled || !inMiniApp) return;

        const provider = sdk.wallet.ethProvider;
        // Try eth_requestAccounts first
        try {
          const accounts = await provider.request({ method: "eth_requestAccounts" });
          const accs = Array.isArray(accounts) ? accounts : [];
          if (!cancelled && accs.length > 0) {
            setMiniAppAddress(accs[0]);
            return;
          }
        } catch (e) {
          console.debug("eth_requestAccounts failed:", e);
        }

        // Fallback to eth_accounts
        try {
          const accounts = await provider.request({ method: "eth_accounts" });
          const accs = Array.isArray(accounts) ? accounts : [];
          if (!cancelled && accs.length > 0) {
            setMiniAppAddress(accs[0]);
          }
        } catch (e2) {
          console.debug("eth_accounts failed:", e2);
        }
      } catch (err) {
        if (!cancelled) {
          console.debug("Mini app context not available:", err);
          setIsInMiniApp(false);
        }
      }
    };

    checkMiniApp();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Olive NFT reads ---
  const oliveEnabled = !!currentAddress && !!OLIVE_NFT;

  const { refetch: refetchOliveBal } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "balanceOf",
    args: [userAddr],
    query: {
      enabled: oliveEnabled && userAddr !== ZERO_ADDR,
    },
  });

  // When MiniApp address arrives async, explicitly trigger a fetch since wagmi
  // doesn't always catch the enabled: false -> true transition on Android.
  useEffect(() => {
    if (miniAppAddress && OLIVE_NFT) {
      refetchOliveBal();
    }
  }, [miniAppAddress]);

  // periodic refresh
  useEffect(() => {
    if (invalid) return;
    const id = setInterval(() => {
      refetchPool();
      refetchUserStake();
      refetchPendingRewards();
      refetchCharityContributed();
      refetchObn();
      refetchOliveBal?.();
    }, 15000);
    return () => clearInterval(id);
  }, [invalid, refetchPool, refetchUserStake, refetchPendingRewards, refetchObn, refetchOliveBal]);



  const postTxnRefresh = async () => {
    await new Promise<void>((r) => setTimeout(r, 1_250));
    await Promise.all([
      refetchPool(),
      refetchUserStake(),
      refetchPendingRewards(),
      refetchCharityContributed(),
      refetchObn(),
      refetchOliveBal?.(),
    ]);
  };

  const { writeContractAsync } = useWriteContract();

  // EIP-5792 batch + paymaster (Base Account only)
  const { data: walletCapabilities } = useCapabilities({
    account: userAddr,
    query: { enabled: !!currentAddress && connector?.id !== 'metaMask' && connector?.id !== 'io.metamask' },
  });
  const canBatch = !!(walletCapabilities?.[CHAIN_ID]?.paymasterService?.supported && PAYMASTER_URL);
  const { sendCallsAsync } = useSendCalls();
  const [pendingCallsId, setPendingCallsId] = useState<string | null>(null);
  const [pendingCallsAction, setPendingCallsAction] = useState<'stake' | 'unstake' | 'claim' | null>(null);
  const { status: callsStatus } = useWaitForCallsStatus({
    id: pendingCallsId ?? undefined,
    query: { enabled: !!pendingCallsId, refetchInterval: 500 },
  });
  useEffect(() => {
    if (!pendingCallsId || !pendingCallsAction) return;
    if (callsStatus === 'success') {
      postTxnRefresh();
      toast.success(pendingCallsAction === 'stake' ? 'Stake successful!' : pendingCallsAction === 'unstake' ? 'Unstake successful!' : 'Rewards claimed!');
      setPendingCallsId(null);
      setPendingCallsAction(null);
      setProcessingAction(null);
    } else if (callsStatus === 'error') {
      toast.error('Transaction failed. Please try again.');
      setPendingCallsId(null);
      setPendingCallsAction(null);
      setProcessingAction(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callsStatus]);


  const handleOpenUrl = (url: string) => {
    if (isInMiniApp) {
      sdk.actions.openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Staking flow: approve + deposit (batch for Base Account, sequential for others)
  const handleStake = async () => {
    if (loading) return;
    if (!currentAddress) {
      // isMiniAppLayout is the sync-seeded guess, so an early tap inside
      // Farcaster can never flash the RainbowKit modal
      if (!isMiniAppLayout) openConnectModal?.();
      return;
    }
    if (!Number.isFinite(pid) || !publicClient) return;
    if (!amount) return;

    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;

    const amt = parseUnits(amount, 18);

    if (!obnBal || amt > obnBal.value) {
      return;
    }

    setProcessingAction('stake');
    let tookBatchPath = false;
    try {
      if (canBatch) {
        tookBatchPath = true;
        const { id } = await sendCallsAsync({
          calls: [
            {
              to: OBN_TOKEN_ADDRESS,
              data: encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [STAKING_CONTRACT, amt] }),
            },
            {
              to: STAKING_CONTRACT,
              data: encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [effectivePid, amt] }),
            },
          ],
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('stake');
        return;
      }

      // Sequential path (MiniApp / standard wallets)
      const approveTxHash = await withTxTimeout(writeContractAsync({
        address: OBN_TOKEN_ADDRESS,
        abi: approveAbi,
        functionName: "approve",
        args: [STAKING_CONTRACT, amt],
        dataSuffix: DATA_SUFFIX,
      }));
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

      // Poll allowance to handle RPC lag
      let allowanceConfirmed = false;
      let pollAttempts = 0;
      while (!allowanceConfirmed && pollAttempts < 10) {
        try {
          const allowance = await publicClient.readContract({
            address: OBN_TOKEN_ADDRESS,
            abi: allowanceAbi,
            functionName: "allowance",
            args: [userAddr, STAKING_CONTRACT],
          }) as bigint;
          if (allowance >= amt) { allowanceConfirmed = true; }
          else { pollAttempts++; await new Promise(r => setTimeout(r, 500)); }
        } catch { pollAttempts++; await new Promise(r => setTimeout(r, 500)); }
      }
      if (!allowanceConfirmed) throw new Error("Allowance not confirmed after polling.");

      const depositTxHash = await withTxTimeout(writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "deposit",
        args: [effectivePid, amt],
        dataSuffix: DATA_SUFFIX,
      }));
      await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

      await postTxnRefresh();
      toast.success("Stake successful!");
    } catch (err) {
      console.error("Stake error:", err);
      toast.error("Stake failed. Please try again.");
      setProcessingAction(null);
    } finally {
      if (!tookBatchPath) setProcessingAction(null);
    }
  };

  const handleUnstake = async () => {
    if (loading) return;
    if (!currentAddress) {
      // isMiniAppLayout is the sync-seeded guess, so an early tap inside
      // Farcaster can never flash the RainbowKit modal
      if (!isMiniAppLayout) openConnectModal?.();
      return;
    }
    if (!Number.isFinite(pid) || !publicClient) return;
    if (!amount) return;

    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;

    setProcessingAction('unstake');
    let tookBatchPath = false;
    try {
      const amt = parseUnits(amount, 18);
      if (canBatch) {
        tookBatchPath = true;
        const { id } = await sendCallsAsync({
          calls: [{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "withdraw", args: [effectivePid, amt] }) }],
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('unstake');
        return;
      }
      await withTxTimeout(writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "withdraw", args: [effectivePid, amt], dataSuffix: DATA_SUFFIX }));
      await postTxnRefresh();
      toast.success("Unstake successful!");
    } catch (err) {
      console.error(err);
      toast.error("Unstake failed. Please try again.");
      setProcessingAction(null);
    } finally {
      if (!tookBatchPath) setProcessingAction(null);
    }
  };

  const handleClaim = async () => {
    if (loading) return;
    if (!currentAddress) {
      // isMiniAppLayout is the sync-seeded guess, so an early tap inside
      // Farcaster can never flash the RainbowKit modal
      if (!isMiniAppLayout) openConnectModal?.();
      return;
    }
    if (!Number.isFinite(pid) || !publicClient) return;
    setProcessingAction('claim');
    let tookBatchPath = false;
    try {
      if (canBatch) {
        tookBatchPath = true;
        const { id } = await sendCallsAsync({
          calls: [{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claim", args: [effectivePid] }) }],
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('claim');
        return;
      }
      await withTxTimeout(writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "claim", args: [effectivePid], dataSuffix: DATA_SUFFIX }));
      await postTxnRefresh();
      toast.success("Rewards claimed!");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Claim failed: ${msg}`);
      setProcessingAction(null);
    } finally {
      if (!tookBatchPath) setProcessingAction(null);
    }
  };

  const handleBack = () => router.back();

  // Reusable card style that matches highlighted pool cards
  const cardStyle: CSSProperties = {
    backgroundColor: theme === "dark" ? "rgba(8, 51, 68, 0.4)" : "#ecfdf5",
    color: "var(--card-text)",
    borderColor: theme === "dark" ? "rgba(8, 145, 178, 0.5)" : "#10b981",
    boxShadow: theme === "dark" ? "0 0 0 1px rgba(6, 182, 212, 0.25)" : "0 0 0 1px rgba(16, 185, 129, 0.6)",
  };

  const subTextStyle: CSSProperties = { color: "var(--card-subtext)" };

  // Prefer the authoritative async result once it resolves; until then, use
  // the synchronous best-guess so first paint picks the right layout instead
  // of blocking on the async check or always assuming "web."
  const isMiniAppLayout = isInMiniApp ?? isLikelyMiniApp;

  return (
    <div className="page-bg flex flex-col relative" style={{ ...(!isMiniAppLayout && !isMobileBrowser ? { minHeight: "calc(100dvh - var(--obn-header-h))", overflowX: 'hidden' } : { height: "calc(100dvh - var(--obn-header-h))", minHeight: 0, overflow: 'hidden' }) }}>
      <main className="flex flex-col items-center" style={!isMiniAppLayout && !isMobileBrowser ? { paddingLeft: "32px", paddingRight: "32px", transform: 'scale(1.25)', transformOrigin: 'top center', paddingTop: '32px', paddingBottom: '16px' } : { padding: "8px 16px", flex: 1, minHeight: 0, width: "100%" }}>
        {invalid ? (
          <section
            className="rounded-xl shadow-lg p-6 max-w-sm w-full text-center border"
            style={cardStyle}
          >
            <h2 className="text-xl font-bold mb-2" style={{ color: "var(--card-text)" }}>
              Pool not found
            </h2>
            <p className="text-sm mb-4" style={subTextStyle}>
              The pool you’re looking for doesn’t exist or isn’t configured yet.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleBack}
                className="text-xs font-semibold px-4 py-2 rounded-lg transition-all hover:opacity-80"
                style={{
                  backgroundColor: "#0D9921",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Main pool card */}
            <section
              style={{
                width: "100%",
                maxWidth: !isMiniAppLayout && !isMobileBrowser ? "500px" : "448px",
                ...(!isMiniAppLayout && !isMobileBrowser ? { marginBottom: "8px" } : { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 })
              }}
            >
              {/* Nonprofit info — flex-1 on mobile so bottom section stays fixed */}
              <div style={!isMiniAppLayout && !isMobileBrowser ? {} : { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {/* Title - centered at top */}
                <h2 className="text-lg font-bold text-center" style={{ color: "var(--card-text)", marginBottom: !isMiniAppLayout && !isMobileBrowser ? "20px" : "16px" }}>
                  {title}
                </h2>

                {/* Two-column header: LEFT (Logo + Address) + RIGHT (Description + Links) */}
                <div className="grid grid-cols-2 mb-4 items-center" style={{ gap: isInMiniApp === false ? "24px" : "24px" }}>
                  {/* LEFT: Logo, Truncated Address */}
                  <div className="flex flex-col items-center justify-center">
                  <Image
                    src={logo}
                    alt={`${title} logo`}
                    width={84}
                    height={84}
                    className="rounded-md light-img-border shrink-0 mb-2"
                    priority
                  />
                  {meta?.ethereumAddress && (
                    <p className="text-xs font-mono text-center" style={subTextStyle}>
                      {meta.verifyUrl ? (
                        <a
                          href={meta.verifyUrl}
                          rel="noopener noreferrer"
                          className="underline text-green-700 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 font-semibold cursor-pointer"
                          title="View nonprofit's page confirming this wallet"
                          onClick={(e) => { e.preventDefault(); handleOpenUrl(meta.verifyUrl!); }}
                        >
                          {meta.ethereumAddress.slice(0, 6)}…{meta.ethereumAddress.slice(-4)}
                        </a>
                      ) : (
                        <>
                          {meta.ethereumAddress.slice(0, 6)}…{meta.ethereumAddress.slice(-4)}
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* RIGHT: Description + Links */}
                <div className="flex flex-col overflow-hidden pr-2">
                  {detailDescription && (
                    <p className="text-xs leading-relaxed whitespace-pre-line mb-2 wrap-break-word" style={subTextStyle}>
                      {detailDescription}
                    </p>
                  )}

                  {urls.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {urls.map((u) => (
                        <a
                          key={u}
                          href={u}
                          rel="noopener noreferrer"
                          className="text-xs underline cursor-pointer"
                          style={{ color: "var(--color-link)" }}
                          onClick={(e) => { e.preventDefault(); handleOpenUrl(u); }}
                        >
                          {formatLinkDisplay(u)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>{/* end nonprofit info flex-1 wrapper */}

              <hr className="w-full mb-3" style={{ marginTop: "auto", borderColor: "var(--card-border)" }} />

              {/* Balance - centered */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <p className="font-medium text-sm" style={subTextStyle}>Balance:</p>
                <p className="font-semibold text-sm truncate" style={{ color: "var(--card-text)" }}>{fmtStaked(obnBalance)} OBN</p>
              </div>

              {/* Two-column: LEFT (Staked) + RIGHT (Contributions) */}
              <div className="grid grid-cols-2 gap-3 w-full">
                {/* LEFT: Staked + Pending */}
                <div className="flex flex-col gap-1.5 text-center rounded-xl border p-2" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)" }}>
                  <p className="font-medium whitespace-nowrap" style={{ ...subTextStyle, fontSize: "min(3.2vw, 0.75rem)" }}>Active Stake:</p>
                  <p className="font-semibold text-xs mb-1.5 truncate" style={{ color: "var(--card-text)" }}>{fmtStaked(userStake)} OBN</p>
                  <p className="font-medium whitespace-nowrap" style={{ ...subTextStyle, fontSize: "min(3.2vw, 0.75rem)" }}>Pending Rewards:</p>
                  <p className="font-semibold text-xs truncate" style={{ color: "var(--card-text)" }}>{fmtRewards(pendingRewards)} OBN</p>
                </div>

                {/* RIGHT: Contributions */}
                <div className="flex flex-col gap-1.5 text-center rounded-xl border p-2" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)" }}>
                  <p className="font-medium whitespace-nowrap" style={{ ...subTextStyle, fontSize: "min(3.2vw, 0.75rem)" }}>Contributed:</p>
                  <p className="font-semibold text-xs mb-1.5 truncate" style={{ color: theme === "dark" ? "#86efac" : "#16a34a" }}>{fmtRewards(charityContributed)} OBN</p>
                  <p className="font-medium whitespace-nowrap" style={{ ...subTextStyle, fontSize: "min(3.2vw, 0.75rem)" }}>Pending Contribution:</p>
                  <p className="font-semibold text-xs truncate" style={{ color: theme === "dark" ? "#86efac" : "#16a34a" }}>{fmtRewards(pendingRewards / 0.88 * 0.10)} OBN</p>
                </div>
              </div>

            </section>

            {/* Controls */}
            <div className="flex flex-col items-center w-full" style={{ maxWidth: !isMiniAppLayout && !isMobileBrowser ? "400px" : "448px", marginTop: !isMiniAppLayout && !isMobileBrowser ? "32px" : "16px" }}>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter OBN amount"
                className="w-50 border rounded-lg px-3.5 py-2.5 mb-4 text-center focus:ring-2 focus:ring-green-500 text-sm"
                style={{ borderColor: "var(--card-border)", color: "var(--card-text)", backgroundColor: "var(--card-bg)" }}
              />
              {isThisPoolsNonprofitWallet ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    disabled={loading}
                    onClick={handleClaim}
                    className="px-5 py-2.5 rounded-lg font-semibold border transition text-sm"
                    style={{ borderColor: "#2563eb", color: "#2563eb" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
                      (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
                    }}
                  >
                    {processingAction === 'claim' ? "Processing..." : "Claim"}
                  </button>

                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleBack}
                      className="text-xs font-semibold px-4 py-2 rounded-lg transition hover:opacity-80"
                      style={{
                        backgroundColor: "#0D9921",
                        color: "white",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={isMiniAppLayout ? "flex flex-wrap gap-3 justify-center" : "flex gap-3 justify-center"} style={isMiniAppLayout ? undefined : { flexWrap: 'nowrap' }}>
                    <button
                      disabled={loading}
                      onClick={handleStake}
                      className={isMiniAppLayout ? "px-4 py-2 rounded-lg font-semibold border transition text-xs flex-1 min-w-20 whitespace-nowrap" : "px-3 py-2 rounded-lg font-semibold border transition text-xs flex-1 whitespace-nowrap"}
                      style={{ borderColor: "#0D9921", color: "#0D9921", minWidth: isMiniAppLayout ? undefined : '70px' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0D9921";
                        (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                        (e.currentTarget as HTMLButtonElement).style.color = "#0D9921";
                      }}
                    >
                      {processingAction === 'stake' ? "Processing..." : "Stake"}
                    </button>
                    <button
                      disabled={loading}
                      onClick={handleUnstake}
                      className={isMiniAppLayout ? "px-4 py-2 rounded-lg font-semibold border transition text-xs flex-1 min-w-20 whitespace-nowrap" : "px-3 py-2 rounded-lg font-semibold border transition text-xs flex-1 whitespace-nowrap"}
                      style={{ borderColor: "#dc2626", color: "#dc2626", minWidth: isMiniAppLayout ? undefined : '70px' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#dc2626";
                        (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                        (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
                      }}
                    >
                      {processingAction === 'unstake' ? "Processing..." : "Unstake"}
                    </button>
                    <button
                      disabled={loading}
                      onClick={handleClaim}
                      className={isMiniAppLayout ? "px-4 py-2 rounded-lg font-semibold border transition text-xs flex-1 min-w-20 whitespace-nowrap" : "px-3 py-2 rounded-lg font-semibold border transition text-xs flex-1 whitespace-nowrap"}
                      style={{ borderColor: "#2563eb", color: "#2563eb", minWidth: isMiniAppLayout ? undefined : '70px' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
                        (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                        (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
                      }}
                    >
                      {processingAction === 'claim' ? "Processing..." : "Claim"}
                    </button>
                    {isInMiniApp && (
                      <ShareToFarcaster
                        text={`I'm earning $OBN while supporting ${meta?.name ?? "a nonprofit"} on the Olive Branch Network! Check out their MiniApp 🌱`}
                        className="px-4 py-2 rounded-lg font-semibold border border-purple-600 text-purple-600 transition text-xs flex-1 min-w-20 whitespace-nowrap hover:bg-purple-600 hover:text-white"
                      />
                    )}
                  </div>

                  <div className="flex gap-2 justify-center mt-5 mb-3">
                    <button
                      onClick={handleBack}
                      className="text-xs font-semibold px-4 py-2 rounded-lg transition hover:opacity-80"
                      style={{
                        backgroundColor: "#0D9921",
                        color: "white",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <footer
          className="main-content mt-0 py-2 px-1 text-center text-[9px] italic"
          style={{ color: "var(--card-subtext)" }}
        >
          Olive Branch Network is a decentralized application and does not have any direct
          affiliation with any of the organizations displayed.
        </footer>
      </main>

      {/* 🔲 Light-mode image borders (scoped helpers) */}
      <style jsx global>{`
        :root:not(.dark) img.light-img-border {
          border: 1px solid #000000 !important;
        }
        :root:not(.dark) .light-border-black {
          border-color: #000000 !important;
        }
      `}</style>
    </div>
  );
}
