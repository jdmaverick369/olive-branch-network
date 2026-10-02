// Answers analytics questions for /ask ("how many people stake with St Jude?",
// "top 3 by contributions", "how much was contributed this month?").
// Pure: the page passes in the data it has loaded and renders the returned lines.
import type { Command, CommandPool } from "./commandParser";
import type { AnalyticsSnapshot } from "./analytics";

type Stats = Extract<Command, { kind: "stats" }>;

export type StatsData = {
  snapshot: AnalyticsSnapshot | null;        // daily history from /api/analytics
  poolStaked: Map<number, number> | null;     // live OBN staked per pool
  price: number | null;                       // USD per OBN
  change24h: number | null;                   // percent
};

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const obn = (n: number) => `${n >= 10_000 ? compact.format(n) : plain.format(n)} OBN`;
const count = (n: number) => n.toLocaleString("en-US");

function usd(n: number, price: number | null) {
  if (!price || n === 0) return "";
  const value = n * price;
  if (value < 0.01) return " (<$0.01)";
  return ` (~$${value >= 10_000 ? compact.format(value) : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}

function day(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The last row on or before `days` before the latest row. */
function rowAgo<T extends { day: string }>(rows: T[], days: number): T | null {
  const latest = Date.parse(`${rows[rows.length - 1].day}T00:00:00Z`);
  const target = latest - days * 86_400_000;
  for (let i = rows.length - 1; i >= 0; i--) if (Date.parse(`${rows[i].day}T00:00:00Z`) <= target) return rows[i];
  return null;
}

function change(now: number, then: number, format: (n: number) => string) {
  const diff = now - then;
  if (Math.abs(diff) < 1e-9) return "no change";
  return `${diff > 0 ? "up" : "down"} ${format(Math.abs(diff))}`;
}

const periodName = (days: number) => days === 1 ? "the last day" : days === 7 ? "the last week" : days === 30 ? "the last 30 days" : days === 365 ? "the last year" : `the last ${days} days`;

export function answerStats(cmd: Stats, pools: CommandPool[], data: StatsData): string[] {
  const live = pools.filter(p => p.live);
  const name = (pid: number) => live.find(p => p.pid === pid)?.name ?? `Pool ${pid}`;
  const snap = data.snapshot;
  const asOf = snap ? ` (as of ${day(snap.throughTimestamp)})` : "";
  const poolStakers = (pid: number) => snap?.pools?.[pid]?.rows.at(-1)?.activeStakers ?? null;
  const poolContributed = (pid: number) => {
    const p = snap?.pools?.[pid];
    return p ? p.contributions + p.seedClaims + p.annualAwards : null;
  };
  const poolStaked = (pid: number) => data.poolStaked?.get(pid) ?? null;
  const latest = snap?.rows.at(-1) ?? null;
  const totalStaked = data.poolStaked ? [...data.poolStaked.values()].reduce((a, b) => a + b, 0) : latest?.totalStaked ?? null;
  const unavailable = ["I can't load the analytics right now. Please try again in a moment."];

  if (cmd.metric === "price") {
    if (!data.price) return ["I can't get the OBN price right now."];
    const digits = data.price < 0.01 ? { maximumSignificantDigits: 3 } : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
    const move = data.change24h === null ? "" : ` (${data.change24h >= 0 ? "+" : ""}${data.change24h.toFixed(2)}% in 24h)`;
    return [`OBN is $${data.price.toLocaleString("en-US", digits)}${move}.`, "That's 1,000 OBN for about $" + (data.price * 1000).toLocaleString("en-US", { maximumSignificantDigits: 3 }) + "."];
  }

  if (cmd.metric === "pools") {
    return [`There are ${live.length} nonprofits you can stake with:`, ...live.map(p => `• ${p.name}`)];
  }

  // Rankings
  if (cmd.rank) {
    const metric = cmd.metric === "overview" ? "staked" : cmd.metric;
    const value = metric === "stakers" ? poolStakers : metric === "contributed" ? poolContributed : poolStaked;
    const rows = live.map(p => ({ pid: p.pid, v: value(p.pid) })).filter((r): r is { pid: number; v: number } => r.v !== null);
    if (rows.length === 0) return unavailable;
    rows.sort((a, b) => cmd.rank === "least" ? a.v - b.v : b.v - a.v);
    const shown = rows.slice(0, cmd.limit ?? 3);
    const label = metric === "stakers" ? "stakers" : metric === "contributed" ? "contributed so far" : "staked";
    const format = (v: number) => metric === "stakers" ? `${count(v)} ${v === 1 ? "staker" : "stakers"}` : `${obn(v)}${usd(v, data.price)}`;
    const heading = shown.length === 1
      ? `${cmd.rank === "least" ? "Fewest" : "Most"} ${label}:`
      : `${cmd.rank === "least" ? "Lowest" : "Top"} ${shown.length} by ${label}${metric === "stakers" ? asOf : ""}:`;
    return [heading, ...shown.map((r, i) => `${i + 1}. ${name(r.pid)}: ${format(r.v)}`)];
  }

  // Several nonprofits side by side
  if (cmd.pids.length > 1) {
    return cmd.pids.map(pid => {
      const parts = [
        poolStakers(pid) !== null ? `${count(poolStakers(pid)!)} stakers` : null,
        poolStaked(pid) !== null ? `${obn(poolStaked(pid)!)} staked` : null,
        poolContributed(pid) !== null ? `${obn(poolContributed(pid)!)} contributed` : null,
      ].filter(Boolean);
      return `${name(pid)}: ${parts.join(" · ") || "no data yet"}`;
    });
  }

  // One nonprofit
  if (cmd.pids.length === 1) {
    const pid = cmd.pids[0];
    const n = name(pid);
    if (cmd.metric === "stakers") {
      const now = poolStakers(pid);
      if (now === null) return unavailable;
      const line = `${count(now)} ${now === 1 ? "person is" : "people are"} staking with ${n}${asOf}.`;
      const rows = snap?.pools?.[pid]?.rows;
      const then = cmd.days && rows ? rowAgo(rows, cmd.days) : null;
      return then ? [line, `That's ${change(now, then.activeStakers, count)} over ${periodName(cmd.days!)}.`] : [line];
    }
    if (cmd.metric === "staked") {
      const now = poolStaked(pid);
      if (now === null) return unavailable;
      const share = totalStaked ? ` That's ${(now / totalStaked * 100).toFixed(1)}% of all staked OBN.` : "";
      const lines = [`${obn(now)}${usd(now, data.price)} is staked with ${n}.${share}`];
      if (cmd.days) lines.push("I only have today's staked total for each nonprofit, not its history.");
      return lines;
    }
    if (cmd.metric === "contributed") {
      const total = poolContributed(pid);
      if (total === null) return unavailable;
      const lines = [`${n} has received ${obn(total)}${usd(total, data.price)} so far${asOf}.`];
      if (cmd.days) lines.push("I only have all-time totals for each nonprofit, not a monthly breakdown.");
      return lines;
    }
    const stakers = poolStakers(pid);
    const staked = poolStaked(pid);
    const contributed = poolContributed(pid);
    if (stakers === null && staked === null && contributed === null) return unavailable;
    return [
      n,
      stakers !== null ? `Stakers: ${count(stakers)}` : null,
      staked !== null ? `Staked: ${obn(staked)}${usd(staked, data.price)}${totalStaked ? ` (${(staked / totalStaked * 100).toFixed(1)}% of all staked OBN)` : ""}` : null,
      contributed !== null ? `Contributed so far: ${obn(contributed)}${usd(contributed, data.price)}` : null,
    ].filter((l): l is string => !!l);
  }

  // Whole protocol
  if (!snap || !latest) return unavailable;
  const then = cmd.days ? rowAgo(snap.rows, cmd.days) : null;
  if (cmd.metric === "stakers") {
    const line = `${count(latest.activeStakers)} people are staking OBN${asOf}.`;
    return then ? [line, `That's ${change(latest.activeStakers, then.activeStakers, count)} over ${periodName(cmd.days!)}.`] : [line];
  }
  if (cmd.metric === "staked") {
    const now = totalStaked ?? latest.totalStaked;
    const line = `${obn(now)}${usd(now, data.price)} is staked across ${live.length} nonprofits.`;
    return then ? [line, `That's ${change(latest.totalStaked, then.totalStaked, obn)} over ${periodName(cmd.days!)}${asOf}.`] : [line];
  }
  if (cmd.metric === "contributed") {
    if (then) {
      const diff = latest.totalContributed - then.totalContributed;
      return [`${obn(diff)}${usd(diff, data.price)} went to nonprofits over ${periodName(cmd.days!)}${asOf}.`, `All-time: ${obn(latest.totalContributed)}${usd(latest.totalContributed, data.price)}.`];
    }
    return [`${obn(latest.totalContributed)}${usd(latest.totalContributed, data.price)} has gone to nonprofits so far${asOf}.`];
  }
  const leader = (value: (pid: number) => number | null) =>
    live.map(p => ({ pid: p.pid, v: value(p.pid) ?? -1 })).sort((a, b) => b.v - a.v)[0];
  const mostStaked = leader(poolStaked);
  const mostStakers = leader(poolStakers);
  return [
    `${count(latest.activeStakers)} people stake ${obn(totalStaked ?? latest.totalStaked)}${usd(totalStaked ?? latest.totalStaked, data.price)} with ${live.length} nonprofits.`,
    `${obn(latest.totalContributed)}${usd(latest.totalContributed, data.price)} has gone to nonprofits so far${asOf}.`,
    ...(mostStaked.v >= 0 ? [`Most staked: ${name(mostStaked.pid)}.`] : []),
    ...(mostStakers.v >= 0 ? [`Most stakers: ${name(mostStakers.pid)}.`] : []),
  ];
}
