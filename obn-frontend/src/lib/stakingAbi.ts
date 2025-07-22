// src/lib/stakingAbi.ts
export const stakingAbi = [
  // minimal for now
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "pid", type: "uint256" }],
    outputs: []
  },
  {
    name: "compound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "pid", type: "uint256" }],
    outputs: []
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
  name: "pools",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "", type: "uint256" }],
  outputs: [
    { name: "charityWallet", type: "address" },
    { name: "active", type: "bool" },
    { name: "totalStaked", type: "uint256" },
    { name: "accRewardPerShare", type: "uint256" },
    { name: "lastRewardTime", type: "uint256" },
        ],
   },
   {
  name: "userInfo",
  type: "function",
  stateMutability: "view",
  inputs: [
    { name: "pid", type: "uint256" },
    { name: "user", type: "address" }
  ],
  outputs: [
    { name: "amount", type: "uint256" },
    { name: "rewardDebt", type: "uint256" },
    { name: "withTreasury", type: "bool" }
    ]
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "pid", "type": "uint256" },
      { "internalType": "address", "name": "userAddr", "type": "address" }
    ],
    "name": "pendingRewards",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]