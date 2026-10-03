"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { POOLS, getPoolMeta } from "@/lib/pools";
import { stakingAbi } from "@/lib/stakingAbi";
import { lensAbi } from "@/lib/lensAbi";
import { ambiguousPools, parseCommand, type Command, type CommandAmount } from "@/lib/commandParser";
import { answerStats } from "@/lib/askStats";
import { fetchAnalytics } from "@/lib/analytics";
import { useStakeActions } from "@/hooks/useStakeActions";
import { TransactionRecovery } from "@/hooks/useWalletTransaction";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useTheme } from "@/hooks/useTheme";
import { useMiniAppWallet } from "@/components/MiniAppWalletProvider";
import { useMonthlyAutoClaim, AutoClaimDialog } from "@/components/MonthlyAutoClaim";
import { isMiniAppRuntime } from "@/lib/miniapp";
import { track } from "@vercel/analytics";
import { sdk } from "@farcaster/miniapp-sdk";
import { FAQ, type FaqTopic } from "@/lib/oliverFaq";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const LENS_CONTRACT = (process.env.NEXT_PUBLIC_LENS_CONTRACT || undefined) as `0x${string}` | undefined;
const LIVE_POOLS = POOLS.filter(p => p.live);
const EXAMPLES = ["stake 10,000 OBN to St Jude", "unstake $5 from St Jude", "turn on auto claim", "how many people stake with St Jude?"];
// Names short enough for a reply chip; the parser understands all of them.
const SHORT: Record<number, string> = {
  0: "GiveDirectly", 1: "Heifer", 2: "Last Door", 3: "Freedom of the Press", 4: "Khan Academy", 5: "Rainforest",
  6: "Tor", 7: "St Jude", 8: "charity: water", 9: "Internet Archive", 10: "K9 Rescue",
};

type Message = { id: number; from: "user" | "bot"; body: ReactNode; chips?: string[] };
type Action = {
  kind: "stake" | "unstake" | "claim" | "claimAll" | "stakeEach";
  pid: number;
  amount: bigint;
  share?: number;      // % of the wallet (stake) or of the pool stake (unstake)
  pids?: number[];     // claimAll: every pool being claimed
  items?: { pid: number; amount: bigint }[]; // stakeEach: what goes into each pool (amount = the total)
  moveTo?: number;     // a move: after this unstake, offer to stake the same amount here
  step?: 1 | 2;        // a move's step, shown on the card
};
type Draft = Extract<Command, { kind: "stake" | "unstake" | "claim" | "move" | "stakeEach" }>;
type Stats = Extract<Command, { kind: "stats" }>;
type Position = { staked: bigint; pending: bigint; contributed: bigint };

const fmt = (raw: bigint) => {
  const n = Number(formatUnits(raw, 18));
  return n.toLocaleString(undefined, { maximumFractionDigits: n !== 0 && n < 1 ? 6 : 2 });
};
const poolName = (pid: number) => getPoolMeta(pid)?.name ?? `Pool ${pid}`;
const short = (pid: number) => SHORT[pid] ?? poolName(pid);

/** Strip anything identifying before a message is recorded for improving Oliver. */
const scrub = (text: string) => text
  .replace(/0x[0-9a-fA-F]{6,}/g, "0x…")
  .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "email")
  .replace(/\b[\w-]+\.(?:base\.)?eth\b/gi, "name.eth")
  .slice(0, 120);

