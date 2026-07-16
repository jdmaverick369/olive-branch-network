// src/lib/getDisplayedVotingPower.ts
//
// Pure async helper — no React, fully testable in isolation.
//
// Returns the user's displayed voting power for an active or historical governance
// cycle. Two paths:
//
//   Path A (bootstrapped == true):
//     Returns the on-chain checkpoint power. This is the authoritative value the
//     contract uses during voting.
//
//   Path B (bootstrapped == false):
//     Reads userAmount(pid, user) across all pools at blockNumber = snapshotBlock
//     via a single batched Multicall3 call. This matches what bootstrapCheckpoint
//     will compute when the user votes (both sum userAmount across pools).
//     No separate activation step is needed — the vote transaction auto-bootstraps.
//
// Requires an archive-capable RPC for Path B. If the provider does not support
// historical eth_call, returns source="error". The UI must show "unavailable",
// not "0 voting power".

import type { PublicClient } from "viem";
import { governanceAbi } from "./governanceAbi";
import { stakingAbi } from "./stakingAbi";

export type VotingPowerResult =
  | {
      power: bigint;
      source: "checkpoint";
      bootstrapped: true;
      willAutoActivateOnVote: false;
    }
  | {
      power: bigint;
      source: "historical-userAmount";
      bootstrapped: false;
      // true when the user has stake at snapshotBlock.
      // The vote transaction checkpoints them — no separate user action required.
      willAutoActivateOnVote: boolean;
    }
  | {
      power: 0n;
      source: "no-cycle";
      bootstrapped: false;
      willAutoActivateOnVote: false;
    }
  | {
      power: 0n;
      source: "error";
      bootstrapped: false;
      willAutoActivateOnVote: false;
      errorMessage: string;
    };

export async function getDisplayedVotingPower(
  publicClient: PublicClient,
  annualGovProxy: `0x${string}`,
  stakingProxy: `0x${string}`,
  user: `0x${string}`,
  cycleId: bigint
): Promise<VotingPowerResult> {
  if (cycleId === 0n) {
    return { power: 0n, source: "no-cycle", bootstrapped: false, willAutoActivateOnVote: false };
  }

  // Fetch cycle summary and checkpoint status in parallel to minimize latency.
  const [summary, [checkpointPower, bootstrapped]] = await Promise.all([
    publicClient.readContract({
      address: annualGovProxy,
      abi: governanceAbi,
      functionName: "getCycleSummary",
      args: [cycleId],
    }),
    publicClient.readContract({
      address: annualGovProxy,
      abi: governanceAbi,
      functionName: "getVotingPowerForCycle",
      args: [cycleId, user],
    }),
  ]);

  if (bootstrapped) {
    return {
      power: checkpointPower,
      source: "checkpoint",
      bootstrapped: true,
      willAutoActivateOnVote: false,
    };
  }

  // Path B: historical multicall at snapshotBlock.
  // All pool reads are batched into one eth_call via Multicall3 (deployed on Base
  // at 0xcA11bde05977b3631167028862bE2a173976CA11 from genesis — always available).
  // Requires an archive-capable RPC endpoint (e.g. Alchemy Base).
  const snapshotBlock = BigInt(summary[0]);

  const poolLength = await publicClient.readContract({
    address: stakingProxy,
    abi: stakingAbi,
    functionName: "poolLength",
  });

  const contracts = Array.from({ length: Number(poolLength) }, (_, pid) => ({
    address: stakingProxy,
    abi: stakingAbi,
    functionName: "userAmount" as const,
    args: [BigInt(pid), user] as const,
  }));

  try {
    const results = await publicClient.multicall({
      contracts,
      blockNumber: snapshotBlock,
      allowFailure: true,
    });

    let fallbackPower = 0n;
    for (const r of results) {
      if (r.status === "success" && typeof r.result === "bigint") {
        fallbackPower += r.result;
      }
    }

    return {
      power: fallbackPower,
      source: "historical-userAmount",
      bootstrapped: false,
      willAutoActivateOnVote: fallbackPower > 0n,
    };
  } catch (e) {
    // RPC does not support historical block reads.
    // Return error shape — the UI must not show "0 voting power".
    return {
      power: 0n,
      source: "error",
      bootstrapped: false,
      willAutoActivateOnVote: false,
      errorMessage: e instanceof Error ? e.message : "Historical block read unavailable",
    };
  }
}
