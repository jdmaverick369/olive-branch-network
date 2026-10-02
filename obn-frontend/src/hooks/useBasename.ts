"use client";

import { useReadContract } from "wagmi";
import { encodePacked, keccak256, namehash, parseAbi, type Address } from "viem";
import { base } from "wagmi/chains";
import { normalizeIpfsUri } from "@/lib/ipfsUri";

// Basenames' L2 resolver on Base: primary names (reverse records), name → address and text records.
// https://docs.base.org/identity/basenames
const L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const resolverAbi = parseAbi([
  "function name(bytes32 node) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
]);
// Plain ASCII names only, so a look-alike Unicode name can't impersonate another account.
const DISPLAYABLE = /^[a-z0-9-]{1,63}\.base\.eth$/;

/** The reverse-record node for an address's primary name on Base (ENSIP-11 coin type for chain 8453). */
function reverseNode(address: Address) {
  const coinType = ((0x80000000 | base.id) >>> 0).toString(16).toUpperCase();
  return keccak256(encodePacked(["bytes32", "bytes32"], [namehash(`${coinType}.reverse`), keccak256(address.slice(2).toLowerCase() as `0x${string}`)]));
}

/** An image URL for an avatar record: https links as-is, ipfs:// through a public gateway. NFT avatars aren't resolved. */
function avatarUrl(value: string | undefined) {
  if (!value || value.length > 2_048) return undefined;
  if (value.startsWith("ipfs://")) {
    try { return `https://ipfs.io/ipfs/${normalizeIpfsUri(value).slice("ipfs://".length)}`; } catch { return undefined; }
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The address's primary Basename (e.g. "jesse.base.eth") and its avatar, only when the name also
 * resolves back to the same address; otherwise both are undefined.
 */
export function useBasename(address: Address | undefined, enabled = true) {
  const query = { enabled: enabled && !!address, staleTime: 10 * 60_000, retry: false } as const;
  const { data: name } = useReadContract({
    address: L2_RESOLVER, abi: resolverAbi, functionName: "name", chainId: base.id,
    args: address ? [reverseNode(address)] : undefined, query,
  });
  const candidate = name && DISPLAYABLE.test(name) ? name : undefined;
  const { data: resolved } = useReadContract({
    address: L2_RESOLVER, abi: resolverAbi, functionName: "addr", chainId: base.id,
    args: candidate ? [namehash(candidate)] : undefined, query: { ...query, enabled: query.enabled && !!candidate },
  });
  const verified = candidate && address && resolved?.toLowerCase() === address.toLowerCase() ? candidate : undefined;
  const { data: avatar } = useReadContract({
    address: L2_RESOLVER, abi: resolverAbi, functionName: "text", chainId: base.id,
    args: verified ? [namehash(verified), "avatar"] : undefined, query: { ...query, enabled: query.enabled && !!verified },
  });
  return { name: verified, avatar: verified ? avatarUrl(avatar) : undefined };
}
