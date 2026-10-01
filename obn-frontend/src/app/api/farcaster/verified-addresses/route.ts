import { NextRequest, NextResponse } from "next/server";
import { ApiError, createResourceGuard, fetchJsonBounded, isRecord } from "@/lib/server/http";

export const maxDuration = 12;
const lookup = createResourceGuard({ requestsPerMinute: 120, maxConcurrent: 8, cacheMs: 300_000, maxEntries: 64 });

// Returns the Ethereum addresses a Farcaster user has verified, so the mini app
// can offer them as wallets to view. Verifications are public protocol data;
// the Neynar key stays server-side.
const FID = /^[1-9]\d{0,9}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type NeynarUser = {
  verified_addresses?: {
    eth_addresses?: unknown[];
    primary?: { eth_address?: unknown };
  };
};

export async function GET(req: NextRequest) {
  const fid = req.nextUrl.searchParams.get("fid") ?? "";
  if (!FID.test(fid)) {
    return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
  }

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Lookup unavailable" }, { status: 503 });
  }

  try {
    const data = await lookup(fid, async () => {
      const body = await fetchJsonBounded(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: { "x-api-key": apiKey },
      }, { maxBytes: 128 * 1024 });
      if (!isRecord(body) || !Array.isArray(body.users)) throw new Error("Invalid lookup response");
      return body as { users: NeynarUser[] };
    });
    const verified = data.users?.[0]?.verified_addresses;
    const addresses = [...new Set(
      (verified?.eth_addresses ?? [])
        .filter((a): a is string => typeof a === "string" && ADDRESS.test(a))
        .map((a) => a.toLowerCase())
    )];
    const primaryRaw = verified?.primary?.eth_address;
    const primary = typeof primaryRaw === "string" && addresses.includes(primaryRaw.toLowerCase())
      ? primaryRaw.toLowerCase()
      : null;

    return NextResponse.json(
      { addresses, primary },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    const limited = error instanceof ApiError && error.status === 429;
    return NextResponse.json({ error: limited ? "Service busy; try again shortly" : "Lookup failed" }, {
      status: limited ? 429 : 502, headers: { "Cache-Control": "no-store", ...(limited ? { "Retry-After": "60" } : {}) },
    });
  }
}
