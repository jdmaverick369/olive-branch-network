// src/app/dashboard/[poolId]/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useBalance,
  usePublicClient,
} from "wagmi";
import { parseUnits, formatUnits, erc20Abi } from "viem";
import { stakingAbi } from "@/lib/stakingAbi";
import { oliveAbi } from "@/lib/oliveAbi";
import { ShareToFarcaster } from "@/components/ShareToFarcaster";
import { getPoolMeta, type PoolMeta } from "@/lib/pools";

/* ✅ Effects imports */
import { NFTWithTimedEffects } from "@/components/NFTWithTimedEffects";
import { effectFromAccumulated } from "@/components/effectsMap";
import { useTotalStakedAcrossPools } from "@/hooks/useTotalStakedAcrossPools";
import { useStakingClock } from "@/hooks/useStakingClock";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const OLIVE_NFT = process.env.NEXT_PUBLIC_OLIVE_NFT as `0x${string}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

const fmt = (n: number, d = 4) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

const ipfsToHttp = (u: string) =>
  u?.startsWith("ipfs://")
    ? `https://gateway.lighthouse.storage/ipfs/${u.slice(7)}`
    : u;

// Normalize bad metadata paths like ipfs://<cid>/images/olive1.png -> ipfs://<cid>/olive1.png
const normalizeOliveImageIpfs = (u: string) =>
  typeof u === "string" ? u.replace(/^ipfs:\/\/([^/]+)\/images\//i, "ipfs://$1/") : u;

type OwnedOlive = { id: bigint; uri?: string; img?: string | null };

export default function PoolDetailPage() {
  const { poolId } = useParams() as { poolId?: string };
  const pid = Number(poolId);
  const router = useRouter();
  const search = useSearchParams();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const userAddr = (address ?? ZERO_ADDR) as `0x${string}`;

  const meta: PoolMeta | undefined = Number.isFinite(pid) ? getPoolMeta(pid) : undefined;
  const invalid = !Number.isFinite(pid) || !meta;

  const title = meta?.name ?? `Pool #${Number.isFinite(pid) ? pid : "?"}`;
  const logo = meta?.logo ?? "/charity1.png";
  const detailDescription = meta?.detailDescription ?? meta?.listDescription ?? "";

  const urls = useMemo(() => {
    const list = [meta?.websiteUrl, meta?.twitterUrl].filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
    return Array.from(new Set(list));
  }, [meta?.websiteUrl, meta?.twitterUrl]);

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const [userStake, setUserStake] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);
  const [obnBalance, setObnBalance] = useState(0);

  // --- Staking reads ---
  const effectivePid = useMemo(() => (Number.isFinite(pid) ? BigInt(pid) : 0n), [pid]);

  const { data: obnBal, refetch: refetchObn } = useBalance({
    address: userAddr,
    token: OBN_TOKEN_ADDRESS,
  });

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
    functionName: "getUserStakeValue",
    args: [effectivePid, userAddr],
    query: { enabled: !invalid && address != null },
  });

  const { data: pendingRewardsData, refetch: refetchPendingRewards } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "pendingRewards",
    args: [effectivePid, userAddr],
    query: { enabled: !invalid && address != null },
  });

  useEffect(() => {
    if (typeof userStakeData !== "undefined") {
      setUserStake(Number.parseFloat(formatUnits(userStakeData as bigint, 18)));
    }
    if (typeof pendingRewardsData !== "undefined") {
      setPendingRewards(Number.parseFloat(formatUnits(pendingRewardsData as bigint, 18)));
    }
  }, [userStakeData, pendingRewardsData]);

  useEffect(() => {
    if (obnBal) setObnBalance(Number.parseFloat(formatUnits(obnBal.value, obnBal.decimals)));
  }, [obnBal]);

  // --- Olive NFT reads ---
  const oliveEnabled = !!address && !!OLIVE_NFT;

  const { data: saleActive } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "saleActive",
    query: { enabled: !!OLIVE_NFT },
  });

  const { data: mintPriceBN } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "MINT_PRICE",
    query: { enabled: !!OLIVE_NFT },
  });

  const {
    data: oliveBalBN,
    refetch: refetchOliveBal,
  } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "balanceOf",
    args: [userAddr],
    query: { enabled: oliveEnabled },
  });

  const ownsOlive = (oliveBalBN ?? 0n) > 0n;

  const [owned, setOwned] = useState<OwnedOlive[]>([]);

  // Load ALL tokens owned by the wallet (ids -> uris -> images)
  useEffect(() => {
    let stopped = false;

    async function loadOwned() {
      if (!oliveEnabled || !publicClient) {
        if (!stopped) setOwned([]);
        return;
      }
      const count = Number(oliveBalBN ?? 0n);
      if (count === 0) {
        if (!stopped) setOwned([]);
        return;
      }

      try {
        // token IDs
        const ids: bigint[] = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            publicClient.readContract({
              address: OLIVE_NFT,
              abi: oliveAbi,
              functionName: "tokenOfOwnerByIndex",
              args: [userAddr, BigInt(i)],
            }) as Promise<bigint>
          )
        );

        // tokenURIs
        const uris: string[] = await Promise.all(
          ids.map((id) =>
            publicClient.readContract({
              address: OLIVE_NFT,
              abi: oliveAbi,
              functionName: "tokenURI",
              args: [id],
            }) as Promise<string>
          )
        );

        // images
        const imgs: (string | null)[] = await Promise.all(
          uris.map(async (uri) => {
            try {
              const meta = await fetch(ipfsToHttp(uri), { cache: "no-store" }).then((r) =>
                r.json()
              );
              const raw: string = meta?.image ?? meta?.properties?.files?.[0]?.uri ?? "";
              const fixed = normalizeOliveImageIpfs(raw);
              return ipfsToHttp(fixed);
            } catch {
              return null;
            }
          })
        );

        if (!stopped) {
          const merged = ids.map((id, i) => ({ id, uri: uris[i], img: imgs[i] }));
          setOwned(merged);
        }
      } catch {
        if (!stopped) setOwned([]);
      }
    }

    loadOwned();
    return () => {
      stopped = true;
    };
  }, [oliveEnabled, oliveBalBN, userAddr, publicClient]);

  // periodic refresh
  useEffect(() => {
    if (invalid) return;
    const id = setInterval(() => {
      refetchPool();
      refetchUserStake();
      refetchPendingRewards();
      refetchObn();
      refetchOliveBal?.();
    }, 5000);
    return () => clearInterval(id);
  }, [invalid, refetchPool, refetchUserStake, refetchPendingRewards, refetchObn, refetchOliveBal]);

  const postTxnRefresh = async () => {
    await Promise.all([
      refetchPool(),
      refetchUserStake(),
      refetchPendingRewards(),
      refetchObn(),
      refetchOliveBal?.(),
    ]);
  };

  const { writeContractAsync } = useWriteContract();

  const handleStake = async () => {
    if (!Number.isFinite(pid)) return;
    if (!amount || isNaN(Number(amount))) return;
    setLoading(true);
    try {
      const amt = parseUnits(amount, 18);
      await writeContractAsync({
        address: OBN_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [STAKING_CONTRACT, amt],
      });
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "deposit",
        args: [effectivePid, amt],
      });
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnstake = async () => {
    if (!Number.isFinite(pid)) return;
    if (!amount || isNaN(Number(amount))) return;
    setLoading(true);
    try {
      const amt = parseUnits(amount, 18);
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "withdraw",
        args: [effectivePid, amt],
      });
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!Number.isFinite(pid)) return;
    setLoading(true);
    try {
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "claim",
        args: [effectivePid],
      });
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const onMintOlive = async () => {
    if (!OLIVE_NFT) return;
    setLoading(true);
    try {
      const price = (mintPriceBN as bigint) ?? parseUnits("0.005", 18);
      await writeContractAsync({
        address: OLIVE_NFT,
        abi: oliveAbi,
        functionName: "mint",
        value: price,
      });
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => router.push("/dashboard");

  // UI helpers
  const saleOn = Boolean(saleActive);
  const mintPriceEth = mintPriceBN ? Number(formatUnits(mintPriceBN as bigint, 18)) : 0.005;

  /* ============================= */
  /* ✅ Effects state */
  /* ============================= */
  const { totalStaked } = useTotalStakedAcrossPools({
    stakingAddress: STAKING_CONTRACT,
    stakingAbi,
    getUserInfoName: "getUserStakeValue",
    pollMs: 10_000,
  });

  // Fallback to this pool’s stake if cross-pool sum is zero
  const totalStakedEffective =
    totalStaked > 0n ? totalStaked : ((userStakeData as bigint | undefined) ?? 0n);

  // Treat wallet as "equipped" if balanceOf > 0 (works even without ERC721Enumerable)
  const equippedTokenId = ownsOlive ? "owned" : "0";
  const isEquipped = ownsOlive;

  // Clock runs only while (isEquipped && totalStakedEffective > 0)
  const { accumulatedSec } = useStakingClock({
    tokenId: equippedTokenId,
    isEquipped,
    totalStaked: totalStakedEffective,
    tickMs: 1000,
  });

  // Force effect via ?effect=none|gloss|goldGloss|rainbowGloss
  const forced = (search?.get("effect") ?? "") as
    | "none"
    | "gloss"
    | "goldGloss"
    | "rainbowGloss"
    | "";
  const computedEffect = effectFromAccumulated(accumulatedSec);
  const effect =
    forced === "none" || forced === "gloss" || forced === "goldGloss" || forced === "rainbowGloss"
      ? forced
      : computedEffect;

  // =============================
  // Progress bar (0–90 days)
  // =============================
  const DAY = 60 * 60 * 24;
  const PROGRESS_MAX_SEC = 90 * DAY;
  const progressPct = Math.max(0, Math.min(100, (accumulatedSec / PROGRESS_MAX_SEC) * 100));

  // styles for the rainbow star
  const rainbowStyle: React.CSSProperties = {
    background: "linear-gradient(90deg, #ff0059, #ff9f00, #ffee00, #5fff00, #00c6ff, #7a00ff)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex flex-col">
      <main className="flex-1 px-4 py-7 flex flex-col items-center">
        {invalid ? (
          <section className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold mb-2">Pool not found</h2>
            <p className="text-sm text-gray-600 mb-4">
              The pool you’re looking for doesn’t exist or isn’t configured yet.
            </p>
            <button
              onClick={handleBackToDashboard}
              className="px-5 py-2.5 rounded-lg font-semibold border border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white transition text-sm"
            >
              Back to Dashboard
            </button>
          </section>
        ) : (
          <>
            {/* Narrower on desktop */}
            <section className="bg-white rounded-xl shadow-lg p-5 w-full max-w-xl mb-5">
              <h2 className="text-xl font-bold mb-3 text-center">{title}</h2>

              <div className="flex flex-col items-center mb-4">
                <Image
                  src={logo}
                  alt={`${title} logo`}
                  width={84}
                  height={84}
                  className="mb-1.5"
                  priority
                />
                {meta?.ethereumAddress && (
                  <p className="text-xs font-mono text-gray-500 break-all mb-1.5">
                    {meta.ethereumAddress}
                  </p>
                )}
                {detailDescription && (
                  <p className="text-gray-700 text-center text-xs leading-relaxed whitespace-pre-line">
                    {detailDescription}
                  </p>
                )}
                {urls.length > 0 && (
                  <div className="mt-2 flex flex-col items-center gap-1">
                    {urls.map((u) => (
                      <Link
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 text-xs underline break-all"
                      >
                        {u}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Olive column (left) + balances column (right) */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
                {/* LEFT: Your Olive (centered) */}
                <div className="bg-gray-50 rounded-lg p-3 shadow-sm flex flex-col items-center text-center">
                  <p className="text-gray-700 font-semibold text-sm mb-2">Your Olive</p>

                  {address && OLIVE_NFT ? (
                    ownsOlive ? (
                      (() => {
                        const o = owned[0];
                        return (
                          <div className="w-full flex flex-col items-center">
                            {o?.img ? (
                              <div className="w-[200px] h-[200px] rounded-md bg-white shadow grid place-items-center">
                                {/* ✅ Effects overlapping the NFT */}
                                <NFTWithTimedEffects
                                  src={o.img}
                                  effect={effect}
                                  rounded="rounded-md"
                                  width={200}
                                  height={200}
                                />
                              </div>
                            ) : (
                              // Fallback box so overlays still appear even without metadata image
                              <div className="relative w-[200px] h-[200px] rounded-md bg-gradient-to-br from-green-200 to-green-50 shadow grid place-items-center text-xs text-gray-600">
                                <span>Olive Equipped</span>
                                <div className="absolute inset-0 rounded-md overflow-hidden">
                                  {/* Overlay container to show effects even without an image */}
                                  <NFTWithTimedEffects
                                    src="/placeholder.png"
                                    effect={effect}
                                    rounded="rounded-md"
                                    width={200}
                                    height={200}
                                  />
                                </div>
                              </div>
                            )}
                            {o?.id && (
                              <p className="text-[11px] text-gray-500 mt-2 break-all">
                                Token #{o.id.toString()}
                              </p>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex flex-col items-center">
                        <p className="text-xs text-gray-600 mb-2">You don’t own an Olive yet.</p>
                        <button
                          disabled={loading || !saleOn}
                          onClick={onMintOlive}
                          className="px-4 py-2 rounded-lg font-semibold border border-green-700 text-green-700 hover:bg-green-700 hover:text-white disabled:opacity-50 transition text-sm"
                          title={saleOn ? "Mint your Olive" : "Sale is not active"}
                        >
                          {loading ? "Minting…" : `Mint Olive (${mintPriceEth} ETH)`}
                        </button>
                        {!saleOn && (
                          <p className="text-[11px] text-gray-500 mt-2">Sale not active</p>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-gray-600">Connect wallet to mint or view.</p>
                  )}
                </div>

                {/* RIGHT: balances */}
                <div className="space-y-4">
                  {/* Progress (stars + bar) */}
                  <div className="bg-gray-50 rounded-lg p-3 shadow-sm">
                    <div className="relative mb-1">
                      {/* Bar track */}
                      <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                        {/* Filled portion */}
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${progressPct}%` }}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(progressPct)}
                          role="progressbar"
                        />
                      </div>

                      {/* Star markers above the bar */}
                      <div className="relative">
                        {/* 30d — silver star */}
                        <span
                          className="absolute -top-4 -translate-x-1/2 text-sm select-none"
                          style={{ left: "33.333%" }}
                          title="30 days"
                          aria-hidden
                        >
                          <span style={{ color: "#C0C0C0" }}>★</span>
                        </span>
                        {/* 60d — gold star */}
                        <span
                          className="absolute -top-4 -translate-x-1/2 text-sm select-none"
                          style={{ left: "66.666%" }}
                          title="60 days"
                          aria-hidden
                        >
                          <span style={{ color: "#DAA520" }}>★</span>
                        </span>
                        {/* 90d — rainbow star */}
                        <span
                          className="absolute -top-4 -translate-x-1/2 text-sm select-none"
                          style={{ left: "100%" }}
                          title="90 days"
                          aria-hidden
                        >
                          <span style={rainbowStyle}>★</span>
                        </span>
                      </div>
                    </div>

                    {/* Label below bar */}
                    <p className="text-center text-xs text-gray-600 mt-1">Experience</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 shadow-sm text-center">
                    <p className="text-gray-600 font-medium text-xs">Staked:</p>
                    <p className="font-semibold text-sm mb-1.5">{fmt(userStake)} OBN</p>
                    <p className="text-gray-600 font-medium text-xs">Pending Rewards:</p>
                    <p className="font-semibold text-sm">{fmt(pendingRewards, 6)} OBN</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 shadow-sm text-center">
                    <p className="text-gray-600 font-medium text-xs">Balance:</p>
                    <p className="font-semibold text-sm mb-1.5">{fmt(obnBalance, 2)} OBN</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex flex-col items-center w-full max-w-md">
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter OBN amount"
                className="w-full border rounded-lg px-3.5 py-2.5 mb-3 text-center focus:ring-2 focus:ring-green-500 text-sm"
              />
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  disabled={loading}
                  onClick={handleStake}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-green-700 text-green-700 hover:bg-green-700 hover:text-white disabled:opacity-50 transition text-sm"
                >
                  {loading ? "Processing..." : "Stake"}
                </button>
                <button
                  disabled={loading}
                  onClick={handleUnstake}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-red-600 text-red-600 hover:bg-red-600 disabled:opacity-50 transition text-sm"
                >
                  {loading ? "Processing..." : "Unstake"}
                </button>
                <button
                  disabled={loading}
                  onClick={handleClaim}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-blue-600 text-blue-600 hover:bg-blue-600 disabled:opacity-50 transition text sm"
                >
                  {loading ? "Processing..." : "Claim"}
                </button>
              </div>
              <div className="mt-3">
                <ShareToFarcaster text={`I'm staking OBN in pool #${pid} 🌱 Join me:`} />
              </div>
              <button
                onClick={handleBackToDashboard}
                className="mt-4 px-6 py-2.5 rounded-lg font-semibold border border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white transition text-sm"
              >
                Back to Dashboard
              </button>
            </div>
          </>
        )}
      </main>
      <footer className="mt-auto py-4 text-center text-[11px] text-gray-500">
        Olive Branch Network is a decentralized protocol and does not have any direct
        affiliation with any of the organizations displayed.
      </footer>
    </div>
  );
}
