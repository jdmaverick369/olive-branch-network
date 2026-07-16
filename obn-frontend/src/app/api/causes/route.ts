// src/app/api/causes/route.ts
// Returns the 3 cause categories, each with their orgs and pids.
// Sourced directly from pools.ts — single source of truth.
import { NextResponse } from "next/server";
import { POOLS, type PoolCategory } from "@/lib/pools";

const CATEGORY_LABELS: Record<PoolCategory, string> = {
  humanitarian: "Humanitarian",
  environment:  "Environment",
  animals:      "Animals",
};

export async function GET() {
  const grouped: Record<PoolCategory, { pid: number; name: string; logo: string; description: string }[]> = {
    humanitarian: [],
    environment:  [],
    animals:      [],
  };

  for (const pool of POOLS) {
    if (!pool.live) continue;
    grouped[pool.category].push({
      pid:         pool.pid,
      name:        pool.name,
      logo:        pool.logo,
      description: pool.listDescription,
    });
  }

  const causes = (Object.keys(grouped) as PoolCategory[]).map((cat) => ({
    id:    cat,
    label: CATEGORY_LABELS[cat],
    orgs:  grouped[cat],
  }));

  return NextResponse.json({ causes }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
  });
}
