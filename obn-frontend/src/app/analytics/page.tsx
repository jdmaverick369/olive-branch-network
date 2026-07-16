// src/app/analytics/page.tsx
"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import Image from "next/image";
import { useTheme } from "@/hooks/useTheme";
import { Loader } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DUNE_QUERIES, fetchDuneQuery } from "@/lib/dune";
import { lensAbi } from "@/lib/lensAbi";
import { LENS_PROXY } from "@/lib/contracts";
import { POOLS } from "@/lib/pools";

type NonprofitStat = {
  pid: number;
  name: string;
  logo: string;
  totalStaked: number;
  activeStakers: number;
};

interface QueryData {
  id: string;
  title: string;
  description: string;
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

interface CombinedMetric {
  title: string;
  description: string;
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

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

export default function AnalyticsPage() {
  // Override body background to match page gradient
  usePageBackground();

  const theme = useTheme();
  const [isMobileBrowser, setIsMobileBrowser] = useState(false);

  // ── Per-nonprofit stats (total staked, active stakers) — one on-chain call ──
  const { data: poolsBasic, isLoading: poolsLoading } = useReadContract({
    address: LENS_PROXY,
    abi: lensAbi,
    functionName: "listPoolsBasic",
    query: { staleTime: 30_000, refetchInterval: 30_000 },
  });

  const nonprofitStats: NonprofitStat[] = (() => {
    if (!poolsBasic) return [];
    const [, totals, uniqueCounts] = poolsBasic as readonly [
      readonly `0x${string}`[],
      readonly bigint[],
      readonly bigint[],
    ];
    return POOLS
      .filter((pool) => pool.live && totals[pool.pid] !== undefined)
      .map((pool) => ({
        pid: pool.pid,
        name: pool.name,
        logo: pool.logo,
        totalStaked: Number.parseFloat(formatUnits(totals[pool.pid], 18)),
        activeStakers: Number(uniqueCounts[pool.pid]),
      }))
      .sort((a, b) => b.totalStaked - a.totalStaked);
  })();

  useLayoutEffect(() => {
    const checkMobile = () => setIsMobileBrowser(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [queries, setQueries] = useState<QueryData[]>(
    DUNE_QUERIES.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      data: null,
      loading: true,
      error: null,
    }))
  );

  useEffect(() => {
    DUNE_QUERIES.forEach((q, i) => {
      fetchDuneQuery(q.queryId)
        .then((result) => {
          setQueries((prev) => {
            const updated = [...prev];
            updated[i] = { ...updated[i], data: result, loading: false, error: null };
            return updated;
          });
        })
        .catch((error) => {
          setQueries((prev) => {
            const updated = [...prev];
            updated[i] = { ...updated[i], loading: false, error: error instanceof Error ? error.message : "Unknown error" };
            return updated;
          });
        });
    });
  }, []);

  // Combine queries for display
  const activeStakersQuery = queries.find((q) => q.id === "active-stakers");
  const totalStakedQuery = queries.find((q) => q.id === "total-staked");
  const totalContributedQuery = queries.find((q) => q.id === "total-contributed");

  const metrics: CombinedMetric[] = [
    {
      title: "OBN Network Analytics",
      description: "Live protocol stats for active stakers, total staked, and total OBN contributed — plus total staked and active stakers by nonprofit pool.",
      data: null,
      loading: false,
      error: null,
    },
    {
      title: "Active Stakers",
      description: "Number of active users staking OBN tokens",
      data: activeStakersQuery?.data || null,
      loading: activeStakersQuery?.loading || false,
      error: activeStakersQuery?.error || null,
    },
    {
      title: "Total Staked",
      description: "Total amount of OBN tokens currently staked",
      data: totalStakedQuery?.data || null,
      loading: totalStakedQuery?.loading || false,
      error: totalStakedQuery?.error || null,
    },
    {
      title: "Total Contributed",
      description: "Cumulative OBN contributed to nonprofits over time",
      data: totalContributedQuery?.data || null,
      loading: totalContributedQuery?.loading || false,
      error: totalContributedQuery?.error || null,
    },
  ];

  const isLoading = queries.some((q) => q.loading);

  const graphCardStyle = {
    backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
    borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
    boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
  };

  function renderGraphCard(metric: CombinedMetric) {
    return (
      <div className="w-full rounded-lg border p-6 shadow-md text-center mb-2.5" style={graphCardStyle}>
        {metric.error ? (
          <>
            <h2 className="text-lg font-bold mb-1 text-center" style={{ color: "var(--card-text)" }}>{metric.title}</h2>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--card-subtext)" }}>{metric.description}</p>
            <p className="text-red-600 dark:text-red-400 text-sm py-8">{metric.error}</p>
          </>
        ) : metric.data ? (
          renderLineChartWithTitle(metric.title, metric.description, metric.data, theme, isMobileBrowser)
        ) : (
          <>
            <h2 className="text-lg font-bold mb-1 text-center" style={{ color: "var(--card-text)" }}>{metric.title}</h2>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--card-subtext)" }}>{metric.description}</p>
            <p className="py-8" style={{ color: "var(--card-subtext)" }}>No data available</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col relative page-bg" style={{ minHeight: "calc(100dvh - var(--obn-header-h))" }}>
      <main className="main-content px-4 pt-8 pb-6 flex flex-col items-center">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin" style={{ color: "#16a34a" }} />
          </div>
        ) : (
          <>
            {/* Desktop: title + subtitle */}
            {!isMobileBrowser && (
              <div className="w-full text-center mb-6 mx-auto" style={{ maxWidth: '600px' }}>
                <h1 className="font-bold mb-2 text-center" style={{ color: "var(--card-text)", fontSize: "min(7vw, 2.25rem)", whiteSpace: "nowrap" }}>{metrics[0].title}</h1>
                <p className="mb-4 text-center" style={{ color: "var(--card-subtext)" }}>{metrics[0].description}</p>
              </div>
            )}

            {/* Mobile: title + subtitle */}
            {isMobileBrowser && (
              <div className="w-full flex flex-col items-center mb-6 text-center" style={{ maxWidth: '440px' }}>
                <h2 className="text-lg font-bold mb-1 text-center" style={{ color: "var(--card-text)" }}>{metrics[0].title}</h2>
                <p className="text-sm mb-4 text-center" style={{ color: "var(--card-subtext)" }}>{metrics[0].description}</p>
              </div>
            )}

            {/* Desktop: graphs column (left) + nonprofit column (right); mobile: stacked */}
            <div className={isMobileBrowser ? "w-full" : "w-full flex flex-row justify-center items-start gap-8"}>
            {/* Graphs: single column on desktop / stacked on mobile */}
            <div className={`${isMobileBrowser ? 'w-full flex flex-col items-center' : 'flex flex-col items-center shrink-0'}`} style={isMobileBrowser ? { maxWidth: '440px', margin: '0 auto' } : { width: '440px' }}>
              {!isMobileBrowser && (
                <h2 className="text-base font-semibold mb-2.5 px-1 text-center w-full" style={{ color: "var(--card-text)" }}>
                  Network Graphs
                </h2>
              )}
              <div className="flex flex-col w-full items-center" style={{ maxWidth: '440px' }}>
                {renderGraphCard(metrics[1])}
              </div>
              <div className="flex flex-col w-full items-center" style={{ maxWidth: '440px' }}>
                {renderGraphCard(metrics[2])}
              </div>
              <div className="flex flex-col w-full items-center" style={{ maxWidth: '440px' }}>
                {renderGraphCard(metrics[3])}
              </div>
            </div>

            {/* Nonprofit pool stats — total staked + active stakers per pool */}
            <div className={isMobileBrowser ? "w-full mx-auto" : "w-full min-w-0"} style={{ maxWidth: isMobileBrowser ? '440px' : '620px' }}>
              <h2
                className={isMobileBrowser ? "text-sm font-semibold mb-2 px-1" : "text-base font-semibold mb-2.5 px-1 text-center"}
                style={{ color: "var(--card-text)" }}
              >
                Nonprofit Pools
              </h2>
              {poolsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="w-5 h-5 animate-spin" style={{ color: "#16a34a" }} />
                </div>
              ) : nonprofitStats.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "var(--card-subtext)" }}>
                  No pool data available
                </p>
              ) : (
                <div className="space-y-2.5">
                  {nonprofitStats.map((stat) => (
                    <NonprofitStatRow
                      key={stat.pid}
                      stat={stat}
                      cardStyle={graphCardStyle}
                      large={!isMobileBrowser}
                    />
                  ))}
                </div>
              )}
            </div>
            </div>{/* end desktop two-column wrapper */}

