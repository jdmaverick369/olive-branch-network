// src/lib/lensAbi.ts
// ABI for OBNStakingLens — view functions removed from the v9.3 proxy.
// All calls must target NEXT_PUBLIC_LENS_CONTRACT, NOT the staking proxy.
import type { Abi } from "viem";

export const lensAbi = [
  {
    type: "function", stateMutability: "view", name: "pendingRewards",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "getUserPoolView",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "user" }],
    outputs: [
      { type: "uint256", name: "staked" },
      { type: "uint256", name: "locked" },
      { type: "uint256", name: "unlocked" },
      { type: "uint256", name: "rewardDebt" },
      { type: "uint256", name: "pending" },
      { type: "bool", name: "isActive" },
    ],
  },
  {
    type: "function", stateMutability: "view", name: "getPoolStats",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [
      { type: "address", name: "charityWallet" },
      { type: "uint256", name: "totalStaked" },
      { type: "uint256", name: "uniqueStakers" },
      { type: "uint256", name: "accPerShare" },
      { type: "uint256", name: "lastTime" },
      { type: "uint256", name: "accruedCharity" },
      { type: "uint256", name: "depositedAllTime" },
      { type: "uint256", name: "withdrawnAllTime" },
      { type: "uint256", name: "charityMintedAllTime" },
    ],
  },
  {
    type: "function", stateMutability: "view", name: "getPoolAPR",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [{ type: "uint256", name: "aprBps" }],
  },
  {
    type: "function", stateMutability: "view", name: "listPoolsBasic",
    inputs: [],
    outputs: [
      { type: "address[]", name: "charityWallets" },
      { type: "uint256[]", name: "totals" },
      { type: "uint256[]", name: "uniqueCounts" },
    ],
  },
] as const satisfies Abi;
