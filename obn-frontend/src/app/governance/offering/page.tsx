"use client";

import { useEffect, useState } from "react";
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
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { useGovernanceCycle, CycleState } from "@/hooks/useGovernanceCycle";
import { useDisplayedVotingPower } from "@/hooks/useDisplayedVotingPower";
import { governanceAbi } from "@/lib/governanceAbi";
import { ANNUAL_GOV_PROXY, THE_OFFERING, OBN_TOKEN } from "@/lib/contracts";
import { DATA_SUFFIX } from "@/lib/builderCode";

const GOV_ADDRESS = ANNUAL_GOV_PROXY as `0x${string}`;
const OBN_TOKEN_ADDRESS = OBN_TOKEN as `0x${string}`;
// True for `npm run dev` and `npm run dev:mainnet` (both run `next dev`),
// false for the deployed production build — i.e. only reachable locally.
const DEV_MODE = process.env.NODE_ENV === "development";

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

function getStoredChoice(cycleId: string, voter: string): "BURN" | "GIVE" | null {
  try {
    const v = localStorage.getItem(`gov_p1_vote_${cycleId}_${voter.toLowerCase()}`);
    return v === "BURN" || v === "GIVE" ? v : null;
  } catch {
    return null;
  }
}

function storeChoice(cycleId: string, voter: string, choice: "BURN" | "GIVE") {
  try {
    localStorage.setItem(`gov_p1_vote_${cycleId}_${voter.toLowerCase()}`, choice);
  } catch {
    /* ignore */
  }
}

