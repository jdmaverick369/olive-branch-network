// src/hooks/useTotalStakedAcrossPools.ts
"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { Abi, Address } from "viem";

type MulticallItem =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

export function useTotalStakedAcrossPools({
  stakingAddress,
  stakingAbi,
  getUserInfoName = "getUserInfo",
  pollMs = 15000,
}: {
  stakingAddress: Address;
  stakingAbi: Abi;
  getUserInfoName?: string; // e.g., "getUserInfo" returning (amount, ...) or a single uint256
  pollMs?: number;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient(); // PublicClient | undefined
  const [totalStaked, setTotalStaked] = useState<bigint>(0n);

  useEffect(() => {
    async function fetchAll() {
      if (!address || !publicClient) {
        setTotalStaked(0n);
        return;
      }

      try {
        // poolLength()
        const lengthRaw = await publicClient.readContract({
          address: stakingAddress,
          abi: stakingAbi,
          functionName: "poolLength",
          args: [],
        });

        const length = Number(lengthRaw ?? 0);
        if (!Number.isFinite(length) || length <= 0) {
          setTotalStaked(0n);
          return;
        }

        // Build multicall: getUserInfo(pid, user) → either bigint OR [amount, ...]
        const contracts = Array.from({ length }, (_, pid) => ({
          address: stakingAddress,
          abi: stakingAbi,
          // Dynamic names aren't easily typed against the ABI union; cast to never to satisfy viem's type
          functionName: getUserInfoName as never,
          args: [BigInt(pid), address] as const,
        }));

        const mc = await publicClient.multicall({ contracts });

        // viem versions differ: some return { results }, others return the array directly.
        // Normalize to an array of MulticallItem without using `any`.
        let results: MulticallItem[] = [];
        const maybeObj = mc as unknown;

        if (
          typeof maybeObj === "object" &&
          maybeObj !== null &&
          "results" in (maybeObj as Record<string, unknown>) &&
          Array.isArray((maybeObj as Record<string, unknown>).results)
        ) {
          results = (maybeObj as { results: MulticallItem[] }).results;
        } else if (Array.isArray(maybeObj)) {
          results = maybeObj as MulticallItem[];
        }

        let sum = 0n;
        for (const r of results) {
          if (r.status === "success") {
            const value = r.result;
            if (typeof value === "bigint") {
              // Single uint256 return
              sum += value;
            } else if (Array.isArray(value)) {
              // Tuple like (amount, ...)
              const first = value[0];
              if (typeof first === "bigint") sum += first;
            }
          }
        }

        setTotalStaked(sum);
      } catch {
        // keep UI stable on read errors
      }
    }

    // Initial fetch + polling
    fetchAll();
    const id = setInterval(fetchAll, pollMs);
    return () => clearInterval(id);
  }, [address, publicClient, stakingAddress, stakingAbi, getUserInfoName, pollMs]);

  return { totalStaked };
}
