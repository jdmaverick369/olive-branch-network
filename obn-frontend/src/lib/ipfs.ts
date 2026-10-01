// src/lib/ipfs.ts
import { normalizeIpfsUri, matchesIpfsGatewayResource } from "./ipfsUri";
import { fetchJsonBounded, isRecord } from "./server/http";

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
 * Only validated content-addressed IPFS URIs are fetched. Redirects must preserve
 * the CID/path and remain on one of the fixed gateways (including CID subdomains).
 *
 * This ensures Android WebView can load metadata even if one gateway is blocked.
 *
 * @param uri - IPFS URI
 * @returns Parsed JSON object
 * @throws Error if all gateways fail or URI is empty
 */
export async function fetchIpfsJson<T = Record<string, unknown>>(uri: string): Promise<T> {
  const cidAndPath = normalizeIpfsUri(uri).slice(7);
  const deadline = AbortSignal.timeout(15_000);
  for (const gateway of IPFS_METADATA_GATEWAYS) {
    if (deadline.aborted) break;
    try {
      const json = await fetchJsonBounded(gateway + cidAndPath, { signal: deadline }, {
        timeoutMs: 3_000, maxBytes: 256 * 1024,
        allowRedirect: (url) => matchesIpfsGatewayResource(url, uri, IPFS_METADATA_GATEWAYS),
      });
      if (!isRecord(json)) throw new Error("Metadata must be an object");
      return json as T;
    } catch { /* Try the next fixed gateway, within the shared deadline. */ }
  }
  throw new Error("Metadata unavailable");
}
