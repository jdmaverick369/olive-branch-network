"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { ExternalLink, ChevronRight } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { THE_OFFERING, EXTEND_OLIVE_BRANCH } from "@/lib/contracts";
import { useGovernanceCycle, CycleState } from "@/hooks/useGovernanceCycle";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
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

const NEXT_VOTE_DATE = new Date(
  process.env.NEXT_PUBLIC_NEXT_VOTE_DATE ?? "2027-09-09T21:00:00Z"
);

function usePageBackground() {
  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "var(--page-bg-to)";
    return () => {
      document.body.style.backgroundColor = originalBg;
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
  // Lazy-init must not call Date.now() here — it would run once during SSR and
  // again during client hydration at a different wall-clock time, producing a
  // mismatched seconds digit. Always start null; the effect below (client-only)
  // computes the real value post-hydration.
  const [timeLeft, setTimeLeft] = useState<ReturnType<typeof getTimeLeft> | null>(null);
  useEffect(() => {
    if (!target) { setTimeLeft(null); return; }
    setTimeLeft(getTimeLeft(target));
    const id = setInterval(() => setTimeLeft(getTimeLeft(target)), 1_000);
    return () => clearInterval(id);
  }, [target?.getTime()]);
  return timeLeft;
}

function formatObn(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  return Number(formatUnits(raw, 18)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1">
      <span className="text-xl font-bold tabular-nums" style={{ color: "var(--card-text)" }}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wide mt-0.5" style={{ color: "var(--card-subtext)" }}>
        {label}
      </span>
    </div>
  );
}

function InlineCountdown({ target }: { target: Date }) {
  const t = useCountdown(target);
  if (!t) return null;
  if (t.done) return <span className="font-semibold" style={{ color: "#16a34a" }}>Closed</span>;
  const parts: string[] = [];
  if (t.days > 0) parts.push(`${t.days}d`);
  parts.push(String(t.hours).padStart(2, "0"));
  parts.push(String(t.minutes).padStart(2, "0"));
  parts.push(String(t.seconds).padStart(2, "0"));
  const timeStr = t.days > 0
    ? `${t.days}d ${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")}`
    : `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")}`;
  return <span className="font-semibold tabular-nums">{timeStr}</span>;
}

function FundCard({
  emoji,
  name,
  phase,
  description,
  balance,
  address,
  accentColor,
  onClick,
  countdownTarget,
  awaitingExecution,
  outcomeLabel,
}: {
  emoji: string;
  name: string;
  phase: string;
  description: string;
  balance: bigint | undefined;
  address: string;
  accentColor: string;
  onClick?: () => void;
  countdownTarget?: Date;
  awaitingExecution?: boolean;
  outcomeLabel?: string;
}) {
  const theme = useTheme();
  const isClickable = !!onClick;

  const inner = (
    <div
      className={[
        "flex-1 min-w-0 rounded-xl border p-3 md:p-6 shadow-md flex flex-col gap-3 md:gap-4",
        isClickable ? "cursor-pointer transition-transform hover:scale-[1.02] hover:shadow-lg" : "",
      ].join(" ")}
      style={{
        backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
        borderColor: isClickable
          ? accentColor
          : theme === "dark"
          ? "var(--card-border)"
          : "#10b981",
        boxShadow: isClickable
          ? `0 0 0 2px ${accentColor}55`
          : theme === "dark"
          ? undefined
          : "0 0 0 1px rgba(16,185,129,0.4)",
      }}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span
            className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full w-fit"
            style={{ backgroundColor: accentColor + "22", color: accentColor }}
          >
            {phase}
          </span>
          {isClickable && (
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base md:text-2xl">{emoji}</span>
          <h2 className="text-xs md:text-lg font-bold leading-tight" style={{ color: accentColor }}>
            {name}
          </h2>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium mb-1" style={{ color: "var(--card-subtext)" }}>
          Current Balance
        </p>
        <p
          className="text-[min(5vw,1.25rem)] md:text-3xl font-bold tabular-nums whitespace-nowrap"
          style={{ color: "var(--card-text)" }}
        >
          {formatObn(balance)}
          <span
            className="text-xs md:text-base font-semibold ml-1"
            style={{ color: "var(--card-subtext)" }}
          >
            OBN
          </span>
        </p>
      </div>

      {outcomeLabel ? (
        <p className="text-[11px] md:text-sm font-semibold" style={{ color: accentColor }}>
          {outcomeLabel}
        </p>
      ) : awaitingExecution ? (
        <p className="text-[11px] md:text-sm font-semibold" style={{ color: "var(--card-subtext)" }}>
          Awaiting execution
        </p>
      ) : (
        <p className="text-[11px] md:text-sm leading-relaxed" style={{ color: "var(--card-subtext)" }}>
          {description}
        </p>
      )}

      {countdownTarget && (
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--card-subtext)" }}
        >
          <span>Voting closes in</span>
          <InlineCountdown target={countdownTarget} />
        </div>
      )}

      {isClickable && (
        <p className="text-[10px] md:text-xs font-semibold" style={{ color: accentColor }}>
          Tap to vote →
        </p>
      )}

      <a
        href={`https://basescan.org/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[8px] md:text-xs font-mono break-all hover:underline mt-auto"
        style={{ color: "var(--color-link)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {address}
        <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    </div>
  );

  return inner;
}

export default function ProtocolFundsPage() {
  usePageBackground();
  const router = useRouter();
  const { state, summary } = useGovernanceCycle();

  const countdown = useCountdown(NEXT_VOTE_DATE);

  const { data: offeringBalance } = useReadContract({
    address: OBN_TOKEN_ADDRESS,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [THE_OFFERING],
    query: { staleTime: 30_000, refetchInterval: 30_000 },
  });

  const { data: extendBalance } = useReadContract({
    address: OBN_TOKEN_ADDRESS,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [EXTEND_OLIVE_BRANCH],
    query: { staleTime: 30_000, refetchInterval: 30_000 },
  });

  // Derive card props from cycle state
  const isPhase1Open  = state === CycleState.PHASE1_OPEN;
  const isPhase1Ready = state === CycleState.PHASE1_READY;
  const isPhase2Open  = state === CycleState.PHASE2_OPEN;
  const isPhase2Ready = state === CycleState.PHASE2_READY;
  const isActive = isPhase1Open || isPhase1Ready || isPhase2Open || isPhase2Ready;

  const phase1EndDate = summary?.phase1End ? new Date(summary.phase1End * 1000) : undefined;
  const phase2EndDate = summary?.phase2End ? new Date(summary.phase2End * 1000) : undefined;

  // Reachable only when running locally (dev), regardless of which wallet is
  // connected — everyone hitting the deployed production build sees the
  // cards but can't open them, while testing continues.
  const offeringClickable = DEV_MODE;
  const extendClickable   = DEV_MODE;

  const phase1OutcomeLabel =
    (isPhase2Open || isPhase2Ready) && summary?.phase1Outcome === 1
      ? "Outcome: BURNED"
      : (isPhase2Open || isPhase2Ready) && summary?.phase1Outcome === 2
      ? "Outcome: SENT TO EXTEND OLIVE BRANCH"
      : undefined;

  return (
    <div
      className="flex flex-col relative page-bg"
      style={{ minHeight: "calc(100dvh - var(--obn-header-h))" }}
    >
      <main className="main-content px-4 pt-8 flex flex-col items-center">
        {/* Hero */}
        <div className="w-full text-center mx-auto" style={{ maxWidth: "600px" }}>
          <h1
            className="font-bold mb-3 text-center"
            style={{
              color: "var(--card-text)",
              fontSize: "min(7vw, 2.25rem)",
              whiteSpace: "nowrap",
            }}
          >
            Protocol Funds
          </h1>
        </div>

        {/* Countdown / Cycle status header */}
        {!isActive && (
          <div className="text-center mb-7">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: "var(--card-subtext)" }}
            >
              Annual Vote Opens
            </p>
            <p className="text-sm font-medium mb-4" style={{ color: "var(--card-text)" }}>
              September 9, 2027 · 9:00 PM UTC
            </p>

            {countdown?.done ? (
              <p className="text-lg font-bold" style={{ color: "#16a34a" }}>
                Voting is open!
              </p>
            ) : countdown ? (
              <div className="flex items-center justify-center gap-0">
                <CountdownBox value={countdown.days} label="days" />
                <span
                  className="text-lg font-bold pb-3 px-0.5"
                  style={{ color: "var(--card-subtext)" }}
                >
                  :
                </span>
                <CountdownBox value={countdown.hours} label="hours" />
                <span
                  className="text-lg font-bold pb-3 px-0.5"
                  style={{ color: "var(--card-subtext)" }}
                >
                  :
                </span>
                <CountdownBox value={countdown.minutes} label="min" />
                <span
                  className="text-lg font-bold pb-3 px-0.5"
                  style={{ color: "var(--card-subtext)" }}
                >
                  :
                </span>
                <CountdownBox value={countdown.seconds} label="sec" />
              </div>
            ) : null}
          </div>
        )}

        {isActive && (
          <div className="text-center mb-6">
            <p
              className="text-sm font-semibold uppercase tracking-widest"
              style={{
                color: isPhase1Open || isPhase2Open ? "#16a34a" : "var(--card-subtext)",
              }}
            >
              {isPhase1Open && "Annual Governance · Phase 1 Voting Open"}
              {isPhase1Ready && "Annual Governance · Phase 1 Closed — Awaiting Execution"}
              {isPhase2Open && "Annual Governance · Phase 2 Voting Open"}
              {isPhase2Ready && "Annual Governance · Phase 2 Closed — Awaiting Execution"}
            </p>
          </div>
        )}

        {/* Fund cards */}
        <div className="w-full max-w-3xl flex flex-col min-[340px]:flex-row gap-2 md:gap-4">
          <FundCard
            emoji="🔥"
            name="TheOffering"
            phase="Phase 1"
            description="Stakers vote whether to permanently burn the balance or add it to ExtendOliveBranch."
            balance={offeringBalance}
            address={THE_OFFERING}
            accentColor="#6b7280"
            onClick={offeringClickable ? () => router.push("/governance/offering") : undefined}
            countdownTarget={isPhase1Open && phase1EndDate ? phase1EndDate : undefined}
            awaitingExecution={isPhase1Ready}
            outcomeLabel={phase1OutcomeLabel}
          />
          <FundCard
            emoji="🌿"
            name="ExtendOliveBranch"
            phase="Phase 2"
            description="Stakers vote on which nonprofit receives the full balance."
            balance={extendBalance}
            address={EXTEND_OLIVE_BRANCH}
            accentColor="#a855f7"
            onClick={extendClickable ? () => router.push("/governance/extend") : undefined}
            countdownTarget={isPhase2Open && phase2EndDate && summary?.phase1Executed ? phase2EndDate : undefined}
            awaitingExecution={isPhase2Ready}
          />
        </div>
      </main>
    </div>
  );
}
