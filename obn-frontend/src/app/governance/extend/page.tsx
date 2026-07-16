"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits } from "viem";
import Link from "next/link";
import { ArrowLeft, ExternalLink, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { useGovernanceCycle, CycleState } from "@/hooks/useGovernanceCycle";
import { useDisplayedVotingPower } from "@/hooks/useDisplayedVotingPower";
import { governanceAbi } from "@/lib/governanceAbi";
import { ANNUAL_GOV_PROXY, EXTEND_OLIVE_BRANCH, OBN_TOKEN } from "@/lib/contracts";
import { POOLS } from "@/lib/pools";
import { DATA_SUFFIX } from "@/lib/builderCode";

const GOV_ADDRESS = ANNUAL_GOV_PROXY as `0x${string}`;
const OBN_TOKEN_ADDRESS = OBN_TOKEN as `0x${string}`;
// True for `npm run dev` and `npm run dev:mainnet` (both run `next dev`),
// false for the deployed production build — i.e. only reachable locally.
const DEV_MODE = process.env.NODE_ENV === "development";

const NONPROFIT_BY_ADDRESS = new Map(POOLS.map((p) => [p.ethereumAddress.toLowerCase(), p]));

const BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

function usePageBackground() {
  useEffect(() => {
    const orig = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "var(--page-bg-to)";
    return () => {
      document.body.style.backgroundColor = orig;
    };
  }, []);
}

function getTimeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    done: diff === 0,
  };
}

function useCountdown(target: Date | null) {
  // Always start null — calling Date.now() in the lazy initializer would run
  // once during SSR and again during client hydration at a different wall-clock
  // time, producing a mismatched seconds digit. The effect below is client-only.
  const [t, setT] = useState<ReturnType<typeof getTimeLeft> | null>(null);
  useEffect(() => {
    if (!target) {
      setT(null);
      return;
    }
    setT(getTimeLeft(target));
    const id = setInterval(() => setT(getTimeLeft(target)), 1_000);
    return () => clearInterval(id);
  }, [target?.getTime()]);
  return t;
}

