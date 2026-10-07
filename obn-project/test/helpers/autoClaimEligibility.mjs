// Pools a monthly autoclaim may include for `user`: staked, not yet auto-claimed this
// month, and a non-zero integer-rounded 88% user payout (the contract's
// NoClaimableRewards rule). Off-chain claim services should select pools the same way.
export async function findEligiblePools(user, pools, month, staking, lens) {
  const eligiblePools = [];
  for (let pid = 0; pid < pools; pid++) {
    if (await staking.userAmount(pid, user) === 0n || await staking.lastAutoClaimMonth(pid, user) === BigInt(month)) continue;
    if ((await lens.pendingRewards(pid, user)) * 8800n / 10000n === 0n) continue;
    eligiblePools.push(pid);
  }
  return eligiblePools;
}