            {/* Footer */}
            <footer
              className="main-content mt-1 py-2 px-1 text-center text-[9px] italic"
              style={{ color: "var(--card-subtext)" }}
            >
              Olive Branch Network is a decentralized application and does not have any direct
              affiliation with any of the organizations displayed.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function renderLineChartWithTitle(title: string, description: string, data: Record<string, unknown>, theme: "light" | "dark", isMobileBrowser: boolean = false) {
  // Extract rows from result
  let rows: Record<string, unknown>[] = [];
  if ("result" in data && data.result && typeof data.result === "object") {
    const result = data.result as Record<string, unknown>;
    if ("rows" in result && Array.isArray(result.rows)) {
      rows = result.rows as Record<string, unknown>[];
    }
  }

  if (!rows || rows.length === 0) {
    return <p style={{ color: "var(--card-subtext)" }}>No data available</p>;
  }

  // Get the latest/highest metric value from the rows
  let latestRow = rows[0];
  let metricKey = "";
  let metricValue: unknown = 0;

  // Find the metric column (not date/day)
  const allKeys = Object.keys(latestRow);
  const metricKeyName = allKeys.find((k) => k !== "day" && k !== "date" && k !== "timestamp");

  if (metricKeyName) {
    metricKey = metricKeyName;
    // Get the most recent value (last row in the dataset)
    latestRow = rows[rows.length - 1];
    metricValue = latestRow[metricKeyName];
  }

  // Prepare chart data - show all data points from start date to latest
  const chartData = rows.map((row, idx) => {
    let dateStr = row.day || row.date || row.timestamp || "";
    // Remove time portion if present (e.g., "2024-01-01 00:00:00" -> "2024-01-01")
    if (typeof dateStr === "string" && dateStr.includes(" ")) {
      dateStr = dateStr.split(" ")[0];
    }
    // Format date as "MMM 'YY" (e.g., "Jan '24")
    let shortDate = dateStr;
    if (typeof dateStr === "string" && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month] = dateStr.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthIndex = parseInt(month, 10) - 1;
      shortDate = `${monthNames[monthIndex]} '${year.slice(2)}`;
    }
    return {
      index: idx,
      value: typeof row[metricKey] === "number" ? row[metricKey] : 0,
      date: shortDate,
      fullDate: dateStr, // Keep full date for tooltip
    };
  });

