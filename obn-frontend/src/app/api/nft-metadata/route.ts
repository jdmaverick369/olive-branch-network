// src/app/api/nft-metadata/route.ts
// Server-side IPFS proxy — avoids mobile browser CORS/gateway issues.
import { NextRequest, NextResponse } from "next/server";
import { fetchIpfsJson } from "@/lib/ipfs";
import { normalizeIpfsUri } from "@/lib/ipfsUri";
import { ApiError, createResourceGuard } from "@/lib/server/http";

export const maxDuration = 20;
const metadata = createResourceGuard({ requestsPerMinute: 120, maxConcurrent: 8, cacheMs: 3_600_000, maxEntries: 64 });

export async function GET(req: NextRequest) {
  const uri = req.nextUrl.searchParams.get("uri");
  if (!uri) {
    return NextResponse.json({ error: "missing uri" }, { status: 400 });
  }
  // This public route is an IPFS gateway proxy, not a general-purpose URL
  // fetcher. Restricting the scheme prevents access to private infrastructure.
  let normalized: string;
  try { normalized = normalizeIpfsUri(uri); }
  catch { return NextResponse.json({ error: "Invalid IPFS metadata URI" }, { status: 400 }); }

  try {
    const meta = await metadata(normalized, () => fetchIpfsJson<Record<string, unknown>>(normalized));

    // IPFS content is content-addressed — a given uri's content cannot
    // change, so this is safe to cache indefinitely on both the browser and
    // any CDN/edge cache in front of this route.
    return NextResponse.json(meta, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (error) {
    const limited = error instanceof ApiError && error.status === 429;
    return NextResponse.json({ error: limited ? "Service busy; try again shortly" : "failed to fetch metadata" }, {
      status: limited ? 429 : 502, headers: { "Cache-Control": "no-store", ...(limited ? { "Retry-After": "60" } : {}) },
    });
  }
}
