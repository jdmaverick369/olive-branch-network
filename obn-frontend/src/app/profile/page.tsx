// src/app/profile/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAccount, useReadContract, useWriteContract, usePublicClient,
  useCapabilities, useSendCalls, useWaitForCallsStatus,
} from "wagmi";
import { sdk } from "@farcaster/miniapp-sdk";
import Image from "next/image";
import { Loader } from "lucide-react";
import { POOLS, PoolMeta } from "@/lib/pools";
import { stakingAbi } from "@/lib/stakingAbi";
import { lensAbi } from "@/lib/lensAbi";
import { oliveAbi } from "@/lib/oliveAbi";
import { formatUnits, parseUnits, encodeFunctionData, type PublicClient } from "viem";
import { toast } from "sonner";

/* NFT Effects imports */
import { NFTWithTimedEffects } from "@/components/NFTWithTimedEffects";
import { effectFromAccumulated } from "@/components/effectsMap";
import { useTotalStakedAcrossPools } from "@/hooks/useTotalStakedAcrossPools";
import { useStakingClock } from "@/hooks/useStakingClock";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { useOnChainStakeElapsed } from "@/hooks/useOnChainStakeElapsed";
import { withTxTimeout } from "@/lib/txUtils";
import { useMobileTxRecovery } from "@/hooks/useMobileTxRecovery";
import { useTheme } from "@/hooks/useTheme";
import { isMiniAppRuntime } from "@/lib/miniapp";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { readOwnedNftsCache, writeOwnedNftsCache, fetchOwnedTokenIdsAndUris, fetchNftImages } from "@/lib/ownedNfts";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const LENS_CONTRACT = process.env.NEXT_PUBLIC_LENS_CONTRACT as `0x${string}`;
const OLIVE_NFT = process.env.NEXT_PUBLIC_OLIVE_NFT as `0x${string}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);

type OwnedOlive = { id: bigint; uri?: string; img?: string | null };

/**
 * Hook to force GIF reload on visibility changes (fixes WebView stuck animations)
 */
function useGifBust(enabled: boolean) {
  const [bust, setBust] = useState(0);
  const retryRef = useRef(0);

  const bump = () => setBust((x) => x + 1);

  const bumpWithCap = () => {
    if (retryRef.current >= 5) return;
    retryRef.current += 1;
    bump();
  };

  useEffect(() => {
    if (!enabled) return;

    retryRef.current = 0;
    bump();

    const onVis = () => {
      if (!document.hidden) bump();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", bump);
    window.addEventListener("focus", bump);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", bump);
      window.removeEventListener("focus", bump);
    };
  }, [enabled]);

  return { bust, bump: bumpWithCap };
}

type PoolContribution = {
  pid: number;
  name: string;
  logo: string;
  staked: number;
  pending: number;
  charityContributed: number;
  isActive: boolean;
};

// Batches getUserPoolView + charityContributedByUserInPool for every live pool
// into a single multicall instead of awaiting them one pool at a time — at 11
// pools that's already up to 22 sequential RPC round-trips per fetch (and this
// runs on every claim plus a 30s poll); at 99 pools it'd be ~198 and unusable.
async function fetchAllContributions(
  publicClient: PublicClient,
  userAddr: `0x${string}`,
  excludePid?: number
): Promise<PoolContribution[]> {
  const eligiblePools = POOLS.filter((pool) => pool.live && pool.pid !== excludePid);

  const contracts = eligiblePools.flatMap((pool) => [
    {
      address: LENS_CONTRACT,
      abi: lensAbi,
      functionName: "getUserPoolView" as const,
      args: [BigInt(pool.pid), userAddr] as const,
    },
    {
      address: STAKING_CONTRACT,
      abi: stakingAbi,
      functionName: "charityContributedByUserInPool" as const,
      args: [BigInt(pool.pid), userAddr] as const,
    },
  ]);

  // If the RPC request itself fails (network/transport, not a per-call revert),
  // degrade to an empty result set rather than throwing — matches the old
  // per-pool try/catch's effective behavior, and keeps callers' setLoading(false)
  // reachable instead of leaving the spinner stuck forever.
  let multicallResults: ({ status: "success"; result: unknown } | { status: "failure"; error: Error })[] = [];
  if (contracts.length > 0) {
    try {
      multicallResults = await publicClient.multicall({ contracts });
    } catch (err) {
      console.error("Failed to fetch pool contributions:", err);
      return [];
    }
  }

  const results: PoolContribution[] = [];

  eligiblePools.forEach((pool, i) => {
    const poolViewResult = multicallResults[i * 2];
    const charityResult = multicallResults[i * 2 + 1];

    if (poolViewResult?.status !== "success" || charityResult?.status !== "success") {
      console.error(`Error fetching pool ${pool.pid}`);
      return;
    }

    const [staked, , , , pending] = poolViewResult.result as [bigint, bigint, bigint, bigint, bigint, boolean];
    const charityContributed = charityResult.result as bigint;

    const stakedNum = Number.parseFloat(formatUnits(staked, 18));
    const pendingNum = Number.parseFloat(formatUnits(pending, 18)) * 0.88; // User gets 88%
    const charityNum = Number.parseFloat(formatUnits(charityContributed, 18));

    results.push({
      pid: pool.pid,
      name: pool.name,
      logo: pool.logo,
      staked: stakedNum,
      pending: pendingNum,
      charityContributed: charityNum,
      isActive: stakedNum > 0,
    });
  });

  // Sort: active pools by staked then contributed (highest first), inactive by contributed then name
  results.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    if (a.isActive && b.isActive) {
      if (b.staked !== a.staked) return b.staked - a.staked;
      return b.charityContributed - a.charityContributed;
    }
    if (b.charityContributed !== a.charityContributed) return b.charityContributed - a.charityContributed;
    return a.name.localeCompare(b.name);
  });

  return results;
}

function usePageBackground() {
  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "var(--page-bg-to)";
    return () => {
      document.body.style.backgroundColor = originalBg;
    };
  }, []);
}

const DEV_MODE = process.env.NODE_ENV === "development";

export default function UserPage() {
  usePageBackground();
  const [devNonprofitPid, setDevNonprofitPid] = useState<number | null>(null);

  useEffect(() => {
    if (!DEV_MODE) return;
    const pid = new URLSearchParams(window.location.search).get("devNonprofit");
    if (pid !== null) setDevNonprofitPid(Number(pid));
  }, []);

  const { address, connector } = useAccount();
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { data: walletCapabilities } = useCapabilities({ account: address, query: { enabled: !!address && connector?.id !== 'metaMask' && connector?.id !== 'io.metamask' } });
  const canBatch = !!(walletCapabilities?.[CHAIN_ID]?.paymasterService?.supported && PAYMASTER_URL);
  const { sendCallsAsync } = useSendCalls();
  const [pendingCallsId, setPendingCallsId] = useState<string | null>(null);
  const [pendingCallsAction, setPendingCallsAction] = useState<'claimAll' | 'claim' | 'nonprofitClaim' | 'mint' | null>(null);
  const { status: callsStatus } = useWaitForCallsStatus({
    id: pendingCallsId ?? undefined,
    query: { enabled: !!pendingCallsId, refetchInterval: 500 },
  });

  const theme = useTheme();
  const [isMobileBrowser, setIsMobileBrowser] = useState(false);
  // Seed from the synchronous host-bridge check instead of hardcoding false,
  // so a real MiniApp user gets the right value immediately on first render
  // instead of waiting on the async sdk.isInMiniApp() check below to correct it.
  const [isInMiniApp, setIsInMiniApp] = useState(() => isMiniAppRuntime());
  const [miniAppAddress, setMiniAppAddress] = useState<string | null>(null);

  const [contributions, setContributions] = useState<PoolContribution[]>([]);
  const [totalClaimed, setTotalClaimed] = useState(0);
  const [totalCharityContributed, setTotalCharityContributed] = useState(0);
  const [totalPendingRewards, setTotalPendingRewards] = useState(0);
  const [totalPendingContribution, setTotalPendingContribution] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claimingPid, setClaimingPid] = useState<number | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  useMobileTxRecovery(claimingAll || claimingPid !== null, () => {
    setClaimingAll(false);
    setClaimingPid(null);
  });

  // Nonprofit-specific state
  const [nonprofitPoolStats, setNonprofitPoolStats] = useState<{
    totalStaked: number;
    totalCharityReceived: number;
    uniqueStakers: number;
    pendingRewards: number;
  } | null>(null);

  const currentAddress = miniAppAddress ?? address;
  const userAddr = (currentAddress ?? ZERO_ADDR) as `0x${string}`;

  // Once the user has been connected and the page rendered, keep showing it
  // until the redirect fires — prevents flashing blank/stale states on disconnect

  // NFT state
  const [owned, setOwned] = useState<OwnedOlive[]>([]);
  const [nftLoading, setNftLoading] = useState(true);
  const [mintingNft, setMintingNft] = useState(false);

  // Check if connected wallet is a nonprofit wallet
  const nonprofitPool: PoolMeta | undefined = useMemo(() => {
    if (DEV_MODE && devNonprofitPid !== null) {
      return POOLS.find((p) => p.pid === devNonprofitPid);
    }
    if (!currentAddress) return undefined;
    return POOLS.find(
      (pool) => pool.ethereumAddress.toLowerCase() === currentAddress.toLowerCase()
    );
  }, [currentAddress, devNonprofitPid]);

  const isNonprofit = !!nonprofitPool;


  // Detect mobile browser
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileBrowser(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle EIP-5792 batch transaction completion
  useEffect(() => {
    if (!pendingCallsId || !pendingCallsAction) return;
    if (callsStatus === 'success') {
      if (pendingCallsAction === 'mint') {
        toast.success('NFT minted successfully!');
        setMintingNft(false);
        setTimeout(() => { refetchOliveBal(); }, 1_250);
      } else {
        const msg = pendingCallsAction === 'claimAll' ? 'All rewards claimed!' : 'Rewards claimed!';
        toast.success(msg);
        if (pendingCallsAction === 'claimAll') setClaimingAll(false);
        else setClaimingPid(null);
        setTimeout(() => {
          refetchAllContributions();
          refetchTotalClaimed();
          refetchTotalCharity();
          refetchObnBalance();
        }, 1_250);
      }
      setPendingCallsId(null);
      setPendingCallsAction(null);
    } else if (callsStatus === 'error') {
      if (pendingCallsAction === 'mint') {
        toast.error('Mint failed. Please try again.');
        setMintingNft(false);
      } else {
        toast.error('Claim failed. Please try again.');
        if (pendingCallsAction === 'claimAll') setClaimingAll(false);
        else setClaimingPid(null);
      }
      setPendingCallsId(null);
      setPendingCallsAction(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callsStatus]);

  // Detect MiniApp environment
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
        try {
          const accounts = await provider.request({ method: "eth_requestAccounts" });
          const accs = Array.isArray(accounts) ? accounts : [];
          if (!cancelled && accs.length > 0) {
            setMiniAppAddress(accs[0]);
            return;
          }
        } catch {
          // fallback
        }
        try {
          const accounts = await provider.request({ method: "eth_accounts" });
          const accs = Array.isArray(accounts) ? accounts : [];
          if (!cancelled && accs.length > 0) {
            setMiniAppAddress(accs[0]);
          }
        } catch {
          // ignore
        }
      } catch {
        if (!cancelled) {
          setIsInMiniApp(false);
        }
      }
    };
    checkMiniApp();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch user's OBN token balance
  const { data: obnBalanceRaw, refetch: refetchObnBalance } = useReadContract({
    address: OBN_TOKEN_ADDRESS,
    abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const,
    functionName: "balanceOf",
    args: [userAddr],
    query: { enabled: !!currentAddress, refetchInterval: 30_000, staleTime: 30_000 },
  });
  const obnBalance = obnBalanceRaw !== undefined ? Number.parseFloat(formatUnits(obnBalanceRaw as bigint, 18)) : 0;

  // Fetch total claimed by user (for all users including nonprofits)
  const { data: totalClaimedData, refetch: refetchTotalClaimed } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "totalClaimedByUser",
    args: [userAddr],
    query: { enabled: !!currentAddress, staleTime: 30_000 },
  });

  // Fetch total charity contributed (for all users including nonprofits)
  const { data: totalCharityData, refetch: refetchTotalCharity } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "totalCharityContributedByUser",
    args: [userAddr],
    query: { enabled: !!currentAddress, staleTime: 30_000 },
  });

  useEffect(() => {
    if (totalClaimedData) {
      setTotalClaimed(Number.parseFloat(formatUnits(totalClaimedData as bigint, 18)));
    }
    if (totalCharityData) {
      setTotalCharityContributed(Number.parseFloat(formatUnits(totalCharityData as bigint, 18)));
    }
  }, [totalClaimedData, totalCharityData]);

  // --- Olive NFT reads ---
  const oliveEnabled = !!currentAddress && !!OLIVE_NFT;

  const { data: saleActive } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "saleActive",
    query: { enabled: !!OLIVE_NFT, staleTime: 60_000 },
  });

  const { data: mintPriceBN } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "MINT_PRICE",
    query: { enabled: !!OLIVE_NFT, staleTime: 300_000 },
  });

  const { data: oliveBalBN, refetch: refetchOliveBal } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "balanceOf",
    args: [userAddr],
    query: {
      enabled: oliveEnabled && userAddr !== ZERO_ADDR,
      staleTime: 30_000,
    },
  });

  const ownsOlive = (oliveBalBN ?? 0n) > 0n;

  // When MiniApp address arrives async, explicitly trigger a fetch since wagmi
  // doesn't always catch the enabled: false -> true transition on Android.
  useEffect(() => {
    if (miniAppAddress && OLIVE_NFT) {
      refetchOliveBal();
    }
  }, [miniAppAddress]);

  // Compute when egg should show (disconnected users can't own one, so the
  // egg also serves as the logged-out placeholder)
  const shouldShowEgg = useMemo(() => {
    return !!OLIVE_NFT && !ownsOlive;
  }, [ownsOlive]);

  const { bust: eggBust, bump: bumpEgg } = useGifBust(!!shouldShowEgg);

  // Load NFT tokens owned by the wallet — checks the shared cache first
  // (NFTPrefetch, mounted in the root layout, runs on every route and likely
  // already warmed it before the user landed here) before falling back to a
  // fresh fetch.
  useEffect(() => {
    let stopped = false;

    async function loadOwned() {
      if (!publicClient || !OLIVE_NFT || (!currentAddress && !isInMiniApp)) {
        if (!stopped) {
          setOwned([]);
          setNftLoading(false);
        }
        return;
      }
      const count = Number(oliveBalBN ?? 0n);
      if (count === 0) {
        if (!stopped) {
          setOwned([]);
          setNftLoading(false);
        }
        return;
      }

      const cached = readOwnedNftsCache(count);
      if (cached !== null) {
        if (!stopped) {
          setOwned(cached.map((c) => ({ id: BigInt(c.id), uri: c.uri, img: c.img })));
          setNftLoading(false);
        }
        return;
      }

      if (!stopped) setNftLoading(true);

      try {
        const idsAndUris = await fetchOwnedTokenIdsAndUris(publicClient, OLIVE_NFT, userAddr, count);
        const imgs = await fetchNftImages(idsAndUris.map((x) => x.uri));

        if (!stopped) {
          const merged = idsAndUris.map(({ id, uri }, i) => ({ id, uri, img: imgs[i] }));
          setOwned(merged);
          setNftLoading(false);
        }
        writeOwnedNftsCache(
          idsAndUris.map(({ id, uri }, i) => ({ id: id.toString(), uri, img: imgs[i], timestamp: Date.now() }))
        );
      } catch {
        if (!stopped) {
          setOwned([]);
          setNftLoading(false);
        }
      }
    }

    loadOwned();
    return () => {
      stopped = true;
    };
  }, [currentAddress, isInMiniApp, oliveBalBN, userAddr, publicClient]);

  // NFT Effects calculations
  const { totalStaked } = useTotalStakedAcrossPools({
    stakingAddress: STAKING_CONTRACT,
    stakingAbi,
    getUserInfoName: "userAmount",
    pollMs: 10_000,
    walletAddress: userAddr,
  });

  const equippedTokenId = ownsOlive ? "owned" : "0";
  const isEquipped = ownsOlive;

  const { elapsedSec: onChainElapsedSec, isLoading: clockLoading } = useOnChainStakeElapsed(
    currentAddress ? (currentAddress as `0x${string}`) : null
  );

  const { accumulatedSec } = useStakingClock({
    tokenId: equippedTokenId,
    isEquipped,
    totalStaked,
    tickMs: 1000,
    walletAddress: currentAddress ?? null,
    onChainElapsedSec,
  });

  const computedEffect = effectFromAccumulated(accumulatedSec);
  const effect = computedEffect;

  const DAY = 60 * 60 * 24;
  const PROGRESS_MAX_SEC = 90 * DAY;
  const progressPct = Math.max(0, Math.min(100, (accumulatedSec / PROGRESS_MAX_SEC) * 100));

  const rainbowStyle: CSSProperties = {
    background: "linear-gradient(90deg, #ff0059, #ff9f00, #ffee00, #5fff00, #00c6ff, #7a00ff)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };

  const saleOn = Boolean(saleActive);
  const mintPriceEth = mintPriceBN ? Number(formatUnits(mintPriceBN as bigint, 18)) : 0.005;

  const onMintOlive = async () => {
    if (mintingNft) return;
    if (!currentAddress) {
      if (!isInMiniApp) openConnectModal?.();
      return;
    }
    if (!OLIVE_NFT) return;
    setMintingNft(true);
    const price = (mintPriceBN as bigint) ?? parseUnits("0.005", 18);
    let tookBatchPath = false;
    try {
      if (canBatch) {
        tookBatchPath = true;
        const { id } = await sendCallsAsync({
          calls: [{ to: OLIVE_NFT, data: encodeFunctionData({ abi: oliveAbi, functionName: "mint" }), value: price, dataSuffix: DATA_SUFFIX }],
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('mint');
        return;
      }
      await withTxTimeout(writeContractAsync({ address: OLIVE_NFT, abi: oliveAbi, functionName: "mint", value: price, dataSuffix: DATA_SUFFIX }));
      await new Promise<void>((r) => setTimeout(r, 1_250));
      await refetchOliveBal();
      toast.success("NFT minted successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Mint failed. Please try again.");
      setMintingNft(false);
    } finally {
      if (!tookBatchPath) setMintingNft(false);
    }
  };

  // Fetch nonprofit pool stats
  useEffect(() => {
    if (!currentAddress || !publicClient || !isNonprofit || !nonprofitPool) {
      return;
    }

    const fetchNonprofitStats = async () => {
      if (!LENS_CONTRACT) { setLoading(false); return; }
      setLoading(true);
      try {
        const [poolStats, pending] = await Promise.all([
          publicClient.readContract({
            address: LENS_CONTRACT,
            abi: lensAbi,
            functionName: "getPoolStats",
            args: [BigInt(nonprofitPool.pid)],
          }) as Promise<[string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]>,
          publicClient.readContract({
            address: LENS_CONTRACT,
            abi: lensAbi,
            functionName: "pendingRewards",
            args: [BigInt(nonprofitPool.pid), userAddr],
          }) as Promise<bigint>,
        ]);

        const [, totalStaked, uniqueStakers, , , , , , charityMintedAllTime] = poolStats;

        setNonprofitPoolStats({
          totalStaked: Number.parseFloat(formatUnits(totalStaked, 18)),
          totalCharityReceived: Number.parseFloat(formatUnits(charityMintedAllTime, 18)),
          uniqueStakers: Number(uniqueStakers),
          pendingRewards: Number.parseFloat(formatUnits(pending, 18)) * 0.88,
        });
      } catch (err) {
        console.error("Error fetching nonprofit stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNonprofitStats();
  }, [currentAddress, publicClient, isNonprofit, nonprofitPool, userAddr]);

  // Fetch all pool data for users (including nonprofits staking to other pools)
  useEffect(() => {
    if (!currentAddress || !publicClient) {
      setLoading(false);
      return;
    }

    const fetchContributions = async () => {
      // Don't set loading here for nonprofits - their main stats are fetched separately
      if (!isNonprofit) setLoading(true);

      // For nonprofits, skip their own pool (shown in Pool Statistics section)
      const excludePid = isNonprofit ? nonprofitPool?.pid : undefined;
      const results = await fetchAllContributions(publicClient, userAddr, excludePid);

      setContributions(results);
      // Calculate total pending rewards across all active pools
      const totalPending = results.reduce((sum, c) => sum + c.pending, 0);
      setTotalPendingRewards(totalPending);
      // Calculate total pending contribution (charity portion = 10% of gross, user gets 88%)
      // If userPending = gross * 0.88, then charityPending = gross * 0.10 = userPending * (10/88)
      setTotalPendingContribution(totalPending * (10 / 88));
      if (!isNonprofit) setLoading(false);
    };

    fetchContributions();
  }, [currentAddress, publicClient, userAddr, isNonprofit, nonprofitPool]);

  // Refetch all contributions data
  const refetchAllContributions = async () => {
    if (!currentAddress || !publicClient) return;

    const results = await fetchAllContributions(publicClient, userAddr);

    setContributions(results);
    // Calculate total pending rewards across all active pools
    const totalPending = results.reduce((sum, c) => sum + c.pending, 0);
    setTotalPendingRewards(totalPending);
    // Calculate total pending contribution (charity portion = 10% of gross, user gets 88%)
    setTotalPendingContribution(totalPending * (10 / 88));
  };

  // Handle claim all - batch claim from all pools with pending rewards
  const handleClaimAll = async () => {
    if (claimingAll || !currentAddress || !publicClient) return;

    // Get all pool IDs with pending rewards
    const poolsWithPending = contributions.filter((c) => c.pending > 0.0001);
    if (poolsWithPending.length === 0) return;

    const pids = poolsWithPending.map((c) => BigInt(c.pid));

    setClaimingAll(true);
    let tookBatchPath = false;
    try {
      if (canBatch) {
        tookBatchPath = true;
        const calls = pids.length === 1
          ? [{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claim", args: [pids[0]] }), dataSuffix: DATA_SUFFIX }]
          : [{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claimMultiple", args: [pids] }), dataSuffix: DATA_SUFFIX }];
        const { id } = await sendCallsAsync({
          calls,
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('claimAll');
        return;
      }

      // Sequential path (MiniApp / standard wallets)
      // Use single claim for 1 pool (cheaper gas), claimMultiple for 2+ pools
      if (pids.length === 1) {
        await withTxTimeout(writeContractAsync({
          address: STAKING_CONTRACT,
          abi: stakingAbi,
          functionName: "claim",
          args: [pids[0]],
          dataSuffix: DATA_SUFFIX,
        }));
      } else {
        await withTxTimeout(writeContractAsync({
          address: STAKING_CONTRACT,
          abi: stakingAbi,
          functionName: "claimMultiple",
          args: [pids],
          dataSuffix: DATA_SUFFIX,
        }));
      }

      await new Promise<void>((r) => setTimeout(r, 1_250));

      // Refetch all data after claim and update state with returned data
      await refetchAllContributions();

      const claimedResult = await refetchTotalClaimed();
      if (claimedResult.data) {
        setTotalClaimed(Number.parseFloat(formatUnits(claimedResult.data as bigint, 18)));
      }

      const charityResult = await refetchTotalCharity();
      if (charityResult.data) {
        setTotalCharityContributed(Number.parseFloat(formatUnits(charityResult.data as bigint, 18)));
      }

      // Refetch OBN balance (user received claimed tokens)
      await refetchObnBalance();
      toast.success("All rewards claimed!");
    } catch (err) {
      console.error("Claim all failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Claim failed: ${msg}`);
      setClaimingAll(false);
    } finally {
      if (!tookBatchPath) setClaimingAll(false);
    }
  };

  // Periodic refresh for real-time pending rewards updates
  useEffect(() => {
    if (!currentAddress || !publicClient) return;

    const refreshInterval = setInterval(async () => {
      // Refresh user contributions
      await refetchAllContributions();

      // Refresh nonprofit pool stats if applicable
      if (isNonprofit && nonprofitPool) {
        try {
          const pending = await publicClient.readContract({
            address: LENS_CONTRACT,
            abi: lensAbi,
            functionName: "pendingRewards",
            args: [BigInt(nonprofitPool.pid), userAddr],
          }) as bigint;

          setNonprofitPoolStats((prev) =>
            prev
              ? { ...prev, pendingRewards: Number.parseFloat(formatUnits(pending, 18)) * 0.88 }
              : null
          );
        } catch (err) {
          console.error("Error refreshing nonprofit pending:", err);
        }
      }
    }, 30_000);

    return () => clearInterval(refreshInterval);
  }, [currentAddress, publicClient, isNonprofit, nonprofitPool, userAddr]);

  const handleClaim = async (pid: number) => {
    if (claimingPid !== null || !currentAddress || !publicClient) return;
    setClaimingPid(pid);
    let tookBatchPath = false;
    try {
      if (canBatch) {
        tookBatchPath = true;
        const { id } = await sendCallsAsync({
          calls: [{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claim", args: [BigInt(pid)] }), dataSuffix: DATA_SUFFIX }],
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('claim');
        return;
      }

      await withTxTimeout(writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "claim",
        args: [BigInt(pid)],
        dataSuffix: DATA_SUFFIX,
      }));

      await new Promise<void>((r) => setTimeout(r, 1_250));
      // Refetch all data after claim
      await refetchAllContributions();
      await refetchTotalClaimed();
      await refetchTotalCharity();
      await refetchObnBalance();
      toast.success("Rewards claimed!");
    } catch (err) {
      console.error("Claim failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Claim failed: ${msg}`);
      setClaimingPid(null);
    } finally {
      if (!tookBatchPath) setClaimingPid(null);
    }
  };

  const handleNonprofitClaim = async () => {
    if (claimingPid !== null || !currentAddress || !publicClient || !nonprofitPool) return;
    setClaimingPid(nonprofitPool.pid);
    let tookBatchPath = false;
    try {
      if (canBatch) {
        tookBatchPath = true;
        const { id } = await sendCallsAsync({
          calls: [{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claim", args: [BigInt(nonprofitPool.pid)] }), dataSuffix: DATA_SUFFIX }],
          capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
        });
        setPendingCallsId(id);
        setPendingCallsAction('nonprofitClaim');
        return;
      }

      await withTxTimeout(writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "claim",
        args: [BigInt(nonprofitPool.pid)],
        dataSuffix: DATA_SUFFIX,
      }));

      await new Promise<void>((r) => setTimeout(r, 1_250));
      // Refetch pending rewards
      const pending = await publicClient.readContract({
        address: LENS_CONTRACT,
        abi: lensAbi,
        functionName: "pendingRewards",
        args: [BigInt(nonprofitPool.pid), userAddr],
      }) as bigint;

      setNonprofitPoolStats((prev) =>
        prev
          ? { ...prev, pendingRewards: Number.parseFloat(formatUnits(pending, 18)) * 0.88 }
          : null
      );

      // Refetch total claimed and charity data
      await refetchTotalClaimed();
      await refetchTotalCharity();
      toast.success("Rewards claimed!");
    } catch (err) {
      console.error("Claim failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Claim failed: ${msg}`);
      setClaimingPid(null);
    } finally {
      if (!tookBatchPath) setClaimingPid(null);
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
    if (num >= 1000) return (num / 1000).toFixed(2) + "K";
    return num.toFixed(decimals);
  };

  // Uniform formatter that pads to consistent character length
  const formatUniform = (num: number, targetLength: number = 7): string => {
    let formatted: string;
    if (num >= 1000000) {
      formatted = (num / 1000000).toFixed(2) + "M";
    } else if (num >= 1000) {
      formatted = (num / 1000).toFixed(2) + "K";
    } else {
      formatted = num.toFixed(2);
    }
    // Pad with non-breaking spaces for uniform width
    return formatted.padStart(targetLength, "\u00A0");
  };

  const activeContributions = contributions.filter((c) => c.isActive);
  const inactiveContributions = contributions.filter((c) => !c.isActive && c.charityContributed > 0);
  const hasAnyHistory = activeContributions.length > 0 || inactiveContributions.length > 0;

  const cardStyle = {
    backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
    borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
    boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
  };

  return (
    <div
      className="flex flex-col relative page-bg"
      style={{ minHeight: "calc(100dvh - var(--obn-header-h))" }}
    >
      <main
        className="flex flex-col items-center px-4"
        style={
          !isMobileBrowser && !isInMiniApp
            ? { transform: "scale(1.25)", transformOrigin: "top center", paddingTop: "32px", paddingBottom: "16px" }
            : { paddingTop: "18px", paddingBottom: "16px" }
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin" style={{ color: "#16a34a" }} />
          </div>
        ) : isNonprofit && nonprofitPool ? (
          /* Nonprofit View */
          <div className="w-full max-w-150 space-y-4">
            <h1 className="text-2xl font-bold text-center" style={{ color: "var(--card-text)" }}>
              {nonprofitPool.name}
            </h1>

            {/* Nonprofit's own contributions to other nonprofits */}
            {contributions.length > 0 && (
              <>
                {/* Summary Card */}
                <div className="mt-4 rounded-xl border p-4 sm:max-w-md sm:mx-auto" style={{ ...cardStyle, backgroundColor: "var(--page-bg-to)" }}>
                  {/* NFT + Core Stats */}
                  <div className="flex items-center gap-2">
                    {/* NFT */}
                    <div className="flex-1 flex flex-col items-center">
                      {OLIVE_NFT ? (
                        ownsOlive && (currentAddress || isInMiniApp) ? (
                          (() => {
                            const o = owned[0];
                            if (!nftLoading && !clockLoading && o?.img) {
                              return (
                                <NFTWithTimedEffects
                                  src={o.img}
                                  effect={effect}
                                  width={100}
                                  height={100}
                                  oliveId={o.id.toString()}
                                  progressPct={progressPct}
                                  rainbowStyle={rainbowStyle}
                                />
                              );
                            }
                            if (nftLoading || clockLoading) {
                              return (
                                <div className="w-25 h-25 grid place-items-center">
                                  <Loader className="w-6 h-6 animate-spin" style={{ color: "#16a34a" }} />
                                </div>
                              );
                            }
                            return (
                              <div className="w-25 h-25 grid place-items-center border-2 border-transparent bg-transparent opacity-0" />
                            );
                          })()
                        ) : (
                          <div className="flex flex-col items-center">
                            <p className="font-semibold text-xs mb-1.5" style={{ color: "var(--card-text)" }}>
                              Olive ?
                            </p>
                            <div
                              className="w-20 h-20 rounded-md border overflow-hidden"
                              style={{
                                backgroundColor: "var(--card-bg)",
                                borderColor: "var(--card-badge-ring)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {shouldShowEgg && (
                                <img
                                  key={eggBust}
                                  src={`/egg_hatching.webp?v=${eggBust}`}
                                  alt="Egg hatching animation"
                                  loading="eager"
                                  decoding="async"
                                  onError={() => bumpEgg()}
                                  style={{
                                    width: "120%",
                                    height: "120%",
                                    objectFit: "cover",
                                    objectPosition: "center center",
                                  }}
                                />
                              )}
                            </div>
                            <button
                              disabled={mintingNft || !saleOn}
                              onClick={onMintOlive}
                              className="px-2 py-1 rounded text-[min(2.5vw,0.625rem)] font-semibold border transition mt-1.5 whitespace-nowrap"
                              style={{
                                borderColor: theme === "dark" ? "#86efac" : "#0D9921",
                                color: theme === "dark" ? "#86efac" : "#0D9921",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme === "dark" ? "#86efac" : "#0D9921";
                                (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                                (e.currentTarget as HTMLButtonElement).style.color = theme === "dark" ? "#86efac" : "#0D9921";
                              }}
                              title={saleOn ? "Mint your Olive" : "Sale is not active"}
                            >
                              {mintingNft ? "Minting…" : `Mint (${mintPriceEth} ETH)`}
                            </button>
                            {!saleOn && (
                              <p className="text-[10px] mt-1" style={{ color: "var(--card-subtext)" }}>
                                Sale not active
                              </p>
                            )}
                          </div>
                        )
                      ) : (
                        <p className="text-[11px]" style={{ color: "var(--card-subtext)" }}>
                          NFT not available
                        </p>
                      )}
                    </div>

                    {/* Stats wrapper - title centered over both columns */}
                    <div className="flex-2 flex flex-col">
                      <p className="text-sm font-semibold text-center mb-4" style={{ color: "var(--card-subtext)" }}>OBN Impact Card</p>
                      <div className="flex gap-2">
                        <div className="flex-1 text-center">
                          <div className="mb-3">
                            <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Balance</p>
                            <p className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(obnBalance).replace(/\u00A0/g, '')} OBN</p>
                          </div>
                          <div>
                            <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Total Earned</p>
                            <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#60a5fa" : "#2563eb", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalClaimed).replace(/\u00A0/g, '')} OBN</p>
                          </div>
                        </div>
                        <div className="flex-1 text-center">
                          <div className="mb-3">
                            <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Total Active Stake</p>
                            <p className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(Number.parseFloat(formatUnits(totalStaked, 18))).replace(/\u00A0/g, '')} OBN</p>
                          </div>
                          <div>
                            <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Total Contributed</p>
                            <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#86efac" : "#16a34a", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalCharityContributed).replace(/\u00A0/g, '')} OBN</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pending section */}
                  <div className="flex items-center gap-2 mt-3.5 pt-3.5" style={{ borderTop: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}` }}>
                    <div className="flex-1 text-center">
                      <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Pending Rewards</p>
                      <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#60a5fa" : "#2563eb", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalPendingRewards).replace(/\u00A0/g, '')} OBN</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Pending Contribution</p>
                      <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#86efac" : "#16a34a", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalPendingContribution).replace(/\u00A0/g, '')} OBN</p>
                    </div>
                    {totalPendingRewards > 0.0001 && (
                      <button
                        disabled={claimingAll || claimingPid !== null}
                        onClick={handleClaimAll}
                        className="px-3 py-1.5 rounded-lg font-semibold border transition text-xs shrink-0"
                        style={{
                          borderColor: "#2563eb",
                          color: "#2563eb",
                          opacity: claimingAll || claimingPid !== null ? 0.6 : 1,
                          cursor: claimingAll || claimingPid !== null ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!(claimingAll || claimingPid !== null)) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
                            (e.currentTarget as HTMLButtonElement).style.color = "white";
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
                        }}
                      >
                        {claimingAll ? "Claiming..." : "Claim All"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Total Received Card */}
            <div className="rounded-xl border p-5" style={cardStyle}>
              <p className="text-xs font-medium mb-2 text-center" style={{ color: "var(--card-subtext)" }}>
                Total Received from User Contributions
              </p>
              <p className="text-3xl font-bold text-center" style={{ color: theme === "dark" ? "#86efac" : "#16a34a" }}>
                {formatNumber(nonprofitPoolStats?.totalCharityReceived ?? 0)} OBN
              </p>
              <p className="text-xs mt-2 text-center" style={{ color: "var(--card-subtext)" }}>
                All-time earnings from staker rewards
              </p>
            </div>

            {/* Pool Stats Card */}
            <div className="rounded-xl border p-5" style={cardStyle}>
              <h2
                className="text-lg font-bold mb-4 text-center"
                style={{ color: "var(--card-text)" }}
              >
                Pool Statistics
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: theme === "dark" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--card-subtext)" }}>
                    Active Stakers
                  </p>
                  <p className="text-base font-bold" style={{ color: "var(--card-text)" }}>
                    {nonprofitPoolStats?.uniqueStakers ?? "—"}
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: theme === "dark" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--card-subtext)" }}>
                    Total Active Stake
                  </p>
                  <p className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--card-text)" }}>
                    {formatNumber(nonprofitPoolStats?.totalStaked ?? 0)} OBN
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: theme === "dark" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--card-subtext)" }}>
                    Pending Rewards
                  </p>
                  <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#60a5fa" : "#2563eb" }}>
                    {formatNumber(nonprofitPoolStats?.pendingRewards ?? 0)} OBN
                  </p>
                </div>
              </div>

              {/* Claim Button for Nonprofit */}
              <div className="mt-5 flex justify-center">
                <button
                  disabled={
                    claimingPid !== null ||
                    !nonprofitPoolStats ||
                    nonprofitPoolStats.pendingRewards < 0.001
                  }
                  onClick={handleNonprofitClaim}
                  className="px-6 py-2.5 rounded-lg font-semibold text-sm transition"
                  style={{
                    backgroundColor:
                      nonprofitPoolStats && nonprofitPoolStats.pendingRewards >= 0.001
                        ? "#2563eb"
                        : "transparent",
                    color:
                      nonprofitPoolStats && nonprofitPoolStats.pendingRewards >= 0.001
                        ? "white"
                        : "var(--card-subtext)",
                    borderWidth:
                      nonprofitPoolStats && nonprofitPoolStats.pendingRewards >= 0.001 ? 0 : 1,
                    borderColor: "var(--card-border)",
                    opacity:
                      nonprofitPoolStats && nonprofitPoolStats.pendingRewards >= 0.001 ? 1 : 0.5,
                    cursor:
                      nonprofitPoolStats && nonprofitPoolStats.pendingRewards >= 0.001
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {claimingPid === nonprofitPool.pid ? "Claiming..." : "Claim Rewards"}
                </button>
              </div>
            </div>

            {/* Active Contributions */}
            {contributions.length > 0 && activeContributions.length > 0 && (
              <div>
                <h2
                  className="text-sm font-semibold mb-2 px-1"
                  style={{ color: "var(--card-text)" }}
                >
                  Active ({activeContributions.length})
                </h2>
                <div className="space-y-2">
                  {activeContributions.map((contrib) => (
                    <ContributionRow
                      key={contrib.pid}
                      contribution={contrib}
                      theme={theme}
                      cardStyle={cardStyle}
                      formatUniform={formatUniform}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive Contributions */}
            {contributions.length > 0 && inactiveContributions.length > 0 && (
              <div>
                <h2
                  className="text-sm font-semibold mb-2 px-1"
                  style={{ color: "var(--card-subtext)" }}
                >
                  Inactive ({inactiveContributions.length})
                </h2>
                <div className="space-y-2">
                  {inactiveContributions.map((contrib) => (
                    <ContributionRow
                      key={contrib.pid}
                      contribution={contrib}
                      theme={theme}
                      cardStyle={cardStyle}
                      formatUniform={formatUniform}
                      inactive
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Regular User View */
          <div className="w-full max-w-150 space-y-4">
            {/* Summary Card */}
            <div className="mt-4 rounded-xl border p-4 sm:max-w-md sm:mx-auto" style={{ ...cardStyle, backgroundColor: "var(--page-bg-to)" }}>
              {/* NFT + Core Stats */}
              <div className="flex items-center gap-2">
                {/* NFT */}
                <div className="flex-1 flex flex-col items-center">
                  {OLIVE_NFT ? (
                    ownsOlive && (currentAddress || isInMiniApp) ? (
                      (() => {
                        const o = owned[0];
                        if (!nftLoading && o?.img) {
                          return (
                            <NFTWithTimedEffects
                              src={o.img}
                              effect={effect}
                              width={100}
                              height={100}
                              oliveId={o.id.toString()}
                              progressPct={progressPct}
                              rainbowStyle={rainbowStyle}
                            />
                          );
                        }
                        if (nftLoading) {
                          return (
                            <div className="w-25 h-25 grid place-items-center">
                              <Loader className="w-6 h-6 animate-spin" style={{ color: "#16a34a" }} />
                            </div>
                          );
                        }
                        return (
                          <img src="/logo.png" alt="Olive NFT" className="w-25 h-25 rounded-full opacity-80" />
                        );
                      })()
                    ) : (
                      <div className="flex flex-col items-center">
                        <p className="font-semibold text-xs mb-1.5" style={{ color: "var(--card-text)" }}>
                          Olive ?
                        </p>
                        <div
                          className="w-20 h-20 rounded-md border overflow-hidden"
                          style={{
                            backgroundColor: "var(--card-bg)",
                            borderColor: "var(--card-badge-ring)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {shouldShowEgg && (
                            <img
                              key={eggBust}
                              src={`/egg_hatching.webp?v=${eggBust}`}
                              alt="Egg hatching animation"
                              loading="eager"
                              decoding="async"
                              onError={() => bumpEgg()}
                              style={{
                                width: "120%",
                                height: "120%",
                                objectFit: "cover",
                                objectPosition: "center center",
                              }}
                            />
                          )}
                        </div>
                        <button
                          disabled={mintingNft || !saleOn}
                          onClick={onMintOlive}
                          className="px-2 py-1 rounded text-[min(2.5vw,0.625rem)] font-semibold border transition mt-1.5 whitespace-nowrap"
                          style={{
                            borderColor: theme === "dark" ? "#86efac" : "#0D9921",
                            color: theme === "dark" ? "#86efac" : "#0D9921",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme === "dark" ? "#86efac" : "#0D9921";
                            (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                            (e.currentTarget as HTMLButtonElement).style.color = theme === "dark" ? "#86efac" : "#0D9921";
                          }}
                          title={saleOn ? "Mint your Olive" : "Sale is not active"}
                        >
                          {mintingNft ? "Minting…" : `Mint (${mintPriceEth} ETH)`}
                        </button>
                        {!saleOn && (
                          <p className="text-[10px] mt-1" style={{ color: "var(--card-subtext)" }}>
                            Sale not active
                          </p>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="text-[11px]" style={{ color: "var(--card-subtext)" }}>
                      NFT not available
                    </p>
                  )}
                </div>

                {/* Stats wrapper - title centered over both columns */}
                <div className="flex-2 flex flex-col">
                  <p className="text-sm font-semibold text-center mb-4" style={{ color: "var(--card-subtext)" }}>OBN Impact Card</p>
                  <div className="flex gap-2">
                    <div className="flex-1 text-center">
                      <div className="mb-3">
                        <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Balance</p>
                        <p className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(obnBalance).replace(/\u00A0/g, '')} OBN</p>
                      </div>
                      <div>
                        <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Total Earned</p>
                        <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#60a5fa" : "#2563eb", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalClaimed).replace(/\u00A0/g, '')} OBN</p>
                      </div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="mb-3">
                        <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Total Active Stake</p>
                        <p className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(Number.parseFloat(formatUnits(totalStaked, 18))).replace(/\u00A0/g, '')} OBN</p>
                      </div>
                      <div>
                        <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Total Contributed</p>
                        <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#86efac" : "#16a34a", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalCharityContributed).replace(/\u00A0/g, '')} OBN</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending section */}
              <div className="flex items-center gap-2 mt-3.5 pt-3.5" style={{ borderTop: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}` }}>
                <div className="flex-1 text-center">
                  <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Pending Rewards</p>
                  <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#60a5fa" : "#2563eb", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalPendingRewards).replace(/\u00A0/g, '')} OBN</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[min(2.6vw,0.625rem)] font-medium mb-0.5 whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>Pending Contribution</p>
                  <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme === "dark" ? "#86efac" : "#16a34a", fontVariantNumeric: "tabular-nums", fontSize: "min(3.4vw, 0.875rem)" }}>{formatUniform(totalPendingContribution).replace(/\u00A0/g, '')} OBN</p>
                </div>
                {totalPendingRewards > 0.0001 && (
                  <button
                    disabled={claimingAll || claimingPid !== null}
                    onClick={handleClaimAll}
                    className="px-3 py-1.5 rounded-lg font-semibold border transition text-xs shrink-0"
                    style={{
                      borderColor: "#2563eb",
                      color: "#2563eb",
                      opacity: claimingAll || claimingPid !== null ? 0.6 : 1,
                      cursor: claimingAll || claimingPid !== null ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!(claimingAll || claimingPid !== null)) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
                        (e.currentTarget as HTMLButtonElement).style.color = "white";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
                    }}
                  >
                    {claimingAll ? "Claiming..." : "Claim All"}
                  </button>
                )}
              </div>
            </div>

            {/* No history CTA */}
            {!hasAnyHistory && (contributions.length > 0 || !currentAddress) && (
              <div className="flex gap-3 py-6">
                {/* Left: Start Staking */}
                <div className="flex-1 flex flex-col items-center gap-3 text-center rounded-xl border p-4" style={{ borderColor: "var(--card-border)" }}>
                  <p className="text-sm whitespace-nowrap" style={{ color: "var(--card-subtext)", fontSize: "min(3.6vw, 0.875rem)" }}>
                    No staking history.
                  </p>
                  <Link
                    href="/stake-earn-contribute"
                    className="w-full mt-auto py-2 rounded-xl font-semibold text-center whitespace-nowrap border transition"
                    style={{ backgroundColor: "#16a34a", borderColor: "#16a34a", color: "#ffffff", textDecoration: "none", fontSize: "min(3.6vw, 0.875rem)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#16a34a";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#16a34a";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#ffffff";
                    }}
                  >
                    Start Staking
                  </Link>
                </div>
                {/* Right: Trade */}
                <div className="flex-1 flex flex-col items-center gap-3 text-center rounded-xl border p-4" style={{ borderColor: "var(--card-border)" }}>
                  <p className="text-sm whitespace-nowrap" style={{ color: "var(--card-subtext)", fontSize: "min(3.6vw, 0.875rem)" }}>
                    Don&apos;t have OBN?
                  </p>
                  <Link
                    href="/trade"
                    className="w-full mt-auto py-2 rounded-xl font-semibold text-center whitespace-nowrap border transition"
                    style={{ backgroundColor: "#2563eb", borderColor: "#2563eb", color: "#ffffff", textDecoration: "none", fontSize: "min(3.6vw, 0.875rem)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#2563eb";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#2563eb";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#ffffff";
                    }}
                  >
                    Buy OBN
                  </Link>
                </div>
              </div>
            )}

            {/* Active Contributions */}
            {activeContributions.length > 0 && (
              <div className="mt-px">
                <h2
                  className="text-sm font-semibold mb-2 px-1"
                  style={{ color: "var(--card-text)" }}
                >
                  Active ({activeContributions.length})
                </h2>
                <div className="space-y-2">
                  {activeContributions.map((contrib) => (
                    <ContributionRow
                      key={contrib.pid}
                      contribution={contrib}
                      theme={theme}
                      cardStyle={cardStyle}
                      formatUniform={formatUniform}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive Contributions */}
            {inactiveContributions.length > 0 && (
              <div>
                <h2
                  className="text-sm font-semibold mb-2 px-1"
                  style={{ color: "var(--card-subtext)" }}
                >
                  Inactive ({inactiveContributions.length})
                </h2>
                <div className="space-y-2">
                  {inactiveContributions.map((contrib) => (
                    <ContributionRow
                      key={contrib.pid}
                      contribution={contrib}
                      theme={theme}
                      cardStyle={cardStyle}
                      formatUniform={formatUniform}
                      inactive
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer
          className="main-content mt-1 py-2 px-1 text-center text-[9px] italic"
          style={{ color: "var(--card-subtext)" }}
        >
          Olive Branch Network is a decentralized application and does not have any direct
          affiliation with any of the organizations displayed.
        </footer>
      </main>
    </div>
  );
}

function ContributionRow({
  contribution,
  theme,
  cardStyle,
  formatUniform,
  inactive = false,
}: {
  contribution: PoolContribution;
  theme: "light" | "dark";
  cardStyle: React.CSSProperties;
  formatUniform: (num: number, targetLength?: number) => string;
  inactive?: boolean;
}) {
  const router = useRouter();
  const hasPending = contribution.pending > 0.0001;

  const handleCardClick = () => {
    router.push(`/stake-earn-contribute/${contribution.pid}`);
  };

  return (
    <div
      className="rounded-xl border p-3 cursor-pointer hover:opacity-90 transition-opacity"
      style={{
        ...cardStyle,
        opacity: inactive ? 0.7 : 1,
      }}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Logo and Name */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <Image
            src={contribution.logo}
            alt={contribution.name}
            width={24}
            height={24}
            className="rounded-full shrink-0"
          />
          <span
            className="font-semibold text-xs truncate"
            style={{ color: "var(--card-text)" }}
          >
            {contribution.name}
          </span>
        </div>

        {/* Stats - fixed width columns for uniform alignment */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="text-center" style={{ width: "68px" }}>
            <p className="text-[9px] font-medium whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>
              Active Stake
            </p>
            <p className="text-xs font-bold" style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums" }}>
              {formatUniform(contribution.staked).replace(/\u00A0/g, '')}
            </p>
          </div>
          <div className="text-center" style={{ width: "68px" }}>
            <p className="text-[9px] font-medium whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>
              Contributed
            </p>
            <p className="text-xs font-bold" style={{ color: theme === "dark" ? "#86efac" : "#16a34a", fontVariantNumeric: "tabular-nums" }}>
              {formatUniform(contribution.charityContributed).replace(/\u00A0/g, '')}
            </p>
          </div>
          <div className="text-center" style={{ width: "68px" }}>
            <p className="text-[9px] font-medium whitespace-nowrap" style={{ color: "var(--card-subtext)" }}>
              Pending
            </p>
            <p className="text-xs font-bold" style={{ color: hasPending ? (theme === "dark" ? "#60a5fa" : "#2563eb") : "var(--card-text)", fontVariantNumeric: "tabular-nums" }}>
              {formatUniform(contribution.pending).replace(/\u00A0/g, '')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