export default function AskPage() {
  const displayText = useDisplayText();
  const theme = useTheme();
  const { address: wagmiAddress } = useAccount();
  const miniWallet = useMiniAppWallet();
  const account = (miniWallet.viewAddress ?? wagmiAddress ?? undefined) as `0x${string}` | undefined;
  const { openConnectModal } = useConnectModal();
  const actions = useStakeActions(account);
  const autoClaim = useMonthlyAutoClaim();
  const obnTicker = useMarketPrices().data?.find(item => item.symbol === "OBN");
  const price = obnTicker?.priceUsd;

  useEffect(() => {
    const original = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "var(--page-bg-to)";
    return () => { document.body.style.backgroundColor = original; };
  }, []);

  // --- Reads: wallet balance + every live pool's position in one multicall ---
  const contracts = useMemo(() => account ? [
    { address: OBN_TOKEN_ADDRESS, abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const, functionName: "balanceOf" as const, args: [account] as const },
    ...LIVE_POOLS.flatMap(p => [
      { address: STAKING_CONTRACT, abi: stakingAbi, functionName: "userAmount" as const, args: [BigInt(p.pid), account] as const },
      { address: LENS_CONTRACT, abi: lensAbi, functionName: "pendingRewards" as const, args: [BigInt(p.pid), account] as const },
      { address: STAKING_CONTRACT, abi: stakingAbi, functionName: "charityContributedByUserInPool" as const, args: [BigInt(p.pid), account] as const },
    ]),
  ] : [], [account]);
  const reads = useReadContracts({ contracts, query: { enabled: !!account, staleTime: 15_000 } });
  const loaded = !!account && !!reads.data;
  const { balance, positions } = useMemo(() => {
    const value = (i: number) => (reads.data?.[i]?.status === "success" ? reads.data[i].result as bigint : 0n);
    const positions = new Map<number, Position>();
    // Users receive 88% of pending rewards (same split as the pool page).
    LIVE_POOLS.forEach((p, i) => positions.set(p.pid, { staked: value(1 + i * 3), pending: value(2 + i * 3) * 88n / 100n, contributed: value(3 + i * 3) }));
    return { balance: value(0), positions };
  }, [reads.data]);

  // --- Analytics: live staked total per pool (cheap), daily history only once someone asks ---
  const poolInfo = useReadContracts({
    contracts: LIVE_POOLS.map(p => ({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "getPoolInfo" as const, args: [BigInt(p.pid)] as const })),
    query: { staleTime: 60_000 },
  });
  const poolStaked = useMemo(() => {
    if (!poolInfo.data) return null;
    const map = new Map<number, number>();
    LIVE_POOLS.forEach((p, i) => {
      const r = poolInfo.data[i];
      if (r?.status === "success") map.set(p.pid, Number(formatUnits((r.result as readonly [string, bigint])[1], 18)));
    });
    return map;
  }, [poolInfo.data]);
  const [wantHistory, setWantHistory] = useState(false);
  const analytics = useQuery({ queryKey: ["analytics-snapshot"], queryFn: ({ signal }) => fetchAnalytics(signal), enabled: wantHistory, staleTime: 3_600_000, retry: 1 });

  const usd = (raw: bigint) => {
    if (!price || raw === 0n) return "";
    const value = Number(formatUnits(raw, 18)) * price;
    return value < 0.01 ? " (<$0.01)" : ` (~$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  };

  // --- Conversation state ---
  const nextId = useRef(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);              // a command missing its pool or amount
  const [waiting, setWaiting] = useState<Draft | null>(null);          // waiting on the wallet or its balances
  const [statsWaiting, setStatsWaiting] = useState<Stats | null>(null); // waiting on the analytics history
  const [autoWaiting, setAutoWaiting] = useState<"on" | "off" | "status" | null>(null); // waiting on the wallet
  const autoWatch = useRef<"on" | "off" | null>(null);                    // the change the open dialog was asked for
  const [confirm, setConfirm] = useState<Action | null>(null);
  const scroller = useRef<HTMLDivElement>(null);  // the conversation; the title and message box stay put
  const confirmCard = useRef<HTMLDivElement>(null);
  const shownMessages = useRef(0);
  const say = (from: Message["from"], body: ReactNode, chips?: string[]) => setMessages(m => [...m, { id: nextId.current++, from, body, chips }]);
  const lines = (list: string[]) => list.map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>);
  // Bring the first new thing (the user's message with its reply, or a new confirm card) to the top
  // of the conversation, so long answers are read from their beginning rather than their end.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const firstNew = messages.length > shownMessages.current ? messages[shownMessages.current] : null;
    shownMessages.current = messages.length;
    const target = firstNew ? box.querySelector<HTMLElement>(`[data-msg="${firstNew.id}"]`) : confirm ? confirmCard.current : null;
    if (target) box.scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior: "smooth" });
  }, [messages, confirm]);

  const connect = () => {
    if (miniWallet.viewOnly) { void miniWallet.connectViewed(); return; }
    // The mini app connects on its own; never flash RainbowKit inside it.
    if (!isMiniAppRuntime()) openConnectModal?.();
  };

  const toRaw = (amount: CommandAmount, kind: "stake" | "unstake", pid: number): bigint | string => {
    const base = kind === "stake" ? balance : positions.get(pid)?.staked ?? 0n;
    if (amount.unit === "all") return base;
    if (amount.unit === "percent") return base * BigInt(Math.round(Number(amount.value) * 100)) / 10_000n;
    let value = amount.value;
    if (amount.unit === "usd") {
      if (!price) return "I can't get the OBN price right now, so try the amount in OBN instead.";
      value = (Number(value) / price).toFixed(6);
    }
    const [int, frac = ""] = value.split(".");
    return parseUnits(`${int}.${frac.slice(0, 18) || "0"}`, 18);
  };

  /** "1M to each nonprofit" / "split 11M across all": one card, one approval at most, a deposit per nonprofit. */
  const resolveEach = (cmd: Extract<Draft, { kind: "stakeEach" }>) => {
    const own = (pid: number) => getPoolMeta(pid)?.ethereumAddress.toLowerCase() === account!.toLowerCase();
    const requested = cmd.pids.length ? cmd.pids : LIVE_POOLS.map(p => p.pid);
    const targets = requested.filter(pid => !own(pid)); // a nonprofit's own wallet can't stake into its own pool
    if (targets.length === 0) return say("bot", "There's no nonprofit this wallet can stake into.");
    const n = BigInt(targets.length);
    // all / percent always mean a total of the wallet shared evenly; "split" makes any amount a total.
    const asTotal = cmd.split || cmd.amount?.unit === "all" || cmd.amount?.unit === "percent";
    if (!cmd.amount) {
      setDraft(cmd);
      return say("bot", displayText(asTotal
        ? `How much in total do you want to split across ${targets.length} nonprofits?`
        : `How much do you want to stake to each of the ${targets.length} nonprofits? Say an OBN or dollar amount.`), asTotal ? ["25%", "50%", "all"] : undefined);
    }
    setDraft(null);
    const raw = toRaw(cmd.amount, "stake", targets[0]);
    if (typeof raw === "string") return say("bot", raw);
    const per = asTotal ? raw / n : raw;
    const total = per * n;
    if (per <= 0n) return say("bot", balance === 0n ? "You don't have any OBN in your wallet to stake." : "That amount is too small to split that many ways.");
    if (total > balance) {
      return say("bot", displayText(`That's ${fmt(total)} OBN in total (${fmt(per)} × ${targets.length}), but you have ${fmt(balance)} OBN${usd(balance)} in your wallet.`));
    }
    if (targets.length < requested.length) say("bot", `I left out ${requested.filter(own).map(poolName).join(", ")}, since this is its own nonprofit wallet.`);
    setConfirm({ kind: "stakeEach", pid: -1, amount: total, items: targets.map(pid => ({ pid, amount: per })), share: Number(total * 10_000n / balance) / 100 });
  };

  /** A move is an unstake from one nonprofit, then (as a second confirmation) a stake into another. */
  const resolveMove = (cmd: Extract<Draft, { kind: "move" }>) => {
    const own = (pid: number | null) => pid !== null && getPoolMeta(pid)?.ethereumAddress.toLowerCase() === account!.toLowerCase();
    if (cmd.from === null) {
      const staked = LIVE_POOLS.filter(p => p.pid !== cmd.to && (positions.get(p.pid)?.staked ?? 0n) > 0n);
      if (staked.length === 1) return resolveMove({ ...cmd, from: staked[0].pid });
      if (staked.length === 0) return say("bot", displayText("You don't have anything staked to move yet."));
      setDraft(cmd);
      return say("bot", displayText("Move from which nonprofit? You have stakes with:"), staked.map(p => short(p.pid)));
    }
    if (cmd.to === null) {
      setDraft(cmd);
      return say("bot", `Move to which nonprofit?`, LIVE_POOLS.filter(p => p.pid !== cmd.from).map(p => short(p.pid)));
    }
    if (cmd.from === cmd.to) return say("bot", "Those are the same nonprofit. Pick a different one to move to.");
    for (const pid of [cmd.from, cmd.to]) {
      if (own(pid)) return say("bot", displayText(`This is ${poolName(pid)}'s nonprofit wallet, so it can only claim from ${poolName(pid)}, not stake or unstake there.`));
    }
    const staked = positions.get(cmd.from)?.staked ?? 0n;
    if (staked === 0n) return say("bot", displayText(`You don't have anything staked in ${poolName(cmd.from)}.`));
    if (!cmd.amount) {
      setDraft(cmd);
      return say("bot", displayText(`How much do you want to move? You have ${fmt(staked)} OBN${usd(staked)} staked in ${poolName(cmd.from)}.`), ["25%", "50%", "all"]);
    }
    setDraft(null);
    const amount = toRaw(cmd.amount, "unstake", cmd.from);
    if (typeof amount === "string") return say("bot", amount);
    if (amount <= 0n) return say("bot", "That amount is too small to move.");
    if (amount > staked) {
      const asked = cmd.amount.unit === "usd" ? `$${cmd.amount.value} is about ${fmt(amount)} OBN, but you` : "You";
      return say("bot", displayText(`${asked} have ${fmt(staked)} OBN${usd(staked)} staked in ${poolName(cmd.from)}.`));
    }
    say("bot", displayText(`Moving takes two confirmations: first the unstake from ${poolName(cmd.from)}, then the stake into ${poolName(cmd.to)}.`));
    setConfirm({ kind: "unstake", pid: cmd.from, amount, share: Number(amount * 10_000n / staked) / 100, moveTo: cmd.to, step: 1 });
  };

  /**
   * "the nonprofit with the least stake": rank the candidates, say which one it is and why,
   * then carry on with that nonprofit named, so the confirm card shows the real name.
   */
  const resolvePick = (cmd: Extract<Draft, { kind: "stake" | "unstake" | "claim" }>) => {
    const pick = cmd.pick!;
    const own = (pid: number) => getPoolMeta(pid)?.ethereumAddress.toLowerCase() === account!.toLowerCase();
    // Unstakes and claims only make sense where the user has something; stakes can go anywhere but their own nonprofit.
    const candidates = LIVE_POOLS.map(p => p.pid).filter(pid =>
      cmd.kind === "unstake" || pick.by === "mine" ? (positions.get(pid)?.staked ?? 0n) > 0n
      : cmd.kind === "claim" ? (positions.get(pid)?.pending ?? 0n) > 0n
      : !own(pid));
    if (candidates.length === 0) {
      return say("bot", cmd.kind === "claim" ? "You don't have any rewards to claim yet." : displayText("You don't have anything staked yet."));
    }
    const snapshot = analytics.data;
    const needsHistory = cmd.kind !== "claim" && (pick.by === "stakers" || pick.by === "contributed");
    if ((needsHistory && !snapshot && !analytics.isError) || (cmd.kind !== "claim" && pick.by === "staked" && !poolStaked)) {
      if (needsHistory) setWantHistory(true);
      return setWaiting(cmd);   // picked up again once the numbers arrive
    }
    const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
    // Claims rank by the user's own rewards; "my biggest position" by the user's own stake.
    const by = cmd.kind === "claim" ? "rewards" : pick.by;
    const value = (pid: number): number | null => {
      if (by === "rewards") return Number(formatUnits(positions.get(pid)?.pending ?? 0n, 18));
      if (by === "mine") return Number(formatUnits(positions.get(pid)?.staked ?? 0n, 18));
      if (by === "staked") return poolStaked?.get(pid) ?? null;
      const p = snapshot?.pools?.[pid];
      if (!p) return null;
      return by === "stakers" ? p.rows.at(-1)?.activeStakers ?? null : p.contributions + p.seedClaims + p.annualAwards;
    };
    const ranked = candidates.map(pid => ({ pid, v: value(pid) })).filter((r): r is { pid: number; v: number } => r.v !== null);
    if (ranked.length === 0) return say("bot", "I can't load those numbers right now. Try naming the nonprofit instead.");
    ranked.sort((a, b) => pick.order === "least" ? a.v - b.v : b.v - a.v);
    const chosen = ranked[0];
    const amount = by === "stakers" ? `${chosen.v.toLocaleString("en-US")} ${chosen.v === 1 ? "staker" : "stakers"}` : `${compact.format(chosen.v)} OBN`;
    const label = {
      staked: `the ${pick.order} staked`, stakers: `the ${pick.order === "least" ? "fewest" : "most"} stakers`, contributed: `the ${pick.order} contributed so far`,
      mine: `your ${pick.order === "least" ? "smallest" : "largest"} stake`, rewards: `your ${pick.order === "least" ? "smallest" : "largest"} rewards`,
    }[by];
    say("bot", displayText(`${poolName(chosen.pid)} has ${label} (${amount}), so I'll use that one.`));
    resolve({ ...cmd, pid: chosen.pid, pick: undefined } as Draft);
  };

  /** Turn a complete-or-partial command into a confirm card, a follow-up question, or an answer. */
  const resolve = (cmd: Draft) => {
    if (!account || !loaded) {
      setWaiting(cmd);
      if (!account) { say("bot", "Connect your wallet and I'll pick this up right after."); connect(); }
      return;
    }
    // Same rule as the pool page: a nonprofit's own wallet can only claim from its own pool.
    const ownPool = (pid: number | null) => pid !== null && getPoolMeta(pid)?.ethereumAddress.toLowerCase() === account.toLowerCase();
    const ownRefusal = (pid: number) => say("bot", displayText(`This is ${poolName(pid)}'s nonprofit wallet, so it can only claim from ${poolName(pid)}, not stake or unstake there.`));
    if (cmd.kind === "move") return resolveMove(cmd);
    if (cmd.kind === "stakeEach") return resolveEach(cmd);
    if (cmd.pid === null && cmd.pick) return resolvePick(cmd);
    if (cmd.kind !== "claim" && ownPool(cmd.pid)) return ownRefusal(cmd.pid!);
    if (cmd.kind === "claim" && cmd.pid === null && cmd.all) {
      const withRewards = LIVE_POOLS.filter(p => (positions.get(p.pid)?.pending ?? 0n) > 0n);
      if (withRewards.length === 0) return say("bot", "You don't have any rewards to claim yet.");
      if (withRewards.length === 1) return resolve({ kind: "claim", pid: withRewards[0].pid });
      setDraft(null);
      const total = withRewards.reduce((sum, p) => sum + (positions.get(p.pid)?.pending ?? 0n), 0n);
      return setConfirm({ kind: "claimAll", pid: -1, pids: withRewards.map(p => p.pid), amount: total });
    }
    if (cmd.pid === null && cmd.kind !== "stake") {
      // Claims and unstakes only make sense where the user actually has something.
      const where = LIVE_POOLS.filter(p => cmd.kind === "claim" ? (positions.get(p.pid)?.pending ?? 0n) > 0n : (positions.get(p.pid)?.staked ?? 0n) > 0n);
      if (where.length === 1) return resolve({ ...cmd, pid: where[0].pid });
      if (where.length === 0) return say("bot", cmd.kind === "claim" ? "You don't have any rewards to claim yet." : displayText("You don't have anything staked yet."));
      setDraft(cmd);
      return say("bot", cmd.kind === "claim" ? "Which one? You have rewards with:" : displayText("Which one? You have stakes with:"),
        [...where.map(p => short(p.pid)), ...(cmd.kind === "claim" ? ["all of them"] : [])]);
    }
    if (cmd.pid === null) {
      setDraft(cmd);
      return say("bot", "Which nonprofit?", LIVE_POOLS.map(p => short(p.pid)));
    }
    const position = positions.get(cmd.pid) ?? { staked: 0n, pending: 0n, contributed: 0n };
    if (cmd.kind === "claim") {
      if (position.pending === 0n) return say("bot", `You don't have rewards to claim from ${poolName(cmd.pid)}.`);
      setDraft(null);
      return setConfirm({ kind: "claim", pid: cmd.pid, amount: position.pending });
    }
    if (!cmd.amount) {
      setDraft(cmd);
      return say("bot", displayText(`How much do you want to ${cmd.kind}? Say an OBN amount, a dollar amount like $5, a percentage, or "all".`), ["25%", "50%", "all", "$1"]);
    }
    setDraft(null);
    const amount = toRaw(cmd.amount, cmd.kind, cmd.pid);
    if (typeof amount === "string") return say("bot", amount);
    if (amount <= 0n) {
      return say("bot", cmd.kind === "stake" ? "You don't have any OBN in your wallet to stake." : displayText(`You don't have anything staked in ${poolName(cmd.pid)}.`));
    }
    // Dollar requests can be far more OBN than people expect, so show the conversion.
    const asked = cmd.amount.unit === "usd" ? `$${cmd.amount.value} is about ${fmt(amount)} OBN, but you` : "You";
    if (cmd.kind === "stake" && amount > balance) {
      return say("bot", `${asked} only have ${fmt(balance)} OBN${usd(balance)} in your wallet.`);
    }
    if (cmd.kind === "unstake" && amount > position.staked) {
      return say("bot", displayText(`${asked} have ${fmt(position.staked)} OBN${usd(position.staked)} staked in ${poolName(cmd.pid)}.`));
    }
    const base = cmd.kind === "stake" ? balance : position.staked;
    setConfirm({ kind: cmd.kind, pid: cmd.pid, amount, share: Number(amount * 10_000n / base) / 100 });
  };

  const autoLine = () => autoClaim.visible && autoClaim.known ? [`Monthly auto-claim: ${autoClaim.enabled ? "on" : "off"}`] : [];

  const status = (pid: number | null) => {
    if (!account) {
      say("bot", <>Connect your wallet to see your positions. <button type="button" className="underline font-semibold" onClick={connect}>Connect</button></>);
      return;
    }
    if (!loaded) return say("bot", "Still loading your positions. Try again in a moment.");
    if (pid !== null) {
      const p = positions.get(pid)!;
      return say("bot", lines([
        poolName(pid),
        `${displayText("Staked")}: ${fmt(p.staked)} OBN${usd(p.staked)}`,
        `Rewards to claim: ${fmt(p.pending)} OBN${usd(p.pending)}`,
        `You've contributed: ${fmt(p.contributed)} OBN${usd(p.contributed)}`,
      ]));
    }
    const active = LIVE_POOLS.filter(p => { const x = positions.get(p.pid)!; return x.staked > 0n || x.pending > 0n; });
    say("bot", lines([
      `Wallet: ${fmt(balance)} OBN${usd(balance)}`,
      ...(active.length === 0
        ? [displayText("You're not staking with any nonprofit yet. Try \"stake 1,000 OBN to St Jude\".")]
        : active.map(p => { const x = positions.get(p.pid)!; return `• ${p.name}: ${fmt(x.staked)} OBN ${displayText("staked")}, ${fmt(x.pending)} to claim`; })),
      ...autoLine(),
    ]));
  };

  const stats = (cmd: Stats) => {
    const needsHistory = cmd.metric !== "price" && cmd.metric !== "pools";
    if (needsHistory && !analytics.data && !analytics.isError) {
      setWantHistory(true);
      setStatsWaiting(cmd);
      return;
    }
    const answer = answerStats(cmd, POOLS, { snapshot: analytics.data ?? null, poolStaked, price: price ?? null, change24h: obnTicker?.change24h ?? null });
    const chips = cmd.pids.length === 1 && !cmd.rank ? [`stake to ${short(cmd.pids[0])}`] : cmd.pids.length === 0 && !cmd.rank && cmd.metric === "overview" ? ["top 3 by stakers", "top 3 by contributions"] : undefined;
    say("bot", lines(answer.map(displayText)), chips);
  };

  // Auto-claim: the page only opens the existing confirmation dialog; that component does the work.
  const handleAutoclaim = (mode: "on" | "off" | "status") => {
    if (!account) {
      setAutoWaiting(mode);
      say("bot", "Connect your wallet and I'll pick this up right after.");
      connect();
      return;
    }
    if (!autoClaim.visible) return say("bot", "Monthly auto-claim isn't available yet.");
    if (!autoClaim.known) { setAutoWaiting(mode); return; }
    const explain = "It claims your rewards from every nonprofit on the 14th of each month, sponsored by OBN.";
    if (mode === "status") {
      return say("bot", `Monthly auto-claim is ${autoClaim.enabled ? "on" : "off"}. ${explain}`, [autoClaim.enabled ? "turn off auto claim" : "turn on auto claim"]);
    }
    const want = mode === "on";
    if (autoClaim.enabled === want) return say("bot", `Monthly auto-claim is already ${mode}.`);
    if (autoClaim.viewOnly) { autoClaim.open(); return; }
    if (!autoClaim.ready) return say("bot", "Switch your wallet to Base first, then try again.");
    if (want && autoClaim.needsStake) {
      // Right after a stake, the auto-claim check can lag for a few seconds; wait for it.
      if (LIVE_POOLS.some(p => (positions.get(p.pid)?.staked ?? 0n) > 0n)) {
        if (autoWaiting !== "on") say("bot", "One moment while I confirm your stake…");
        setAutoWaiting("on");
        return;
      }
      return say("bot", displayText("Stake with a nonprofit first, then you can turn on auto-claim."));
    }
    if (want && !autoClaim.available) return say("bot", "Auto-claim is temporarily unavailable. Please try again later.");
    say("bot", want ? `Okay. ${explain} Please confirm below.` : "Okay, please confirm below.");
    autoWatch.current = mode;
    autoClaim.open();
  };

  // Report what happened once the auto-claim dialog closes.
  const dialogWasOpen = useRef(false);
  useEffect(() => {
    if (autoClaim.prompt) { dialogWasOpen.current = true; return; }
    const wanted = autoWatch.current;
    if (!dialogWasOpen.current || autoClaim.busy || !wanted) return;
    dialogWasOpen.current = false;
    autoWatch.current = null;
    const changed = autoClaim.enabled === (wanted === "on");
    say("bot", changed ? `Monthly auto-claim is now ${wanted}.` : `No change: auto-claim is still ${autoClaim.enabled ? "on" : "off"}.`);
  }, [autoClaim.prompt, autoClaim.busy, autoClaim.enabled]);

  // Pick up requests that were waiting on the wallet, its balances or the analytics history.
  useEffect(() => {
    if (!waiting || !loaded) return;
    setWaiting(null);
    resolve(waiting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, loaded, analytics.data, analytics.isError, poolStaked]);
  useEffect(() => {
    if (!autoWaiting || !account || (autoClaim.visible && !autoClaim.known)) return;
    setAutoWaiting(null);
    handleAutoclaim(autoWaiting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWaiting, account, autoClaim.known, autoClaim.visible, autoClaim.needsStake]);
  useEffect(() => {
    if (!statsWaiting || (!analytics.data && !analytics.isError)) return;
    const cmd = statsWaiting;
    setStatsWaiting(null);
    stats(cmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsWaiting, analytics.data, analytics.isError]);

  // Links into Oliver: /ask?pool=7 starts on that nonprofit; /ask?q=... fills in the message box.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const pid = Number(params.get("pool"));
    if (params.get("pool") !== null && LIVE_POOLS.some(p => p.pid === pid)) {
      const name = short(pid);
      say("bot", `What would you like to do with ${poolName(pid)}?`, [`stake to ${name}`, `unstake from ${name}`, `claim from ${name}`, `how is ${name} doing?`]);
    }
    const q = params.get("q");
    if (q) setInput(q.slice(0, 280));
  }, []);

  /** A short FAQ answer with links to read more; external links open through the mini app when inside one. */
  const answerFaq = (topic: FaqTopic) => {
    const entry = FAQ[topic];
    const link = (l: { label: string; href: string }) => l.href.startsWith("/")
      ? <Link key={l.href} className="underline font-semibold" href={l.href}>{l.label}</Link>
      : <a key={l.href} className="underline font-semibold" href={l.href} target="_blank" rel="noopener noreferrer"
          onClick={e => { if (isMiniAppRuntime()) { e.preventDefault(); void sdk.actions.openUrl(l.href); } }}>{l.label}</a>;
    say("bot", <>
      {lines(entry.lines.map(displayText))}
      {entry.links && <><br />{entry.links.map((l, i) => <span key={l.href}>{i > 0 && " · "}{link(l)}</span>)}</>}
    </>, entry.chips);
  };

  const help = () => say("bot", lines([
    "Here's what I can do:",
    displayText("• Stake: \"stake 10,000 OBN to St Jude\" or \"stake $5 to charity water\""),
    displayText("• Unstake: \"unstake half from Tor\" or \"unstake $5 from St Jude\""),
    displayText("• Move: \"move 100 from Tor to St Jude\""),
    displayText("• Several at once: \"stake 1,000 OBN to each nonprofit\" or \"split 10,000 across all\""),
    "• Claim rewards: \"claim from Khan Academy\" or \"claim all\"",
    "• Auto-claim: \"turn on auto claim\" or \"is auto claim on?\"",
    displayText("• Your positions: \"what am I staking?\""),
    "• Stats: \"how many people stake with St Jude?\", \"top 3 by contributions\", \"OBN price\"",
    "• Questions: \"what is the APY?\", \"are there fees?\", \"can I unstake anytime?\"",
    displayText("Every action is shown here first and signed in your own wallet."),
  ]), EXAMPLES);

  const submit = (text: string) => {
    const trimmed = text.trim().slice(0, 280);
    if (!trimmed || actions.busy) return;
    say("user", trimmed);
    setInput("");
    let cmd = parseCommand(trimmed, POOLS, { pending: draft?.kind ?? null });

    if (cmd.kind === "confirm") {
      if (confirm) return void run(confirm);
      return say("bot", "There's nothing waiting for you to confirm.");
    }
    if (cmd.kind === "cancel") {
      if (confirm) { setConfirm(null); return say("bot", confirm.step === 2 ? displayText("Okay, I won't stake it. The unstaked OBN is in your wallet.") : "Cancelled. Nothing was sent to your wallet."); }
      if (draft || waiting || autoWaiting) { setDraft(null); setWaiting(null); setAutoWaiting(null); return say("bot", "Okay, dropped that."); }
      return say("bot", "Nothing to cancel.");
    }
    setConfirm(null);

    // Merge a follow-up ("St Jude", "$5") into the request it completes.
    if (draft && cmd.kind === draft.kind) {
      if (cmd.kind === "move" && draft.kind === "move") {
        // A reply names one nonprofit: it fills whichever end of the move was missing.
        const both = cmd.from !== null && cmd.to !== null;
        const given = cmd.from ?? cmd.to;
        const from = both ? cmd.from : draft.from ?? given;
        const to = both ? cmd.to : draft.from === null ? draft.to : draft.to ?? given;
        cmd = { kind: "move", from, to, amount: cmd.amount ?? draft.amount };
      } else if (cmd.kind === "stakeEach" && draft.kind === "stakeEach") {
        cmd = { ...draft, amount: cmd.amount ?? draft.amount };
      } else if (cmd.kind === "claim" && draft.kind === "claim") {
        cmd = { kind: "claim", pid: cmd.pid ?? draft.pid, ...(cmd.all ? { all: true as const } : {}) };
      } else if ((cmd.kind === "stake" || cmd.kind === "unstake") && (draft.kind === "stake" || draft.kind === "unstake")) {
        cmd = { kind: draft.kind, pid: cmd.pid ?? draft.pid, amount: cmd.amount ?? draft.amount };
      }
    }
    if (cmd.kind !== "unknown") setDraft(null);

    switch (cmd.kind) {
      case "help": return help();
      case "faq": return answerFaq(cmd.topic);
      case "greet": return say("bot", "Hi, I'm Oliver! I can stake, unstake and claim for you, manage auto-claim, and answer questions about OBN.", EXAMPLES);
      case "thanks": return say("bot", "You're welcome!");
      case "status": return status(cmd.pid);
      case "stats": return stats(cmd);
      case "autoclaim": return handleAutoclaim(cmd.mode);
      case "unknown": {
        if (cmd.reason === "transfer") return say("bot", "I can't send OBN to other wallets. I can only stake, unstake and claim with the nonprofits here.");
        if (cmd.reason === "swap") return say("bot", <>I can&apos;t buy or swap tokens, but the <Link className="underline" href="/trade">Trade page</Link> can.</>);
        if (cmd.reason === "multiple") return say("bot", "One thing at a time, please: one action with one nonprofit per message.");
        if (cmd.reason === "negated") return say("bot", "Okay, I won't do that.");
        // Anonymous record of what people ask that Oliver can't read yet, to teach him later.
        try { track("oliver_unrecognized", { text: scrub(trimmed) }); } catch { /* analytics is optional */ }
        return say("bot", "I didn't catch that. Here are some things you can try:", EXAMPLES);
      }
      case "move": return resolve(cmd);
      case "stakeEach": return resolve(cmd);
      case "stake":
      case "unstake":
      case "claim": {
        // A typo that could be two nonprofits: ask rather than guess.
        const options = cmd.pid === null ? ambiguousPools(trimmed, POOLS) : [];
        if (options.length > 1) { setDraft(cmd); return say("bot", "Did you mean:", options.map(short)); }
        return resolve(cmd);
      }
    }
  };

  const run = async (action: Action) => {
    setConfirm(null);
    if (action.kind === "claimAll") {
      const pids = action.pids ?? [];
      const { done } = await actions.claimMany(pids);
      if (done.length === 0) return say("bot", "That didn't go through. Nothing was changed.");
      await new Promise(r => setTimeout(r, 1_250));
      await reads.refetch();
      return say("bot", done.length === pids.length
        ? `Claimed your rewards from ${done.length} nonprofits.`
        : `Claimed from ${done.map(poolName).join(", ")}. The rest didn't go through; say "claim all" to try them again.`);
    }
    if (action.kind === "stakeEach") {
      const items = action.items ?? [];
      const { done } = await actions.stakeMany(items);
      if (done.length === 0) return say("bot", "That didn't go through. Nothing was changed.");
      await new Promise(r => setTimeout(r, 1_250));
      await Promise.all([reads.refetch(), poolInfo.refetch()]);
      const per = items[0]?.amount ?? 0n;
      return say("bot", displayText(done.length === items.length
        ? `Staked ${fmt(per)} OBN to each of ${done.length} nonprofits (${fmt(per * BigInt(done.length))} OBN in total).`
        : `Staked ${fmt(per)} OBN to ${done.map(poolName).join(", ")}. The others didn't go through; ask me again to stake to the rest.`),
        autoClaim.visible && autoClaim.known && !autoClaim.enabled ? ["turn on auto claim"] : undefined);
    }
    const ok = action.kind === "stake" ? await actions.stake(action.pid, action.amount)
      : action.kind === "unstake" ? await actions.unstake(action.pid, action.amount)
      : await actions.claim(action.pid);
    if (!ok) return say("bot", action.step === 2 ? displayText("The stake didn't go through. The unstaked OBN is still in your wallet.") : "That didn't go through. Nothing was changed.");
    await new Promise(r => setTimeout(r, 1_250));
    await Promise.all([reads.refetch(), poolInfo.refetch()]);
    if (action.moveTo !== undefined) {
      say("bot", displayText(`Step 1 done: unstaked ${fmt(action.amount)} OBN from ${poolName(action.pid)}. Now confirm step 2 to stake it into ${poolName(action.moveTo)}.`));
      return setConfirm({ kind: "stake", pid: action.moveTo, amount: action.amount, step: 2 });
    }
    const verb = { stake: "Staked", unstake: "Unstaked", claim: "Claimed" }[action.kind];
    say("bot", <>{displayText(verb)} {fmt(action.amount)} OBN{action.kind === "stake" ? " to " : " from "}{poolName(action.pid)}. <Link className="underline" href={`/stake-earn-contribute/${action.pid}`}>View pool</Link></>,
      action.kind === "stake" && autoClaim.visible && autoClaim.known && !autoClaim.enabled ? ["turn on auto claim"] : undefined);
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit(input); };
  const confirmLabel = !confirm ? null
    : confirm.kind === "claimAll" ? `Claim ${fmt(confirm.amount)} OBN${usd(confirm.amount)} in rewards from ${confirm.pids?.length} nonprofits`
    : confirm.kind === "stakeEach" ? displayText(`Stake ${fmt(confirm.items?.[0]?.amount ?? 0n)} OBN to each of ${confirm.items?.length} nonprofits (${fmt(confirm.amount)} OBN${usd(confirm.amount)} in total)`)
    : displayText(`${confirm.step ? `Step ${confirm.step} of 2: ` : ""}${{ stake: "Stake", unstake: "Unstake", claim: "Claim" }[confirm.kind]} ${fmt(confirm.amount)} OBN${usd(confirm.amount)} ${confirm.kind === "stake" ? "to" : "from"} ${poolName(confirm.pid)}`);
  const busy = actions.busy;
  const chipStyle = { borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)", color: "var(--card-text)" };

  return (
    // Fixed-height page: only the conversation scrolls, between the title and the message box.
    <div className="page-bg flex flex-col overflow-hidden" style={{ height: "calc(100dvh - var(--obn-header-h))", minHeight: 0 }}>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4 pt-4">
        {/* Title and Oliver on the left, what he is on the right; stacked on the narrowest phones. */}
        <header className="mb-3 flex shrink-0 items-center gap-3 max-[359px]:flex-col max-[359px]:gap-1 max-[359px]:text-center">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold whitespace-nowrap" style={{ color: "var(--card-text)" }}>
            Ask Oliver
            {/* In dark mode a soft light outline keeps his thin black arms and legs visible. */}
            <Image src="/oliver.png" alt="" width={44} height={44} priority
              style={theme === "dark" ? { filter: "drop-shadow(0 0 1px rgba(255,255,255,0.9)) drop-shadow(0 0 1px rgba(255,255,255,0.9))" } : undefined} />
          </h1>
          <p className="min-w-0 flex-1 border-l pl-3 text-xs max-[359px]:border-l-0 max-[359px]:pl-0" style={{ color: "var(--card-subtext)", borderColor: "var(--card-border)" }}>
            {displayText("Oliver is a rule-based bot here to assist you. Type what you want to do. Nothing happens until you confirm and sign in your wallet.")}
          </p>
        </header>
        <div className="shrink-0"><TransactionRecovery control={actions.tx} /></div>

        <div ref={scroller} className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-2" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {EXAMPLES.map(e => (
                <button key={e} type="button" onClick={() => submit(e)} className="rounded-full border px-3 py-1.5 text-xs transition hover:opacity-80" style={chipStyle}>
                  {displayText(e)}
                </button>
              ))}
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} data-msg={m.id} className={`flex flex-col gap-1.5 max-w-[85%] ${m.from === "user" ? "self-end items-end" : "self-start items-start"}`}>
              <div className={`rounded-2xl px-3.5 py-2 text-sm wrap-break-word ${m.from === "user" ? "text-white" : "border"}`}
                style={m.from === "user" ? { backgroundColor: "#0D9921" } : { borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)", color: "var(--card-text)" }}>
                {m.body}
              </div>
              {m.chips && (
                <div className="flex flex-wrap gap-1.5">
                  {m.chips.map(c => (
                    <button key={c} type="button" disabled={busy} onClick={() => submit(c)} className="rounded-full border px-2.5 py-1 text-xs transition hover:opacity-80 disabled:opacity-50" style={chipStyle}>
                      {displayText(c)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {confirm && (
            <div ref={confirmCard} className="self-stretch rounded-xl border p-3 text-sm" style={{ borderColor: "#0D9921", backgroundColor: "var(--card-bg)", color: "var(--card-text)" }}>
              <p className="font-semibold mb-2">{confirmLabel}?</p>
              {confirm.kind === "stakeEach" && (
                <p className="mb-2 text-xs" style={{ color: "var(--card-subtext)" }}>
                  {confirm.items?.map(item => short(item.pid)).join(" · ")}
                  {!actions.canBatch && <><br />Your wallet will ask you to confirm once per nonprofit ({confirm.items?.length} times), plus one approval if needed.</>}
                </p>
              )}
              {confirm.kind === "claimAll" && !actions.canBatch && (
                <p className="mb-2 text-xs" style={{ color: "var(--card-subtext)" }}>Your wallet will ask you to confirm {confirm.pids?.length} times, once per nonprofit.</p>
              )}
              {confirm.share !== undefined && confirm.share >= 50 && (
                <p className="mb-2 text-xs font-semibold" style={{ color: theme === "dark" ? "#fbbf24" : "#d97706" }}>
                  {displayText(`That's ${confirm.share >= 99.99 ? "all" : `${Math.round(confirm.share)}%`} of ${confirm.kind === "stake" || confirm.kind === "stakeEach" ? "the OBN in your wallet" : `your stake in ${poolName(confirm.pid)}`}.`)}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => void run(confirm)} className="flex-1 rounded-lg py-2 text-xs font-semibold text-white bg-[#0D9921] hover:opacity-90">Confirm</button>
                <button type="button" onClick={() => { setConfirm(null); say("bot", "Cancelled. Nothing was sent to your wallet."); }} className="flex-1 rounded-lg border py-2 text-xs font-semibold hover:opacity-80" style={{ borderColor: "var(--card-border)" }}>Cancel</button>
              </div>
            </div>
          )}
          {(statsWaiting || (waiting && loaded)) && <p className="self-start text-xs" style={{ color: "var(--card-subtext)" }}>Looking that up…</p>}
          {actions.busy && <p className="self-start text-xs" style={{ color: "var(--card-subtext)" }}>Waiting for your wallet…</p>}
        </div>

        {/* Lifted clear of rounded screen corners and the home indicator on phones. */}
        <form onSubmit={onSubmit} className="flex shrink-0 gap-2 pt-2" style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={displayText("e.g. stake 1,000 OBN to St Jude")}
            aria-label="Command"
            disabled={busy}
            maxLength={280}
            className="min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-2 focus:ring-green-500"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)", color: "var(--card-text)" }}
          />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-[#0D9921] px-4 text-sm font-semibold text-white disabled:opacity-50">Send</button>
        </form>
      </main>
      <AutoClaimDialog control={autoClaim} />
    </div>
  );
}