function VoteTallySection({
  burnVotes,
  giveVotes,
  loading,
  votingClosed,
}: {
  burnVotes: bigint;
  giveVotes: bigint;
  loading: boolean;
  votingClosed: boolean;
}) {
  const total = burnVotes + giveVotes;
  const hasVotes = total > 0n;

  const burnPct = !hasVotes ? 0 : Number((burnVotes * 10000n) / total) / 100;
  const givePct = !hasVotes ? 0 : 100 - burnPct;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <p className="text-xs font-semibold uppercase tracking-wider text-center" style={{ color: "var(--card-subtext)" }}>
        {votingClosed ? "Tally Results" : "Current Tally"}
      </p>

      {loading ? (
        <div className="space-y-2">
          <SkeletonBlock h="h-5" />
          <SkeletonBlock h="h-4" />
          <SkeletonBlock h="h-3" w="w-2/3" />
        </div>
      ) : !hasVotes ? (
        <p className="text-sm text-center py-2" style={{ color: "var(--card-subtext)" }}>
          No votes yet
        </p>
      ) : (
        <>
          {/* Label row */}
          <div className="flex justify-between text-xs font-semibold">
            <span style={{ color: "#6b7280" }}>🔥 BURN — {burnPct.toFixed(1)}%</span>
            <span style={{ color: "#a855f7" }}>GIVE — {givePct.toFixed(1)}% 🌿</span>
          </div>

          {/* Bar */}
          <div
            className="w-full h-4 rounded-full overflow-hidden flex"
            style={{ backgroundColor: "var(--card-border)" }}
          >
            <div
              className="h-full transition-all duration-700"
              style={{ width: `${burnPct}%`, backgroundColor: "#6b7280" }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{ width: `${givePct}%`, backgroundColor: "#a855f7" }}
            />
          </div>

          {/* Raw counts */}
          <div className="flex justify-between text-xs tabular-nums" style={{ color: "var(--card-subtext)" }}>
            <span>{formatObnCompact(burnVotes)} OBN</span>
            <span>{formatObnCompact(giveVotes)} OBN</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function OfferingVotePage() {
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
  const isPhase1Open  = effectiveState === CycleState.PHASE1_OPEN;
  const isPhase1Ready = effectiveState === CycleState.PHASE1_READY;
  const showOutcome   =
    effectiveState !== undefined &&
    effectiveState >= CycleState.PHASE2_OPEN &&
    effectiveSummary?.phase1Executed;

  // Awaiting the next cycle: either the most recent one finished/was
  // cancelled, or none has ever run.
  const isPending =
    !hasCycleEverStarted ||
    effectiveState === CycleState.COMPLETED ||
    effectiveState === CycleState.CANCELLED;

  const phase1EndDate = effectiveSummary?.phase1End
    ? new Date(effectiveSummary.phase1End * 1000)
    : null;

  // ── Balance ───────────────────────────────────────────────────────────────
  const { data: offeringBalance } = useReadContract({
    address: OBN_TOKEN_ADDRESS,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [THE_OFFERING as `0x${string}`],
    query: { staleTime: 30_000, refetchInterval: 30_000 },
  });

  // ── Live 15s tally poll (only when phase 1 is open on-chain) ─────────────
  // Tanstack Query deduplicates fetches that share the same cache key, so this
  // doesn't cause double network calls alongside useGovernanceCycle's own fetch.
  const { data: tallyPoll, isLoading: tallyLoading } = useReadContracts({
    contracts: [
      {
        address: GOV_ADDRESS,
        abi: governanceAbi,
        functionName: "getCycleSummary",
        args: [effectiveCycleId!],
      },
    ],
    query: {
      enabled: isPhase1Open && !!effectiveCycleId,
      staleTime: 10_000,
      refetchInterval: 15_000,
    },
  });

  // Prefer live poll; fall back to summary from cycle hook
  type SummaryTuple = readonly [bigint, bigint, bigint, bigint, bigint, number, boolean, boolean, boolean];
  const pollRaw = tallyPoll?.[0]?.result as SummaryTuple | undefined;
  const burnVotes = pollRaw?.[3] ?? effectiveSummary?.burnVotes ?? 0n;
  const giveVotes = pollRaw?.[4] ?? effectiveSummary?.giveVotes ?? 0n;

  const tallyIsLoading = cycleLoading || (isPhase1Open && tallyLoading && !effectiveSummary);

  // ── Voted state ───────────────────────────────────────────────────────────
  const { data: hasVoted, refetch: refetchHasVoted } = useReadContract({
    address: GOV_ADDRESS,
    abi: governanceAbi,
    functionName: "hasVotedPhase1",
    args: [effectiveCycleId!, address!],
    query: { enabled: !!(effectiveCycleId && address), staleTime: 20_000 },
  });

  // ── Voting power (re-fetched every 15s so bootstrap status updates live) ──
  const [vpTick, setVpTick] = useState(0);
  useEffect(() => {
    if (!address || !isPhase1Open) return;
    const id = setInterval(() => setVpTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [address, isPhase1Open]);

  const { votingPower, isLoading: vpLoading } = useDisplayedVotingPower(effectiveCycleId, vpTick);

  // ── Transaction ───────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [votedChoice, setVotedChoice] = useState<"BURN" | "GIVE" | null>(null);

  useEffect(() => {
    if (effectiveCycleId && address) {
      setVotedChoice(getStoredChoice(effectiveCycleId.toString(), address));
    }
  }, [effectiveCycleId?.toString(), address]);

  // hasVoted=true but nothing in localStorage — either this device never
  // recorded the vote (cast before this feature shipped) or it was cast from
  // a different device. Recover the real choice from the event log instead
  // of leaving the UI stuck showing raw voting power.
  useEffect(() => {
    if (votedChoice || !hasVoted || !effectiveCycleId || !address || !publicClient) return;
    publicClient
      .getContractEvents({
        address: GOV_ADDRESS,
        abi: governanceAbi,
        eventName: "OfferingVoteCast",
        args: { cycleId: effectiveCycleId, voter: address },
        fromBlock: effectiveSummary ? BigInt(effectiveSummary.snapshotBlock) : 0n,
        toBlock: "latest",
      })
      .then((logs) => {
        const burn = logs[0]?.args.burn;
        if (burn === undefined) return;
        const choice = burn ? "BURN" : "GIVE";
        setVotedChoice(choice);
        storeChoice(effectiveCycleId.toString(), address, choice);
      })
      .catch(() => {
        /* archive RPC may not support this range — leave as unresolved */
      });
  }, [votedChoice, hasVoted, effectiveCycleId?.toString(), address, publicClient, effectiveSummary?.snapshotBlock]);

  // Phase1Executed's amount isn't stored in cycle state — it only ever
  // existed as a local variable in that transaction — so recover it from the
  // event log to show how much was actually burned/sent.
  const [phase1Amount, setPhase1Amount] = useState<bigint | null>(null);
  useEffect(() => {
    if (!effectiveCycleId || !effectiveSummary?.phase1Executed || !publicClient) {
      setPhase1Amount(null);
      return;
    }
    publicClient
      .getContractEvents({
        address: GOV_ADDRESS,
        abi: governanceAbi,
        eventName: "Phase1Executed",
        args: { cycleId: effectiveCycleId },
        fromBlock: BigInt(effectiveSummary.snapshotBlock),
        toBlock: "latest",
      })
      .then((logs) => {
        setPhase1Amount(logs[0]?.args.amount ?? null);
      })
      .catch(() => setPhase1Amount(null));
  }, [effectiveCycleId?.toString(), effectiveSummary?.phase1Executed, effectiveSummary?.snapshotBlock, publicClient]);

  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: pendingTx ?? undefined,
  });

  useEffect(() => {
    if (confirmed) {
      toast.success(`Vote cast: ${votedChoice}!`);
      toast.dismiss("offering-vote");
      setPendingTx(null);
      if (votedChoice && effectiveCycleId && address) {
        storeChoice(effectiveCycleId.toString(), address, votedChoice);
      }
      refetchHasVoted();
    }
  }, [confirmed]);

  // bootstrapped=false → pre-v9.3 staker; prompt them to interact with the
  // protocol first so their checkpoint is created and power becomes visible.
  // Only applies when they actually had stake at the snapshot — a genuine
  // zero-power user can't "activate" power they never had for this cycle.
  const needsActivation =
    !!votingPower &&
    votingPower.source === "historical-userAmount" &&
    !votingPower.bootstrapped &&
    votingPower.willAutoActivateOnVote;

  // Allow voting when:  loading (don't block), error (unknown — let them try),
  // or confirmed positive power.  Block when bootstrapped=true & power=0 (no
  // snapshot stake), and block when needsActivation (send to profile first).
  const hasVotingPower =
    vpLoading ||
    !votingPower ||
    votingPower.source === "error" ||
    (votingPower.bootstrapped && votingPower.power > 0n);

  const canVote =
    !hasVoted &&
    isPhase1Open &&
    !!effectiveCycleId &&
    !!address &&
    hasVotingPower &&
    !needsActivation &&
    !submitting &&
    !confirming;

  async function handleVote(burn: boolean) {
    if (!canVote || !effectiveCycleId) return;
    setSubmitting(true);
    setVotedChoice(burn ? "BURN" : "GIVE");
    try {
      const hash = await writeContractAsync({
        address: GOV_ADDRESS,
        abi: governanceAbi,
        functionName: "castOfferingVote",
        args: [effectiveCycleId, burn],
        dataSuffix: DATA_SUFFIX,
      });
      setPendingTx(hash);
      toast.loading("Confirming vote…", { id: "offering-vote" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      toast.error(msg.includes("User rejected") ? "Vote cancelled." : `Error: ${msg}`);
      setVotedChoice(null);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Voting power display ──────────────────────────────────────────────────
  // needsActivation is rendered separately as a prompt — not via powerDisplay.
  const powerDisplay = (() => {
    if (vpLoading || !address) return null;
    if (!votingPower || votingPower.source === "no-cycle") return null;
    if (needsActivation) return null;
    if (votingPower.source === "error") return { label: "Unavailable", sub: "Archive RPC error" };
    if (votingPower.power === 0n) {
      return { label: "0 OBN", sub: "No voting power — you held no OBN at the snapshot." };
    }
    return {
      label: `${formatObn(votingPower.power)} OBN`,
      sub: isPhase1Open ? "Ready to vote" : "Voting closed",
    };
  })();

  // Once a vote is on record (this device, this cycle), show what they voted
  // instead of the raw voting power. Unknown choice (e.g. voted from another
  // device) falls through to the normal powerDisplay above.
  const votedDisplay =
    hasVoted && votedChoice && votingPower
      ? { choice: votedChoice, amount: formatObn(votingPower.power) }
      : null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const cardBg = mounted && theme === "light" ? "#ecfdf5" : "var(--card-bg)";
  const cardBorder = mounted && theme === "light" ? "#10b981" : "var(--card-border)";
  const isLoading = cycleLoading && !effectiveSummary;

  return (
    <div className="flex flex-col page-bg overflow-hidden" style={{ height: "calc(100dvh - var(--obn-header-h))" }}>
      <main className="main-content px-4 pt-3 pb-3 flex flex-col items-center flex-1 min-h-0">
        {/* Back */}
        <div className="w-full max-w-lg mb-2">
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
        <div className="w-full max-w-lg mb-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-2xl">🔥</span>
            <h1 className="text-2xl font-bold" style={{ color: "#6b7280" }}>
              TheOffering
            </h1>
          </div>
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--card-subtext)" }}
          >
            Phase 1 Vote — Burn or Give
          </p>
        </div>

        <div className="w-full max-w-lg flex flex-col gap-3 flex-1 min-h-0">
          {/* Balance + contract link */}
          <div
            className="rounded-xl border p-3 md:p-4 shadow-md flex flex-col gap-3 shrink-0"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            {isLoading ? (
              <div className="space-y-3">
                <SkeletonBlock h="h-3" w="w-32" />
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
                    style={{ backgroundColor: "#6b7280", color: "white" }}
                  >
                    TheOffering
                  </span>
                </p>
                <p
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: "var(--card-text)" }}
                >
                  {formatObn(offeringBalance)}
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
              href={`https://basescan.org/address/${THE_OFFERING}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-mono break-all hover:underline w-fit mx-auto"
              style={{ color: "var(--color-link)" }}
            >
              {THE_OFFERING}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          {/* Voting closes in + Your Voting Power — merged */}
          {((phase1EndDate && isPhase1Open) || address) && (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md text-center shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              {phase1EndDate && isPhase1Open && (
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
                  <CountdownDisplay target={phase1EndDate} />
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
                    <p className="text-xl font-bold" style={{ color: "var(--card-text)" }}>
                      {votedDisplay.choice === "BURN" ? "🔥 Burn" : "🌿 Give"} {votedDisplay.amount}
                    </p>
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
                          Staking, unstaking, or claiming rewards will activate your voting power. Visit your profile to interact with the protocol.
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

          {/* Vote tally — always shown when there's a cycle (incl. the last completed one) */}
          {effectiveSummary && (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              <VoteTallySection
                burnVotes={burnVotes}
                giveVotes={giveVotes}
                loading={tallyIsLoading}
                votingClosed={!isPhase1Open}
              />
            </div>
          )}

          {/* Vote buttons / status / pending */}
          {showOutcome ? (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md text-center shrink-0"
              style={{ backgroundColor: cardBg, borderColor: "#6b7280" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--card-subtext)" }}
              >
                Phase 1 Outcome
              </p>
              <p className="text-xl font-bold" style={{ color: "#6b7280" }}>
                {effectiveSummary?.phase1Outcome === 1
                  ? "🔥 BURNED"
                  : "🌿 SENT TO EXTEND OLIVE BRANCH"}
                {phase1Amount !== null && ` ${formatObn(phase1Amount)} OBN`}
              </p>
              {isPending && (
                <p className="text-xs mt-2" style={{ color: "var(--card-subtext)" }}>
                  Next annual cycle hasn&apos;t started yet.
                </p>
              )}
            </div>
          ) : isPhase1Ready ? (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md text-center shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              <p className="text-base font-semibold" style={{ color: "var(--card-subtext)" }}>
                Voting closed — results finalize automatically within ~5 minutes.
              </p>
            </div>
          ) : isPhase1Open ? (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              {!address ? (
                <p className="text-sm text-center" style={{ color: "var(--card-subtext)" }}>
                  Connect your wallet to vote.
                </p>
              ) : hasVoted ? (
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color: "#16a34a" }}>
                    You have already voted in Phase 1.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--card-subtext)" }}
                  >
                    Cast Your Vote
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleVote(true)}
                      disabled={!canVote}
                      className="flex-1 py-3.5 rounded-lg font-bold text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                      style={{
                        backgroundColor: "#6b728015",
                        color: "#6b7280",
                        border: "2px solid #6b7280",
                      }}
                    >
                      🔥 BURN
                    </button>
                    <button
                      onClick={() => handleVote(false)}
                      disabled={!canVote}
                      className="flex-1 py-3.5 rounded-lg font-bold text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                      style={{
                        backgroundColor: "#a855f715",
                        color: "#a855f7",
                        border: "2px solid #a855f7",
                      }}
                    >
                      GIVE 🌿
                    </button>
                  </div>
                  {confirming && (
                    <p className="text-xs text-center" style={{ color: "var(--card-subtext)" }}>
                      Confirming on-chain…
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl border p-3 md:p-4 shadow-md text-center shrink-0"
              style={{ backgroundColor: cardBg, borderColor: cardBorder }}
            >
              <p className="text-base font-semibold" style={{ color: "var(--card-subtext)" }}>
                {hasCycleEverStarted
                  ? "Next annual cycle hasn't started yet."
                  : "Governance hasn't started yet — check back for the first annual cycle."}
              </p>
            </div>
          )}

          {!address && (
            <p className="text-xs text-center shrink-0" style={{ color: "var(--card-subtext)" }}>
              Connect your wallet to participate in governance.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
