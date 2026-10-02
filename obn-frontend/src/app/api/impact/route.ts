import { NextResponse } from "next/server";
import { isAnalyticsSnapshot } from "@/lib/analytics";
import bundledSnapshot from "@/data/analytics.json";

// Headline protocol stats for external sites (the Squarespace homepage).
// Returns only the latest daily totals instead of the full ~400 KB history,
// and allows cross-origin reads: the data is public, read-only and uncredentialed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

async function totalSupply(): Promise<number | null> {
  try {
    // Imported lazily: the supply helper throws at load when RPC env vars are
    // missing, and supply is optional here.
    const { getTotalSupply } = await import("../supply/_lib");
    const supply = Number.parseFloat(await getTotalSupply());
    return Number.isFinite(supply) && supply > 0 ? supply : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!isAnalyticsSnapshot(bundledSnapshot)) {
    return NextResponse.json({ error: "Impact statistics are being prepared" }, {
      status: 503,
      headers: { ...headers, "Cache-Control": "no-store" },
    });
  }

  const latest = bundledSnapshot.rows[bundledSnapshot.rows.length - 1];
  return NextResponse.json({
    activeStakers: latest.activeStakers,
    totalStaked: latest.totalStaked,
    totalContributed: latest.totalContributed,
    totalSupply: await totalSupply(),
    throughTimestamp: bundledSnapshot.throughTimestamp,
  }, { headers });
}
