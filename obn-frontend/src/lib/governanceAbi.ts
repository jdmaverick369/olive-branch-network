// src/lib/governanceAbi.ts
// ABI for AnnualGovernance proxy (v9.3).
// All calls must target NEXT_PUBLIC_GOVERNANCE_CONTRACT (the proxy, not the implementation).
import type { Abi } from "viem";

export const governanceAbi = [
  // ── Cycle state ──────────────────────────────────────────────────────────────
  {
    type: "function", stateMutability: "view", name: "currentCycleId",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "getCycleState",
    inputs: [{ type: "uint256", name: "cycleId" }],
    outputs: [{ type: "uint8", name: "" }], // CycleState enum
  },
  {
    type: "function", stateMutability: "view", name: "getCycleSummary",
    inputs: [{ type: "uint256", name: "cycleId" }],
    outputs: [
      { type: "uint48", name: "snapshotBlock" },
      { type: "uint64", name: "phase1End" },
      { type: "uint64", name: "phase2End" },
      { type: "uint256", name: "burnVotes" },
      { type: "uint256", name: "giveVotes" },
      { type: "uint8", name: "phase1Outcome" }, // Phase1Outcome enum
      { type: "bool", name: "phase1Executed" },
      { type: "bool", name: "phase2Executed" },
      { type: "bool", name: "cancelled" },
    ],
  },
  {
    type: "function", stateMutability: "view", name: "getBallot",
    inputs: [{ type: "uint256", name: "cycleId" }],
    outputs: [{ type: "address[]", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "getNonprofitVotes",
    inputs: [
      { type: "uint256", name: "cycleId" },
      { type: "address", name: "nonprofit" },
    ],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "hasVotedPhase1",
    inputs: [
      { type: "uint256", name: "cycleId" },
      { type: "address", name: "voter" },
    ],
    outputs: [{ type: "bool", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "hasVotedPhase2",
    inputs: [
      { type: "uint256", name: "cycleId" },
      { type: "address", name: "voter" },
    ],
    outputs: [{ type: "bool", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "getVotingPowerForCycle",
    inputs: [
      { type: "uint256", name: "cycleId" },
      { type: "address", name: "user" },
    ],
    outputs: [
      { type: "uint256", name: "power" },
      { type: "bool", name: "bootstrapped" },
    ],
  },
  // ── Voting ───────────────────────────────────────────────────────────────────
  {
    type: "function", stateMutability: "nonpayable", name: "castOfferingVote",
    inputs: [
      { type: "uint256", name: "cycleId" },
      { type: "bool", name: "burn" },
    ],
    outputs: [],
  },
  {
    type: "function", stateMutability: "nonpayable", name: "castNonprofitVote",
    inputs: [
      { type: "uint256", name: "cycleId" },
      { type: "address", name: "nonprofit" },
    ],
    outputs: [],
  },
  // ── Permissionless execution ──────────────────────────────────────────────────
  {
    type: "function", stateMutability: "nonpayable", name: "executeCurrentCycle",
    inputs: [],
    outputs: [],
  },
  // ── Events (used to recover a voter's choice when it's not in localStorage,
  //    e.g. a vote cast on another device, or before that vote was tracked) ──
  {
    type: "event", name: "Phase1Executed",
    inputs: [
      { type: "uint256", name: "cycleId", indexed: true },
      { type: "uint8", name: "outcome", indexed: false }, // Phase1Outcome enum
      { type: "uint256", name: "amount", indexed: false },
      { type: "uint64", name: "phase2End", indexed: false },
    ],
  },
  {
    type: "event", name: "OfferingVoteCast",
    inputs: [
      { type: "uint256", name: "cycleId", indexed: true },
      { type: "address", name: "voter", indexed: true },
      { type: "bool", name: "burn", indexed: false },
      { type: "uint256", name: "votingPower", indexed: false },
    ],
  },
  {
    type: "event", name: "NonprofitVoteCast",
    inputs: [
      { type: "uint256", name: "cycleId", indexed: true },
      { type: "address", name: "voter", indexed: true },
      { type: "address", name: "nonprofit", indexed: true },
      { type: "uint256", name: "votingPower", indexed: false },
    ],
  },
] as const satisfies Abi;

// CycleState enum values (matches AnnualGovernance.sol declaration order)
export const CycleState = {
  INACTIVE:     0,
  PHASE1_OPEN:  1,
  PHASE1_READY: 2,
  PHASE2_OPEN:  3,
  PHASE2_READY: 4,
  COMPLETED:    5,
  CANCELLED:    6,
} as const;

export type CycleStateValue = (typeof CycleState)[keyof typeof CycleState];
