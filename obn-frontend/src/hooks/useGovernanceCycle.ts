// src/hooks/useGovernanceCycle.ts
"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { governanceAbi, CycleState, type CycleStateValue } from "@/lib/governanceAbi";
import { ANNUAL_GOV_PROXY } from "@/lib/contracts";

const GOV_ADDRESS = ANNUAL_GOV_PROXY as `0x${string}`;

export type CycleSummary = {
  snapshotBlock: number;
  phase1End: number; // unix seconds
  phase2End: number; // unix seconds (0 until phase 1 executed)
  burnVotes: bigint;
  giveVotes: bigint;
  phase1Outcome: 0 | 1 | 2; // PENDING=0, BURN=1, GIVE=2
  phase1Executed: boolean;
  phase2Executed: boolean;
  cancelled: boolean;
};

export { CycleState };
export type { CycleStateValue };

export function useGovernanceCycle() {
  const { data: cycleIdRaw, isLoading: idLoading } = useReadContract({
    address: GOV_ADDRESS,
    abi: governanceAbi,
    functionName: "currentCycleId",
    query: { staleTime: 60_000, refetchInterval: 60_000 },
  });

  const cycleId = cycleIdRaw as bigint | undefined;
  const hasCycle = cycleId !== undefined && cycleId > 0n;

  const { data: cycleData, isLoading: dataLoading } = useReadContracts({
    contracts: [
      {
        address: GOV_ADDRESS,
        abi: governanceAbi,
        functionName: "getCycleState",
        args: [cycleId!],
      },
      {
        address: GOV_ADDRESS,
        abi: governanceAbi,
        functionName: "getCycleSummary",
        args: [cycleId!],
      },
    ],
    query: {
      enabled: hasCycle,
      staleTime: 30_000,
      refetchInterval: 30_000,
    },
  });

  const state = (cycleData?.[0]?.result ?? undefined) as CycleStateValue | undefined;

  // getCycleSummary returns a tuple: [snapshotBlock, phase1End, phase2End, burnVotes, giveVotes, phase1Outcome, phase1Executed, phase2Executed, cancelled]
  const raw = cycleData?.[1]?.result as
    | readonly [bigint, bigint, bigint, bigint, bigint, number, boolean, boolean, boolean]
    | undefined;

  const summary: CycleSummary | undefined = raw
    ? {
        snapshotBlock: Number(raw[0]),
        phase1End: Number(raw[1]),
        phase2End: Number(raw[2]),
        burnVotes: raw[3],
        giveVotes: raw[4],
        phase1Outcome: raw[5] as 0 | 1 | 2,
        phase1Executed: raw[6],
        phase2Executed: raw[7],
        cancelled: raw[8],
      }
    : undefined;

  return {
    cycleId,
    state,
    summary,
    isLoading: idLoading || (hasCycle && dataLoading),
  };
}
