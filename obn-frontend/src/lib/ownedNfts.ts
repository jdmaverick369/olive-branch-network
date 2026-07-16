// src/lib/ownedNfts.ts
// Shared NFT-loading logic for NFTPrefetch and the profile page. Previously
// each had its own independent copy of this fetch chain, and the profile
// page never read the cache NFTPrefetch (which runs on every route via the
// root layout) had already written — so every profile visit redid the full
// on-chain + IPFS fetch from scratch regardless of what the prefetcher had
// already warmed.
import type { PublicClient } from "viem";
import { oliveAbi } from "@/lib/oliveAbi";

export type OwnedNft = {
  id: string;
  uri: string;
  img: string | null;
  timestamp: number;
};

const CACHE_KEY = "obn_nft_cache";
const CACHE_LIFETIME_MS = 5 * 60 * 1000; // NFTs don't change often

/**
 * Returns the cached owned-NFT list if it's fresh and matches the current
 * on-chain balance, otherwise null. expectedCount guards against using a
 * stale cache from before the user minted/transferred an NFT.
 */
export function readOwnedNftsCache(expectedCount: number): OwnedNft[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: OwnedNft[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null;
    if (parsed.length === 0) return parsed;
    const age = Date.now() - (parsed[0]?.timestamp ?? 0);
    if (age >= CACHE_LIFETIME_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOwnedNftsCache(items: OwnedNft[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    /* sessionStorage unavailable — skip caching */
  }
}

/**
 * Fetches every token ID + URI owned by `owner`, batched into two multicalls
 * (one for tokenOfOwnerByIndex, one for tokenURI) instead of 2*count separate
 * parallel RPC requests.
 */
export async function fetchOwnedTokenIdsAndUris(
  publicClient: PublicClient,
  nftAddress: `0x${string}`,
  owner: `0x${string}`,
  count: number
): Promise<{ id: bigint; uri: string }[]> {
  if (count === 0) return [];

  const idResults = await publicClient.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: nftAddress,
      abi: oliveAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [owner, BigInt(i)] as const,
    })),
  });

  const ids = idResults
    .filter((r) => r.status === "success")
    .map((r) => r.result as bigint);

  if (ids.length === 0) return [];

  const uriResults = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: nftAddress,
      abi: oliveAbi,
      functionName: "tokenURI" as const,
      args: [id] as const,
    })),
  });

  return ids.reduce<{ id: bigint; uri: string }[]>((acc, id, i) => {
    const r = uriResults[i];
    if (r?.status === "success") acc.push({ id, uri: r.result as string });
    return acc;
  }, []);
}

/**
 * Resolves display image URLs for a list of token URIs via the server-side
 * IPFS proxy (/api/nft-metadata) — avoids mobile WebView CORS/gateway issues
 * and lets the proxy's response cache (see route.ts) be shared across every
 * caller, instead of each caller hitting IPFS gateways directly.
 */
export async function fetchNftImages(uris: string[]): Promise<(string | null)[]> {
  return Promise.all(
    uris.map(async (uri) => {
      try {
        const res = await fetch(`/api/nft-metadata?uri=${encodeURIComponent(uri)}`);
        if (!res.ok) return null;
        const meta = await res.json();
        const imageUrl: string = meta?.image ?? meta?.properties?.files?.[0]?.uri ?? "";
        return imageUrl || null;
      } catch {
        return null;
      }
    })
  );
}