function formatObn(raw: bigint | undefined, decimals = 2): string {
  if (raw === undefined) return "—";
  return Number(formatUnits(raw, 18)).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatObnCompact(raw: bigint): string {
  const n = Number(formatUnits(raw, 18));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()}k`;
  return n.toFixed(0);
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = ["th", "st", "nd", "rd"];
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]);
}

function CountdownDisplay({ target }: { target: Date }) {
  const t = useCountdown(target);
  if (!t) return null;
  if (t.done) return <span style={{ color: "var(--card-subtext)" }}>Closed</span>;
  const str =
    t.days > 0
      ? `${t.days}d ${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")}`
      : `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")}`;
  return (
    <span className="tabular-nums font-bold text-2xl" style={{ color: "var(--card-text)" }}>
      {str}
    </span>
  );
}

function SkeletonBlock({ h = "h-4", w = "w-full" }: { h?: string; w?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md ${h} ${w}`}
      style={{ backgroundColor: "var(--card-border)", opacity: 0.5 }}
    />
  );
}

function VoteBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      className="w-full h-2 rounded-full overflow-hidden"
      style={{ backgroundColor: "var(--card-border)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function getStoredVote(cycleId: string, voter: string): string | null {
  try {
    return localStorage.getItem(`gov_p2_vote_${cycleId}_${voter.toLowerCase()}`);
  } catch {
    return null;
  }
}

function storeVote(cycleId: string, voter: string, nonprofit: string) {
  try {
    localStorage.setItem(
      `gov_p2_vote_${cycleId}_${voter.toLowerCase()}`,
      nonprofit.toLowerCase()
    );
  } catch {
    /* ignore */
  }
}

export default function ExtendVotePage() {
  usePageBackground();
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const theme = useTheme();

  // Reachable only when running locally (dev) — bounce anyone hitting this
  // by direct URL on the deployed production build, regardless of wallet.
  useEffect(() => {
    if (!DEV_MODE) router.replace("/protocol-funds");
  }, [router]);

  // ── Chain data ────────────────────────────────────────────────────────────
  const {
    cycleId: effectiveCycleId,
    state: effectiveState,
    summary: effectiveSummary,
    isLoading: cycleLoading,
  } = useGovernanceCycle();

  const hasCycleEverStarted = effectiveCycleId !== undefined && effectiveCycleId > 0n;

  // ── Derived phase booleans ────────────────────────────────────────────────
  const isPhase1Stage =
    effectiveState === CycleState.PHASE1_OPEN || effectiveState === CycleState.PHASE1_READY;
  const isPhase2Open  = effectiveState === CycleState.PHASE2_OPEN;
  const isPhase2Ready = effectiveState === CycleState.PHASE2_READY;
  const isCompleted   = effectiveState === CycleState.COMPLETED;

  // Awaiting the next cycle: either the most recent one finished/was
  // cancelled, or none has ever run.
  const isPending =
    !hasCycleEverStarted ||
    effectiveState === CycleState.COMPLETED ||
    effectiveState === CycleState.CANCELLED;

  const phase2EndDate = effectiveSummary?.phase2End
    ? new Date(effectiveSummary.phase2End * 1000)
    : null;

  // ── Balance ───────────────────────────────────────────────────────────────
  const { data: extendBalance } = useReadContract({
    address: OBN_TOKEN_ADDRESS,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [EXTEND_OLIVE_BRANCH as `0x${string}`],
    query: { staleTime: 30_000, refetchInterval: 30_000 },
  });

  // ── Ballot ────────────────────────────────────────────────────────────────
  const { data: chainBallot, isLoading: ballotLoading } = useReadContract({
    address: GOV_ADDRESS,
    abi: governanceAbi,
    functionName: "getBallot",
    args: [effectiveCycleId!],
    query: { enabled: !!effectiveCycleId, staleTime: 60_000 },
  }) as { data: readonly `0x${string}`[] | undefined; isLoading: boolean };

  const effectiveBallot: readonly `0x${string}`[] = chainBallot ?? [];

  // ── Per-nonprofit vote counts (15s polling while phase 2 open) ───────────
  const voteContracts = useMemo(
    () =>
      effectiveBallot.map((addr) => ({
        address: GOV_ADDRESS,
        abi: governanceAbi,
        functionName: "getNonprofitVotes" as const,
        args: [effectiveCycleId!, addr] as const,
      })),
    [effectiveBallot, effectiveCycleId]
  );

  const { data: voteResults, isLoading: votesLoading, refetch: refetchVotes } = useReadContracts({
    contracts: voteContracts,
    query: {
      enabled: voteContracts.length > 0,
      staleTime: 10_000,
      // Poll every 15s while phase 2 is open; stop otherwise
      refetchInterval: isPhase2Open ? 15_000 : false,
    },
  });

  // ── Build per-nonprofit data (with ballot index for tiebreaking) ──────────
  const nonprofitItems = useMemo(() => {
    return effectiveBallot.map((addr, ballotIndex) => {
      const meta = NONPROFIT_BY_ADDRESS.get(addr.toLowerCase());
      const votes = (voteResults?.[ballotIndex]?.result as bigint | undefined) ?? 0n;
      return { address: addr, meta, votes, ballotIndex };
    });
  }, [effectiveBallot, voteResults]);

  const totalVotes = useMemo(
    () => nonprofitItems.reduce((acc, n) => acc + n.votes, 0n),
    [nonprofitItems]
  );

  // Sort by votes descending; tiebreak by original ballot index ascending
  const sortedItems = useMemo(
    () =>
      [...nonprofitItems].sort((a, b) => {
        if (b.votes !== a.votes) return b.votes > a.votes ? 1 : -1;
        return a.ballotIndex - b.ballotIndex;
      }),
    [nonprofitItems]
  );

  const hasAnyVotes = totalVotes > 0n;

  // Window-virtualize the ballot: every nonprofit stays reachable by
  // scrolling, but only rows near the viewport are ever actually mounted, so
  // render cost stays flat as the ballot grows toward the pool count.
  const ballotListRef = useRef<HTMLDivElement>(null);
  const ballotListOffsetRef = useRef(0);
  useLayoutEffect(() => {
    ballotListOffsetRef.current = ballotListRef.current?.offsetTop ?? 0;
  });
  const ballotVirtualizer = useWindowVirtualizer({
    count: sortedItems.length,
    estimateSize: () => 76, // ~28px logo row + p-3 padding + vote bar + gap-2
    overscan: 8,
    scrollMargin: ballotListOffsetRef.current,
  });

  // ── Voted status ──────────────────────────────────────────────────────────
  const { data: hasVoted, refetch: refetchHasVoted } = useReadContract({
    address: GOV_ADDRESS,
    abi: governanceAbi,
    functionName: "hasVotedPhase2",
    args: [effectiveCycleId!, address!],
    query: { enabled: !!(effectiveCycleId && address), staleTime: 20_000 },
  });

  const [selected, setSelected] = useState<`0x${string}` | null>(null);
  const [storedVoteAddr, setStoredVoteAddr] = useState<string | null>(null);

  useEffect(() => {
    if (effectiveCycleId && address) {
      setStoredVoteAddr(getStoredVote(effectiveCycleId.toString(), address));
    }
  }, [effectiveCycleId?.toString(), address]);

  // hasVoted=true but nothing in localStorage (e.g. voted from another
  // device) — recover the real choice from the event log instead of leaving
  // the UI stuck showing raw voting power.
  useEffect(() => {
    if (storedVoteAddr || !hasVoted || !effectiveCycleId || !address || !publicClient) return;
    publicClient
      .getContractEvents({
        address: GOV_ADDRESS,
        abi: governanceAbi,
        eventName: "NonprofitVoteCast",
        args: { cycleId: effectiveCycleId, voter: address },
        fromBlock: effectiveSummary ? BigInt(effectiveSummary.snapshotBlock) : 0n,
        toBlock: "latest",
      })
      .then((logs) => {
        const nonprofit = logs[0]?.args.nonprofit;
        if (!nonprofit) return;
        setStoredVoteAddr(nonprofit.toLowerCase());
        storeVote(effectiveCycleId.toString(), address, nonprofit);
      })
      .catch(() => {
        /* archive RPC may not support this range — leave as unresolved */
      });
  }, [storedVoteAddr, hasVoted, effectiveCycleId?.toString(), address, publicClient, effectiveSummary?.snapshotBlock]);

  // ── Voting power (re-fetched every 15s so bootstrap status updates live) ──
  const [vpTick, setVpTick] = useState(0);
  useEffect(() => {
    if (!address || !isPhase2Open) return;
    const id = setInterval(() => setVpTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [address, isPhase2Open]);

  const { votingPower, isLoading: vpLoading } = useDisplayedVotingPower(effectiveCycleId, vpTick);

  // ── Transaction ───────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: pendingTx ?? undefined,
  });

  useEffect(() => {
    if (confirmed) {
      toast.success("Vote cast!");
      toast.dismiss("extend-vote");
      setPendingTx(null);
      if (selected && effectiveCycleId && address) {
        storeVote(effectiveCycleId.toString(), address, selected);
        setStoredVoteAddr(selected.toLowerCase());
      }
      refetchHasVoted();
      refetchVotes();
    }
  }, [confirmed]);

  const needsActivation =
    !!votingPower &&
    votingPower.source === "historical-userAmount" &&
    !votingPower.bootstrapped &&
    votingPower.willAutoActivateOnVote;

  const hasVotingPower =
    vpLoading ||
    !votingPower ||
    votingPower.source === "error" ||
    (votingPower.bootstrapped && votingPower.power > 0n);

  const canVote =
    !hasVoted &&
    isPhase2Open &&
    !!effectiveCycleId &&
    !!address &&
    !!selected &&
    hasVotingPower &&
    !needsActivation &&
    !submitting &&
    !confirming;

  async function handleConfirm() {
    if (!canVote || !effectiveCycleId || !selected) return;
    setSubmitting(true);
    try {
      const hash = await writeContractAsync({
        address: GOV_ADDRESS,
        abi: governanceAbi,
        functionName: "castNonprofitVote",
        args: [effectiveCycleId, selected],
        dataSuffix: DATA_SUFFIX,
      });
      setPendingTx(hash);
      toast.loading("Confirming vote…", { id: "extend-vote" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      toast.error(msg.includes("User rejected") ? "Vote cancelled." : `Error: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Voting power display ──────────────────────────────────────────────────
  const powerDisplay = (() => {
    if (vpLoading || !address) return null;
    if (!votingPower || votingPower.source === "no-cycle") return null;
    if (needsActivation) return null; // handled by JSX prompt
    if (votingPower.source === "error") return { label: "Unavailable", sub: "Archive RPC error" };
    if (votingPower.power === 0n) {
      return { label: "0 OBN", sub: "No voting power — you held no OBN at the snapshot." };
    }
    return {
      label: `${formatObn(votingPower.power)} OBN`,
      sub: isPhase2Open ? "Ready to vote" : "Voting closed",
    };
  })();

  // Once a vote is on record (this device, this cycle), show who they voted
  // for instead of the raw voting power. Unknown choice (e.g. voted from
  // another device) falls through to the normal powerDisplay above.
  const votedDisplay =
    hasVoted && storedVoteAddr && votingPower
      ? { meta: NONPROFIT_BY_ADDRESS.get(storedVoteAddr.toLowerCase()), amount: formatObn(votingPower.power) }
      : null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const cardBg = mounted && theme === "light" ? "#ecfdf5" : "var(--card-bg)";
  const cardBorder = mounted && theme === "light" ? "#10b981" : "var(--card-border)";
  const isLoading = cycleLoading && !effectiveSummary;
  const ballotIsLoading = ballotLoading || (votesLoading && effectiveBallot.length > 0 && !hasAnyVotes);

  // Show ballot section whenever we have items and are in a relevant state
  const showBallot = sortedItems.length > 0 && (isPhase2Open || isPhase2Ready || isCompleted);

  return (
    <div className="flex flex-col page-bg" style={{ minHeight: "calc(100dvh - var(--obn-header-h))" }}>
      <main className="main-content px-4 pt-6 pb-12 flex flex-col items-center">
        {/* Back */}
        <div className="w-full max-w-lg mb-4">
          <button
            onClick={() => router.push("/protocol-funds")}
            className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-70 transition-opacity"
            style={{ color: "var(--card-subtext)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Protocol Funds
          </button>
        </div>

        {/* Header */}
        <div className="w-full max-w-lg mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-2xl">🌿</span>
            <h1 className="text-2xl font-bold" style={{ color: "#a855f7" }}>
              ExtendOliveBranch
            </h1>
          </div>
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--card-subtext)" }}
          >
            Phase 2 Vote — Choose a Nonprofit
          </p>
        </div>

        <div className="w-full max-w-lg flex flex-col gap-3">
          {/* Balance + contract link */}
          <div
            className="rounded-xl border p-3 md:p-4 shadow-md flex flex-col gap-3 shrink-0"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            {isLoading ? (
              <div className="space-y-3">
                <SkeletonBlock h="h-3" w="w-36" />
                <SkeletonBlock h="h-8" w="w-48" />
              </div>
            ) : (
              <div className="text-center">
                <p
                  className="text-xs font-medium mb-1 flex items-center justify-center gap-1.5"
                  style={{ color: "var(--card-subtext)" }}
                >
                  Balance in
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ backgroundColor: "#a855f7", color: "white" }}
                  >
                    ExtendOliveBranch
                  </span>
                </p>
                <p
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: "var(--card-text)" }}
                >
                  {formatObn(extendBalance)}
                  <span
                    className="text-base font-semibold ml-1"
                    style={{ color: "var(--card-subtext)" }}
                  >
                    OBN
                  </span>
                </p>
              </div>
            )}

            <a
              href={`https://basescan.org/address/${EXTEND_OLIVE_BRANCH}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-mono break-all hover:underline w-fit mx-auto"
              style={{ color: "var(--color-link)" }}
            >
              {EXTEND_OLIVE_BRANCH}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          {/* Voting closes in + Your Voting Power — merged */}
          {((phase2EndDate && effectiveSummary?.phase1Executed && isPhase2Open) || address) && (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md text-center shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              {phase2EndDate && effectiveSummary?.phase1Executed && isPhase2Open && (
                <div
                  className={address ? "pb-2 mb-2 border-b" : ""}
                  style={address ? { borderColor: cardBorder } : undefined}
                >
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "var(--card-subtext)" }}
                  >
                    Voting closes in
                  </p>
                  <CountdownDisplay target={phase2EndDate} />
                </div>
              )}

              {address && (
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "var(--card-subtext)" }}
                  >
                    {votedDisplay ? "Your Vote" : "Your Voting Power"}
                  </p>
                  {vpLoading ? (
                    <div className="space-y-1.5 flex flex-col items-center">
                      <SkeletonBlock h="h-6" w="w-36" />
                      <SkeletonBlock h="h-3" w="w-24" />
                    </div>
                  ) : votedDisplay ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center justify-center gap-2">
                        {votedDisplay.meta?.logo && (
                          <Image
                            src={votedDisplay.meta.logo}
                            alt={votedDisplay.meta.name}
                            width={24}
                            height={24}
                            className="rounded-full shrink-0"
                          />
                        )}
                        <p className="text-xl font-bold" style={{ color: "var(--card-text)" }}>
                          {votedDisplay.meta?.name ?? storedVoteAddr}
                        </p>
                      </div>
                      <p className="text-xl font-bold" style={{ color: "var(--card-text)" }}>
                        {votedDisplay.amount}
                      </p>
                    </div>
                  ) : needsActivation ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                        Voting power not yet active.
                      </p>
                      <div
                        className="rounded-lg p-3 flex flex-col items-center gap-2"
                        style={{ backgroundColor: "#f59e0b14", border: "1px solid #f59e0b44" }}
                      >
                        <p className="text-xs leading-relaxed" style={{ color: "var(--card-text)" }}>
                          Staking, unstaking, or claiming rewards will activate your voting power.
                          Visit your profile to interact with the protocol.
                        </p>
                        <Link
                          href="/profile"
                          className="text-xs font-semibold hover:opacity-80 transition-opacity w-fit"
                          style={{ color: "#f59e0b" }}
                        >
                          Go to Profile →
                        </Link>
                      </div>
                    </div>
                  ) : powerDisplay ? (
                    <div>
                      <p className="text-xl font-bold" style={{ color: "var(--card-text)" }}>
                        {powerDisplay.label}
                      </p>
                      {powerDisplay.sub && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--card-subtext)" }}>
                          {powerDisplay.sub}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                      No active governance cycle.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Nonprofit ballot */}
          {isCompleted && effectiveSummary?.phase2Executed ? (
            <div
              className="rounded-xl border p-5 shadow-md text-center"
              style={{ backgroundColor: cardBg, borderColor: "#a855f7" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--card-subtext)" }}
              >
                Phase 2 Outcome
              </p>
              {!hasAnyVotes ? (
                <p className="text-base font-semibold" style={{ color: "var(--card-subtext)" }}>
                  No votes cast — funds rolled over to next cycle.
                </p>
              ) : (() => {
                const winner = sortedItems[0];
                return (
                  <div className="flex flex-col items-center gap-2">
                    {winner?.meta?.logo && (
                      <Image
                        src={winner.meta.logo}
                        alt={winner.meta.name}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                    )}
                    <p className="text-xl font-bold" style={{ color: "#a855f7" }}>
                      🌿 {winner?.meta?.name ?? winner?.address}
                    </p>
                    <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                      {formatObn(winner?.votes)} OBN in votes
                    </p>
                  </div>
                );
              })()}
              {isPending && (
                <p className="text-xs mt-2" style={{ color: "var(--card-subtext)" }}>
                  Next annual cycle hasn&apos;t started yet.
                </p>
              )}
            </div>
          ) : isPhase2Ready ? (
            <div
              className="rounded-xl border p-5 shadow-md text-center"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              <p className="text-base font-semibold" style={{ color: "var(--card-subtext)" }}>
                Voting closed — results finalize automatically within ~5 minutes.
              </p>
            </div>
          ) : showBallot ? (
            <div
              className="rounded-xl border p-4 md:p-5 shadow-md flex flex-col gap-3"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              {/* Ballot header */}
              <div className="flex items-center justify-between">
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--card-subtext)" }}
                >
                  Nonprofit Ballot
                </p>
                <div className="flex items-center gap-2">
                  {hasAnyVotes && (
                    <p className="text-xs tabular-nums" style={{ color: "var(--card-subtext)" }}>
                      {formatObnCompact(totalVotes)} OBN total
                    </p>
                  )}
                  {isPhase2Open && (
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: "#16a34a22", color: "#16a34a" }}
                    >
                      live
                    </span>
                  )}
                </div>
              </div>

              {/* Loading skeleton for votes */}
              {ballotIsLoading ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg p-3" style={{ backgroundColor: theme === "dark" ? "#ffffff08" : "#00000005" }}>
                      <div className="flex items-center gap-3 mb-2">
                        <SkeletonBlock h="h-7" w="w-7" />
                        <div className="flex-1 space-y-1.5">
                          <SkeletonBlock h="h-3.5" w="w-32" />
                          <SkeletonBlock h="h-2.5" w="w-20" />
                        </div>
                      </div>
                      <SkeletonBlock h="h-2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  ref={ballotListRef}
                  className="relative w-full"
                  style={{ height: ballotVirtualizer.getTotalSize() }}
                >
                  {ballotVirtualizer.getVirtualItems().map((virtualRow) => {
                    const { address: nAddr, meta, votes } = sortedItems[virtualRow.index];
                    const displayIndex = virtualRow.index;
                    const pct =
                      !hasAnyVotes
                        ? 0
                        : Number((votes * 10000n) / totalVotes) / 100;
                    const isVotedFor = storedVoteAddr === nAddr.toLowerCase() && !!hasVoted;
                    const isSelected = selected === nAddr;
                    const votingClosed = !isPhase2Open;
                    const rankLabel = hasAnyVotes ? ordinal(displayIndex + 1) : null;

                    return (
                      <div
                        key={nAddr}
                        ref={ballotVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className="absolute top-0 left-0 w-full pb-2"
                        style={{
                          transform: `translateY(${virtualRow.start - ballotVirtualizer.options.scrollMargin}px)`,
                        }}
                      >
                      <button
                        onClick={() => {
                          if (!hasVoted && !votingClosed) setSelected(nAddr);
                        }}
                        disabled={hasVoted || votingClosed}
                        className="w-full text-left rounded-lg p-3 border-2 transition-all"
                        style={{
                          borderColor: isVotedFor
                            ? "#16a34a"
                            : isSelected
                            ? "#a855f7"
                            : "transparent",
                          backgroundColor: isVotedFor
                            ? "#16a34a11"
                            : isSelected
                            ? "#a855f711"
                            : theme === "dark"
                            ? "#ffffff08"
                            : "#00000005",
                          cursor: hasVoted || votingClosed ? "default" : "pointer",
                        }}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          {/* Rank badge */}
                          {rankLabel ? (
                            <span
                              className="text-[10px] font-bold tabular-nums shrink-0 w-7 text-center"
                              style={{ color: displayIndex === 0 ? "#f59e0b" : "var(--card-subtext)" }}
                            >
                              {rankLabel}
                            </span>
                          ) : (
                            <span className="w-7 shrink-0" />
                          )}

                          {/* Logo */}
                          {meta?.logo ? (
                            <Image
                              src={meta.logo}
                              alt={meta.name}
                              width={28}
                              height={28}
                              className="rounded-full shrink-0"
                            />
                          ) : (
                            <div
                              className="w-7 h-7 rounded-full shrink-0"
                              style={{ backgroundColor: "var(--card-border)" }}
                            />
                          )}

                          {/* Name + stats */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-sm font-semibold truncate"
                                style={{ color: "var(--card-text)" }}
                              >
                                {meta?.name ?? nAddr}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isVotedFor && (
                                  <CheckCircle2
                                    className="w-4 h-4"
                                    style={{ color: "#16a34a" }}
                                  />
                                )}
                                <span
                                  className="text-xs tabular-nums"
                                  style={{ color: "var(--card-subtext)" }}
                                >
                                  {hasAnyVotes ? `${pct.toFixed(1)}%` : "—"}
                                </span>
                              </div>
                            </div>
                            <p
                              className="text-[10px] mt-0.5"
                              style={{ color: "var(--card-subtext)" }}
                            >
                              {hasAnyVotes
                                ? `${formatObnCompact(votes)} OBN`
                                : "No votes yet"}
                            </p>
                          </div>
                        </div>

                        {/* Vote bar */}
                        {hasAnyVotes ? (
                          <VoteBar pct={pct} color={isVotedFor ? "#16a34a" : "#a855f7"} />
                        ) : (
                          <div
                            className="w-full h-2 rounded-full"
                            style={{ backgroundColor: "var(--card-border)", opacity: 0.3 }}
                          />
                        )}
                      </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action row */}
              {!address ? (
                <p className="text-sm text-center mt-1" style={{ color: "var(--card-subtext)" }}>
                  Connect your wallet to vote.
                </p>
              ) : hasVoted ? (
                <p
                  className="text-sm text-center font-semibold mt-1"
                  style={{ color: "#16a34a" }}
                >
                  You have voted in Phase 2.
                </p>
              ) : isPhase2Open ? (
                <>
                  <button
                    onClick={handleConfirm}
                    disabled={!canVote}
                    className="w-full py-3.5 rounded-lg font-bold text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                    style={{ backgroundColor: "#a855f7", color: "#fff" }}
                  >
                    {confirming ? "Confirming…" : "Confirm Vote"}
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md text-center shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              <p className="text-base font-semibold" style={{ color: "var(--card-subtext)" }}>
                {isPhase1Stage
                  ? "Phase 2 opens once Phase 1 voting closes."
                  : hasCycleEverStarted
                  ? "Next annual cycle hasn't started yet."
                  : "Governance hasn't started yet — check back for the first annual cycle."}
              </p>
            </div>
          )}

          {!address && (
            <p className="text-xs text-center" style={{ color: "var(--card-subtext)" }}>
              Connect your wallet to participate in governance.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
