// src/lib/stakingAbi.ts
// ABI for the OBN staking proxy (v9.3+).
// View functions moved to OBNStakingLens are in lensAbi.ts — do NOT call them here.
import type { Abi } from "viem";

export const stakingAbi = [
  // ---- constants / basic views
  { type: "function", stateMutability: "view", name: "stakingToken", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", stateMutability: "view", name: "treasury", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", stateMutability: "view", name: "charityFund", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", stateMutability: "view", name: "charityFundOperator", inputs: [], outputs: [{ type: "address", name: "" }] },

  // v9.3 getters
  { type: "function", stateMutability: "view", name: "version", inputs: [], outputs: [{ type: "string", name: "" }] },
  { type: "function", stateMutability: "view", name: "upgradeBlock", inputs: [], outputs: [{ type: "uint256", name: "" }] },

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
    type: "function", stateMutability: "view", name: "userAmount",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "unlockedBalance",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },

  // XP / staking time tracking
  {
    type: "function", stateMutability: "view", name: "stakeElapsed",
    inputs: [{ type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "isGloballyStaked",
    inputs: [{ type: "address", name: "user" }],
    outputs: [{ type: "bool", name: "" }],
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

  // Charity contribution tracking
  {
    type: "function", stateMutability: "view", name: "charityContributedByUserInPool",
    inputs: [{ type: "uint256", name: "pid" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function", stateMutability: "view", name: "totalCharityContributedByUser",
    inputs: [{ type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },

  // Total claimed by user
  {
    type: "function", stateMutability: "view", name: "totalClaimedByUser",
    inputs: [{ type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "" }],
  },

  // Total charity minted to a pool (all-time)
  {
    type: "function", stateMutability: "view", name: "totalCharityMintedByPool",
    inputs: [{ type: "uint256", name: "pid" }],
    outputs: [{ type: "uint256", name: "" }],
  },

  // Multi-claim (v9.2+)
  {
    type: "function", stateMutability: "nonpayable", name: "claimMultiple",
    inputs: [{ type: "uint256[]", name: "pids" }],
    outputs: [],
  },
] as const satisfies Abi;
