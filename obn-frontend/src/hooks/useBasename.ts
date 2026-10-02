"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { encodePacked, keccak256, namehash, parseAbi, zeroAddress, type Address } from "viem";
import { base } from "wagmi/chains";
import { normalizeIpfsUri } from "@/lib/ipfsUri";

// Basenames on Base. Primary names live in ENS's L2 reverse registrar (current) or, for older names,
// in the legacy Basenames L2 resolver; each name's address and avatar live in its own resolver.
// https://docs.base.org/identity/basenames
const REGISTRY = "0xb94704422c2a1e396835a571837aa5ae53285a95" as const;
const LEGACY_L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const L2_REVERSE_REGISTRAR = "0x0000000000D8e504002cC26E3Ec46D81971C1664" as const;
const registryAbi = parseAbi(["function resolver(bytes32 node) view returns (address)"]);
const reverseAbi = parseAbi(["function nameForAddr(address addr) view returns (string)"]);
const resolverAbi = parseAbi([
  "function name(bytes32 node) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
]);
// Plain ASCII names only, so a look-alike Unicode name can't impersonate another account.
const DISPLAYABLE = /^[a-z0-9-]{1,63}\.base\.eth$/;

/** The legacy reverse-record node for an address's primary name on Base (ENSIP-11 coin type for chain 8453). */
function legacyReverseNode(address: Address) {
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
  const on = enabled && !!address;
  const query = { staleTime: 10 * 60_000, retry: false } as const;

  // Primary name: the current reverse registrar first, then the legacy resolver.
  const { data: primary } = useReadContracts({
    contracts: address ? [
      { address: L2_REVERSE_REGISTRAR, abi: reverseAbi, functionName: "nameForAddr", args: [address], chainId: base.id },
      { address: LEGACY_L2_RESOLVER, abi: resolverAbi, functionName: "name", args: [legacyReverseNode(address)], chainId: base.id },
    ] : [],
    query: { ...query, enabled: on },
  });
  const name = [primary?.[0]?.result, primary?.[1]?.result].find((value) => typeof value === "string" && value.length > 0);
  const candidate = typeof name === "string" && DISPLAYABLE.test(name) ? name : undefined;
  const node = candidate ? namehash(candidate) : undefined;

  // Forward check against the name's own resolver: the name must point back to this address.
  const { data: resolver } = useReadContract({
    address: REGISTRY, abi: registryAbi, functionName: "resolver", chainId: base.id,
    args: node ? [node] : undefined, query: { ...query, enabled: on && !!node },
  });
  const hasResolver = !!resolver && resolver !== zeroAddress;
  const { data: records } = useReadContracts({
    contracts: node && hasResolver ? [
      { address: resolver, abi: resolverAbi, functionName: "addr", args: [node], chainId: base.id },
      { address: resolver, abi: resolverAbi, functionName: "text", args: [node, "avatar"], chainId: base.id },
    ] : [],
    query: { ...query, enabled: on && !!node && hasResolver },
  });
  const resolved = records?.[0]?.result;
  const verified = candidate && address && typeof resolved === "string" && resolved.toLowerCase() === address.toLowerCase() ? candidate : undefined;
  const avatar = records?.[1]?.result;
  return { name: verified, avatar: verified && typeof avatar === "string" ? avatarUrl(avatar) : undefined };
}
