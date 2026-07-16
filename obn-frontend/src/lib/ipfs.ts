// src/lib/ipfs.ts

/**
 * IPFS gateway configuration for Android WebView compatibility.
 *
 * Android WebView (used by Farcaster) may block certain IPFS gateways due to CSP restrictions.
 * This helper provides automatic fallback across multiple public IPFS gateways.
 */

export const IPFS_METADATA_GATEWAYS = [
  "https://gray-impossible-shark-962.mypinata.cloud/ipfs/", // Primary: Pinata dedicated gateway
  "https://gateway.lighthouse.storage/ipfs/",               // Fallback 1: Lighthouse
  "https://ipfs.io/ipfs/",                                  // Fallback 2: Protocol Labs gateway
  "https://w3s.link/ipfs/",                                 // Fallback 3: web3.storage gateway
  "https://dweb.link/ipfs/",                                // Fallback 4: Protocol Labs dweb gateway
];

export const IPFS_IMAGE_GATEWAYS = [
  "https://gray-impossible-shark-962.mypinata.cloud/ipfs/", // Primary: Pinata dedicated gateway
  "https://gateway.lighthouse.storage/ipfs/",               // Fallback 1: Lighthouse
  "https://ipfs.io/ipfs/",                                  // Fallback 2: Protocol Labs gateway
  "https://w3s.link/ipfs/",                                 // Fallback 3: web3.storage gateway
  "https://dweb.link/ipfs/",                                // Fallback 4: Protocol Labs dweb gateway
];

/**
 * Builds an HTTP URL from an IPFS URI using the specified gateway.
 *
 * Handles edge cases like:
 * - ipfs://QmABC123/file.png → https://gateway/ipfs/QmABC123/file.png
 * - ipfs://ipfs/QmABC123/file.png → https://gateway/ipfs/QmABC123/file.png (strips extra "ipfs/")
 *
 * @param uri - IPFS URI (e.g., "ipfs://QmABC123...") or HTTP URL
 * @param gatewayIndex - Index into the gateways array
 * @param gateways - Array of gateway base URLs
 * @returns HTTP URL or original URI if not IPFS
 */
export function buildIpfsHttpUrl(
  uri: string | null | undefined,
  gatewayIndex: number,
  gateways: string[]
): string {
  if (!uri) return "";
  if (!uri.startsWith("ipfs://")) return uri;

  // Strip "ipfs://" and optional leading "ipfs/" to normalize weird metadata formats
  const cidAndPath = uri
    .replace(/^ipfs:\/\//, "")
    .replace(/^ipfs\//, "");

  const gw = gateways[gatewayIndex] ?? gateways[0];
  return gw + cidAndPath;
}

/**
 * Fetches JSON metadata from IPFS with automatic gateway fallback.
 *
 * If the URI is ipfs://, tries all IPFS_METADATA_GATEWAYS in sequence until one succeeds.
 * If the URI is http(s)://, fetches directly (no fallback).
 *
 * This ensures Android WebView can load metadata even if one gateway is blocked.
 *
 * @param uri - IPFS URI or HTTP URL
 * @returns Parsed JSON object
 * @throws Error if all gateways fail or URI is empty
 */
export async function fetchIpfsJson<T = any>(uri: string): Promise<T> {
  if (!uri) {
    throw new Error("fetchIpfsJson: empty uri");
  }

  // Non-IPFS URL → normal fetch.
  // force-cache is safe here: IPFS content is content-addressed, so a given
  // CID's content cannot change — there's no staleness risk in caching it
  // indefinitely, unlike a typical API response.
  if (!uri.startsWith("ipfs://")) {
    const res = await fetch(uri, { cache: "force-cache" });
    if (!res.ok) {
      throw new Error(`fetchIpfsJson: HTTP error ${res.status} for ${uri}`);
    }
    return (await res.json()) as T;
  }

  // Strip "ipfs://" and optional leading "ipfs/" to normalize weird metadata formats
  const cidAndPath = uri
    .replace(/^ipfs:\/\//, "")
    .replace(/^ipfs\//, "");

  let lastError: unknown = null;

  for (let i = 0; i < IPFS_METADATA_GATEWAYS.length; i++) {
    const url = IPFS_METADATA_GATEWAYS[i] + cidAndPath;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, { cache: "force-cache", signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn("[fetchIpfsJson] Non-OK response", res.status, "from", url);
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      const json = (await res.json()) as T;
      return json;
    } catch (e) {
      clearTimeout(timer);
      console.warn("[fetchIpfsJson] Error fetching from", url, e);
      lastError = e;
    }
  }

  throw new Error(
    `fetchIpfsJson: all IPFS gateways failed for ${uri} (last error: ${String(
      lastError
    )})`
  );
}
