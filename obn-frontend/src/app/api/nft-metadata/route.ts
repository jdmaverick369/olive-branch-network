// src/app/api/nft-metadata/route.ts
// Server-side IPFS proxy — avoids mobile browser CORS/gateway issues.
import { NextRequest, NextResponse } from "next/server";
import { fetchIpfsJson } from "@/lib/ipfs";

export async function GET(req: NextRequest) {
  const uri = req.nextUrl.searchParams.get("uri");
  if (!uri) {
    return NextResponse.json({ error: "missing uri" }, { status: 400 });
  }
  // This public route is an IPFS gateway proxy, not a general-purpose URL
  // fetcher. Restricting the scheme prevents access to private infrastructure.
  if (!uri.startsWith("ipfs://")) {
    return NextResponse.json({ error: "only ipfs:// metadata URIs are supported" }, { status: 400 });
  }

  try {
    const meta = await fetchIpfsJson<Record<string, unknown>>(uri);

    // IPFS content is content-addressed — a given uri's content cannot
    // change, so this is safe to cache indefinitely on both the browser and
    // any CDN/edge cache in front of this route.
    return NextResponse.json(meta, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "failed to fetch metadata" }, { status: 500 });
  }
}