  const chartBgColor = theme === "dark" ? "#0f172a" : "#ecfdf5";

  // Build title with value - format Active Stakers as whole number
  const formattedValue = title === "Active Stakers" && typeof metricValue === "number"
    ? Number(metricValue).toLocaleString()
    : formatValue(metricValue);
  const titleWithValue = `${title}: ${formattedValue}`;

  return (
    <>
      {/* Title with value */}
      <h2 className="font-bold mb-1 text-center" style={{ color: "var(--card-text)", fontSize: "min(5vw, 1.125rem)", whiteSpace: "nowrap" }}>
        {titleWithValue}
      </h2>
      <p className="text-sm mb-4 text-center" style={{ color: "var(--card-subtext)" }}>
        {description}
      </p>

      {/* Line chart with historical data */}
      <div
        className="w-full rounded-lg overflow-hidden chart-container"
        style={{
          height: isMobileBrowser ? "180px" : "220px",
          backgroundColor: chartBgColor,
          position: "relative"
        }}
      >
        <style jsx>{`
          .chart-container :global(svg) {
            background-color: ${chartBgColor} !important;
          }
        `}</style>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 15, left: 10, bottom: 20 }}
          >
            <defs>
              <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" opacity={0.3} />
            <XAxis
              dataKey="date"
              stroke="var(--card-subtext)"
              tick={{ fontSize: 9, dy: 5 }}
              angle={-45}
              textAnchor="end"
              height={20}
              interval={Math.max(Math.floor(chartData.length / 6), 0)}
            />
            <YAxis
              stroke="var(--card-subtext)"
              tick={{ fontSize: 10 }}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                color: "var(--card-text)",
                fontSize: 12,
              }}
              formatter={(value) => formatValue(value)}
              labelFormatter={(label, payload) => {
                const fullDate = payload?.[0]?.payload?.fullDate || label;
                return `Date: ${fullDate}`;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              fill="url(#greenGradient)"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    if (value > 1000000) {
      return (value / 1000000).toFixed(2) + "M";
    }
    if (value > 1000) {
      return (value / 1000).toFixed(2) + "K";
    }
    return value.toFixed(2);
  }
  return String(value);
}

