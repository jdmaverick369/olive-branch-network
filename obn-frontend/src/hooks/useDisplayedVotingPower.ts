// src/hooks/useDisplayedVotingPower.ts
"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import {
  getDisplayedVotingPower,
  type VotingPowerResult,
} from "@/lib/getDisplayedVotingPower";

const GOVERNANCE_CONTRACT = (
  process.env.NEXT_PUBLIC_GOVERNANCE_CONTRACT || undefined
) as `0x${string}` | undefined;

const STAKING_CONTRACT = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT || undefined
) as `0x${string}` | undefined;

type HookResult = {
  votingPower: VotingPowerResult | null;
  isLoading: boolean;
  isError: boolean;
};

export function useDisplayedVotingPower(
  cycleId: bigint | undefined,
  refetchSignal?: number
): HookResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [votingPower, setVotingPower] = useState<VotingPowerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      if (!address || cycleId === undefined || !publicClient || !GOVERNANCE_CONTRACT || !STAKING_CONTRACT) {
        setVotingPower(null);
        return;
      }

      setIsLoading(true);
      setIsError(false);

      try {
        const result = await getDisplayedVotingPower(
          publicClient,
          GOVERNANCE_CONTRACT,
          STAKING_CONTRACT,
          address,
          cycleId
        );
        if (!cancelled) setVotingPower(result);
      } catch {
        if (!cancelled) {
          setIsError(true);
          setVotingPower(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  // refetchSignal bumps this effect to re-run the full power lookup on demand
  }, [address, cycleId?.toString(), publicClient, refetchSignal]);

  return { votingPower, isLoading, isError };
}
