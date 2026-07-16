// src/components/NFTPrefetch.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient, useReadContract, useAccount } from "wagmi";
import { oliveAbi } from "@/lib/oliveAbi";
import {
  readOwnedNftsCache,
  writeOwnedNftsCache,
  fetchOwnedTokenIdsAndUris,
  fetchNftImages,
  type OwnedNft,
} from "@/lib/ownedNfts";

const OLIVE_NFT = process.env.NEXT_PUBLIC_OLIVE_NFT as `0x${string}`;
const NFT_FETCH_IN_PROGRESS_KEY = "obn_nft_fetching";

/**
 * Prefetches NFT data during loading animation so it's ready when dashboard renders.
 * Stores in sessionStorage for immediate access.
 * MiniApp-aware: detects Farcaster MiniApp wallet address.
 */
export default function NFTPrefetch() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const fetchedRef = useRef(false);

  // Check if fetch is already in progress in this session
  const isFetchInProgress = () => {
    try {
      return sessionStorage.getItem(NFT_FETCH_IN_PROGRESS_KEY) === 'true';
    } catch {
      return false;
    }
  };

  const markFetchInProgress = () => {
    try {
      sessionStorage.setItem(NFT_FETCH_IN_PROGRESS_KEY, 'true');
    } catch {}
  };

  const clearFetchInProgress = () => {
    try {
      sessionStorage.removeItem(NFT_FETCH_IN_PROGRESS_KEY);
    } catch {}
  };

  // Detect MiniApp address (same logic as dashboard)
  const [miniAppAddress, setMiniAppAddress] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const w = window as any;
      if (w.ethereum?.isMiniPay) {
        w.ethereum.request({ method: 'eth_requestAccounts' })
          .then((accounts: string[]) => {
            if (accounts[0]) setMiniAppAddress(accounts[0]);
          })
          .catch(() => {});
      } else if (w.farcasterFrame?.user?.verifiedAddresses?.eth_addresses?.[0]) {
        setMiniAppAddress(w.farcasterFrame.user.verifiedAddresses.eth_addresses[0]);
      }
    } catch {}
  }, []);

  // Use either wagmi address or miniApp address
  const effectiveAddress = (address || miniAppAddress) as `0x${string}` | undefined;

  const { data: oliveBalBN } = useReadContract({
    address: OLIVE_NFT,
    abi: oliveAbi,
    functionName: "balanceOf",
    args: effectiveAddress ? [effectiveAddress] : undefined,
    query: { enabled: !!effectiveAddress && !!OLIVE_NFT },
  });

  useEffect(() => {
    if (fetchedRef.current) return;
    if (!effectiveAddress || !publicClient || !OLIVE_NFT) return;

    // ✅ CRITICAL: Wait for balance to be fetched before doing anything
    // If oliveBalBN is undefined, wagmi hasn't fetched it yet - don't proceed
    if (oliveBalBN === undefined) {
      console.debug('🎨 NFTPrefetch: Waiting for balance check...');
      return;
    }

    // Don't start a new fetch if one is already in progress
    if (isFetchInProgress()) {
      console.debug('🎨 NFTPrefetch: Fetch already in progress, skipping');
      fetchedRef.current = true;
      return;
    }

    const count = Number(oliveBalBN);
    if (count === 0) {
      writeOwnedNftsCache([]);
      fetchedRef.current = true; // Mark as fetched for empty case
      console.debug('🎨 NFTPrefetch: No NFTs owned, cached empty result');
      return;
    }

    // Check if we already have valid cached data
    if (readOwnedNftsCache(count) !== null) {
      console.debug('🎨 NFTPrefetch: Cache is fresh, skipping fetch');
      fetchedRef.current = true;
      return;
    }

    // Mark fetch as in progress before starting
    markFetchInProgress();

    async function prefetchNFTs() {
      if (!effectiveAddress || !publicClient) return;

      const nftCount = Number(oliveBalBN ?? 0n);

      try {
        console.debug('🎨 NFTPrefetch: Starting prefetch for', nftCount, 'NFT(s)...', { effectiveAddress });

        const idsAndUris = await fetchOwnedTokenIdsAndUris(publicClient, OLIVE_NFT, effectiveAddress, nftCount);
        const imgs = await fetchNftImages(idsAndUris.map((x) => x.uri));

        const cached: OwnedNft[] = idsAndUris.map(({ id, uri }, i) => ({
          id: id.toString(),
          uri,
          img: imgs[i],
          timestamp: Date.now(),
        }));

        writeOwnedNftsCache(cached);
        console.debug('🎨 NFTPrefetch: Cached', cached.length, 'NFT(s)');
        fetchedRef.current = true; // ✅ Only mark as fetched after successful cache
        clearFetchInProgress();
      } catch (err) {
        console.error('🎨 NFTPrefetch: Error prefetching NFTs:', err);
        clearFetchInProgress(); // Clear flag on error
      }
    }

    prefetchNFTs();
  }, [effectiveAddress, publicClient, oliveBalBN]);

  return null;
}
