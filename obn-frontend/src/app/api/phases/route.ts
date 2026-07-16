// src/app/api/phases/route.ts
// Returns all 5 phases in a single multicall — one RPC round trip.
import { NextResponse } from 'next/server';
import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';

const PRIMARY   = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const SECONDARY = process.env.BASE_RPC_URL_ALT;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}` | undefined;

const transport = SECONDARY
  ? fallback([http(PRIMARY), http(SECONDARY)], { rank: true, retryCount: 2 })
  : http(PRIMARY, { retryCount: 2 });

const client = createPublicClient({ chain: base, transport });

const PHASES_ABI = [
  {
    name: 'phases',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'index', type: 'uint256' }],
    outputs: [
      { name: 'start', type: 'uint256' },
      { name: 'end',   type: 'uint256' },
      { name: 'bps',   type: 'uint256' },
    ],
  },
] as const;

const PHASE_COUNT = 5;

type PhasePayload = {
  start: number;
  end: number;
  bps: number;
  stakerBps: number;
  contractPct: number;
  stakerPct: number;
};

// In-memory cache (works when the same serverless instance handles consecutive requests)
let cache: { exp: number; phases: PhasePayload[] } | null = null;
const TTL_MS = 60_000;

function isRateLimitLike(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && 'shortMessage' in e) {
    const sm = (e as { shortMessage?: unknown }).shortMessage;
    if (typeof sm === 'string' && /rate limit|http request failed/i.test(sm)) return true;
  }
  return /429|rate limit|http request failed/i.test(String(e));
}

export async function GET() {
  if (!STAKING_CONTRACT) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_STAKING_CONTRACT is not set' }, { status: 500 });
  }

  if (cache && cache.exp > Date.now()) {
    return NextResponse.json(cache.phases, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'x-cache': 'HIT',
      },
    });
  }

  try {
    const contracts = Array.from({ length: PHASE_COUNT }, (_, i) => ({
      address: STAKING_CONTRACT as `0x${string}`,
      abi: PHASES_ABI,
      functionName: 'phases' as const,
      args: [BigInt(i)] as const,
    }));

    const results = await client.multicall({ contracts, allowFailure: false });

    const phases: PhasePayload[] = results.map(([startBI, endBI, bpsBI]) => {
      const bps      = Number(bpsBI);
      const stakerBps = Math.floor(bps * 0.88);
      return {
        start:       Number(startBI),
        end:         Number(endBI),
        bps,
        stakerBps,
        contractPct: bps / 100,
        stakerPct:   stakerBps / 100,
      };
    });

    cache = { exp: Date.now() + TTL_MS, phases };

    return NextResponse.json(phases, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'x-cache': 'MISS',
      },
    });
  } catch (err) {
    if (isRateLimitLike(err) && cache) {
      return NextResponse.json(cache.phases, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
          'x-cache': 'STALE',
        },
      });
    }

    console.error('GET /api/phases failed:', err);
    return NextResponse.json({ error: 'Failed to fetch phase data' }, { status: 503 });
  }
}
