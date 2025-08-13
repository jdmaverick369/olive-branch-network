export const stakingAbi = [
  // ---- views
  { "type":"function","stateMutability":"view","name":"stakingToken","inputs":[],"outputs":[{"type":"address"}]},
  { "type":"function","stateMutability":"view","name":"treasury","inputs":[],"outputs":[{"type":"address"}]},
  { "type":"function","stateMutability":"view","name":"treasuryBps","inputs":[],"outputs":[{"type":"uint256"}]},
  { "type":"function","stateMutability":"view","name":"CHARITY_BPS","inputs":[],"outputs":[{"type":"uint256"}]},
  { "type":"function","stateMutability":"view","name":"poolLength","inputs":[],"outputs":[{"type":"uint256"}]},
  { "type":"function","stateMutability":"view","name":"globalTotalStaked","inputs":[],"outputs":[{"type":"uint256"}]},

  // pool & user views
  { "type":"function","stateMutability":"view","name":"getPoolInfo",
    "inputs":[{"type":"uint256","name":"pid"}],
    "outputs":[{"type":"address","name":"charityWallet"},{"type":"bool","name":"active"},{"type":"uint256","name":"totalStaked"}]
  },
  { "type":"function","stateMutability":"view","name":"getUserStakeValue",
    "inputs":[{"type":"uint256","name":"pid"},{"type":"address","name":"userAddr"}],
    "outputs":[{"type":"uint256"}]
  },
  { "type":"function","stateMutability":"view","name":"pendingRewards",
    "inputs":[{"type":"uint256","name":"pid"},{"type":"address","name":"userAddr"}],
    "outputs":[{"type":"uint256"}]
  },
  { "type":"function","stateMutability":"view","name":"getPoolAPR",
    "inputs":[{"type":"uint256","name":"pid"}],
    "outputs":[{"type":"uint256","name":"aprBps"}]
  },
  { "type":"function","stateMutability":"view","name":"unlockedBalance",
    "inputs":[{"type":"uint256","name":"pid"},{"type":"address","name":"user"}],
    "outputs":[{"type":"uint256"}]
  },

  // ---- write actions
  { "type":"function","stateMutability":"nonpayable","name":"deposit",
    "inputs":[{"type":"uint256","name":"pid"},{"type":"uint256","name":"amount"}],"outputs":[] },
  { "type":"function","stateMutability":"nonpayable","name":"withdraw",
    "inputs":[{"type":"uint256","name":"pid"},{"type":"uint256","name":"amount"}],"outputs":[] },
  { "type":"function","stateMutability":"nonpayable","name":"claim",
    "inputs":[{"type":"uint256","name":"pid"}],"outputs":[] }
];
