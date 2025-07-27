export const stakingAbi = [
  // --- Initialization (UUPS, so not usually called externally) ---

  // --- Read-only Views ---
  {
    "inputs": [],
    "name": "stakingToken",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "treasury",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "treasuryBps",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "CHARITY_BPS",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Pool Info ---
  {
    "inputs": [{ "internalType": "uint256", "name": "pid", "type": "uint256" }],
    "name": "getPoolInfo",
    "outputs": [
      { "internalType": "address", "name": "charityWallet", "type": "address" },
      { "internalType": "bool", "name": "active", "type": "bool" },
      { "internalType": "uint256", "name": "totalStaked", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- User Stake Value (Per Pool) ---
  {
    "inputs": [
      { "internalType": "uint256", "name": "pid", "type": "uint256" },
      { "internalType": "address", "name": "userAddr", "type": "address" }
    ],
    "name": "getUserStakeValue",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- User Stats (Across All Pools) ---
  {
    "inputs": [{ "internalType": "address", "name": "userAddr", "type": "address" }],
    "name": "getUserStats",
    "outputs": [
      { "internalType": "uint256", "name": "totalUserStaked", "type": "uint256" },
      { "internalType": "uint256", "name": "totalUserClaimed", "type": "uint256" },
      { "internalType": "uint256", "name": "totalUserDeposited", "type": "uint256" },
      { "internalType": "uint256", "name": "totalUserWithdrawn", "type": "uint256" },
      { "internalType": "uint256", "name": "poolCount", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Pending Rewards ---
  {
    "inputs": [{ "internalType": "address", "name": "userAddr", "type": "address" }],
    "name": "pendingRewards",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Global/Pool Utility ---
  {
    "inputs": [],
    "name": "getTotalStakedAcrossPools",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getPoolAPR",
    "outputs": [{ "internalType": "uint256", "name": "aprBps", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poolLength",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getEmissionStatus",
    "outputs": [
      { "internalType": "uint256", "name": "currentBps", "type": "uint256" },
      { "internalType": "uint256", "name": "emissionPerSecond", "type": "uint256" },
      { "internalType": "uint256", "name": "phaseStart", "type": "uint256" },
      { "internalType": "uint256", "name": "phaseEnd", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Staking Actions ---
  {
    "inputs": [
      { "internalType": "uint256", "name": "pid", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "pid", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimToWallet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // --- Admin ---
  {
    "inputs": [{ "internalType": "address", "name": "charityWallet", "type": "address" }],
    "name": "addPool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "pid", "type": "uint256" }],
    "name": "retirePool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "newBps", "type": "uint256" }],
    "name": "setTreasuryBps",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "start", "type": "uint256" }, { "internalType": "uint256", "name": "end", "type": "uint256" }, { "internalType": "uint256", "name": "bps", "type": "uint256" }],
    "name": "addPhase",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "sweep",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
];