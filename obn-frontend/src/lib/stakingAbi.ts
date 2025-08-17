// src/lib/stakingAbi.ts
import type { Abi } from "viem";

export const stakingAbi = [
  // ---- constants / basic views
  { type: "function", stateMutability: "view", name: "stakingToken", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", stateMutability: "view", name: "treasury", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", stateMutability: "view", name: "charityFund", inputs: [], outputs: [{ type: "address", name: "" }] },

  // constants (public)
  { type: "function", stateMutability: "view", name: "STAKER_BPS", outputs: [{ type: "uint256", name: "" }], inputs: [] },
  { type: "function", stateMutability: "view", name: "CHARITY_BPS", outputs: [{ type: "uint256", name: "" }], inputs: [] },
  { type: "function", stateMutability: "view", name: "CHARITY_FUND_BPS", outputs: [{ type: "uint256", name: "" }], inputs: [] },
  { type: "function", stateMutability: "view", name: "TREASURY_BPS", outputs: [{ type: "uint256", name: "" }], inputs: [] },
  { type: "function", stateMutability: "view", name: "TOTAL_BPS", outputs: [{ type: "uint256", name: "" }], inputs: [] },

  // globals
  { type: "function", stateMutability: "view", name: "poolLength", inputs: [], outputs: [{ type: "uint256", name: "" }] },
  { type: "function", stateMutability: "view", name: "globalTotalStaked", inputs: [], outputs: [{ type: "uint256", name: "" }] },
  { type: "function", stateMutability: "view", name: "currentRewardsPerSecond", inputs: [], outputs: [{ type: "uint256", name: "" }] },

  // pool & user views
  {
    type: "function", stateMutability: "view", name: "getPoolInfo",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [
      { type: "address", name: "charityWallet" },
      { type: "uint256", name: "totalStaked" },
    ],
  },
  {
    type: "function", stateMutability: "view", name: "getUserStakeValue",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "userAddr" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "pendingRewards",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "userAddr" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "getPoolAPR",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [{ type: "uint256", name: "aprBps" }],
  },
  {
    type: "function", stateMutability: "view", name: "unlockedBalance",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },

  // helpful view
  {
    type: "function", stateMutability: "view", name: "pendingCharityFor",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [{ type: "uint256", name: "" }],
  },

  // ---- write actions
  {
    type: "function", stateMutability: "nonpayable", name: "deposit",
    inputs: [{ type: "uint256", name: "pid" }, { type: "uint256", name: "amount" }],
    outputs: [],
  },
  {
    type: "function", stateMutability: "nonpayable", name: "withdraw",
    inputs: [{ type: "uint256", name: "pid" }, { type: "uint256", name: "amount" }],
    outputs: [],
  },
  {
    type: "function", stateMutability: "nonpayable", name: "claim",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [],
  },

  // optional
  {
    type: "function", stateMutability: "nonpayable", name: "depositWithPermit",
    inputs: [
      { type: "uint256", name: "pid" },
      { type: "uint256", name: "amount" },
      { type: "address", name: "beneficiary" },
      { type: "uint256", name: "deadline" },
      { type: "uint8", name: "v" },
      { type: "bytes32", name: "r" },
      { type: "bytes32", name: "s" },
    ],
    outputs: [],
  },
] as const satisfies Abi;