function NonprofitStatRow({
  stat,
  cardStyle,
  large = false,
}: {
  stat: NonprofitStat;
  cardStyle: React.CSSProperties;
  large?: boolean;
}) {
  const router = useRouter();

  // `large` mirrors the ~1.25x scale the profile page applies to its whole
  // page on desktop (transform: scale(1.25)), but as real sizing here instead
  // of a CSS transform — a transform on just this section would visually
  // overflow into the "About" card below without reserving layout space.
  const logoSize = large ? 30 : 24;
  const statWidth = large ? "100px" : "84px";

  return (
    <div
      className={large ? "rounded-xl border p-4 cursor-pointer hover:opacity-90 transition-opacity" : "rounded-xl border p-3 cursor-pointer hover:opacity-90 transition-opacity"}
      style={cardStyle}
      onClick={() => router.push(`/stake-earn-contribute/${stat.pid}`)}
    >
      <div className={large ? "flex items-center justify-between gap-3" : "flex items-center justify-between gap-2"}>
        {/* Logo and Name */}
        <div className={large ? "flex items-center gap-3 min-w-0 shrink" : "flex items-center gap-2 min-w-0 shrink"}>
          <Image
            src={stat.logo}
            alt={stat.name}
            width={logoSize}
            height={logoSize}
            className="rounded-full shrink-0"
          />
          <span
            className={large ? "font-semibold text-base truncate" : "font-semibold text-xs truncate"}
            style={{ color: "var(--card-text)" }}
          >
            {stat.name}
          </span>
        </div>

        {/* Stats */}
        <div className={large ? "flex items-center gap-2 shrink-0" : "flex items-center gap-1 shrink-0"}>
          <div className="text-center" style={{ width: statWidth }}>
            <p
              className={large ? "text-[11px] font-medium whitespace-nowrap" : "text-[9px] font-medium whitespace-nowrap"}
              style={{ color: "var(--card-subtext)" }}
            >
              Total Staked
            </p>
            <p
              className={large ? "text-sm font-bold" : "text-xs font-bold"}
              style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums" }}
            >
              {formatValue(stat.totalStaked)}
            </p>
          </div>
          <div className="text-center" style={{ width: statWidth }}>
            <p
              className={large ? "text-[11px] font-medium whitespace-nowrap" : "text-[9px] font-medium whitespace-nowrap"}
              style={{ color: "var(--card-subtext)" }}
            >
              Active Stakers
            </p>
            <p
              className={large ? "text-sm font-bold" : "text-xs font-bold"}
              style={{ color: "var(--card-text)", fontVariantNumeric: "tabular-nums" }}
            >
              {stat.activeStakers.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
