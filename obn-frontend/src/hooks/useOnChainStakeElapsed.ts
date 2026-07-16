// src/hooks/useOnChainStakeElapsed.ts
"use client";

import { useReadContract } from "wagmi";
import { stakingAbi } from "@/lib/stakingAbi";

const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;

/**
 * Reads the user's lifetime staking seconds from the contract's stakeElapsed(address) function.
 *
 * This provides an authoritative on-chain record of how long the user has been staked,
 * used as a fallback when localStorage is wiped or missing.
 *
 * @param userAddr - User's wallet address
 * @returns Object with elapsedSec (number), isLoading, and isError
 */
export function useOnChainStakeElapsed(userAddr?: `0x${string}` | null) {
  const { data, isLoading, isError } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "stakeElapsed",
    args: userAddr ? [userAddr] : undefined,
    query: {
      enabled: !!userAddr && !!STAKING_CONTRACT,
    },
  });

  return {
    elapsedSec: data ? Number(data) : 0,
    isLoading,
    isError,
  };
}
