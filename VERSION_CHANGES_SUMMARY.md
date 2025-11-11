# StakingPools Contract Changes: v8.6.0 → v8.5.0 (Downgrade)

## Executive Summary
What's currently live on Base (v8.5.0-perpool-charity-clean) represents a **significant downgrade** from v8.6.0-gross-pending-88_10_1_1.

The v8.5.0 version is actually **OLDER** despite the lower version number. It came from an earlier snapshot and overwrote the more recent v8.6.0.

---

## Key Behavioral Changes (What Was Removed/Changed)

### 1. **Reward Accrual Mechanism** ⚠️ MAJOR
**v8.6.0 (Previous)**:
- Accrued **GROSS** rewards to the accumulator (100% of earned rewards)
- Split happened at claim time only
- Tracked "gross pending" at each step

**v8.5.0 (Current Live)**:
- Accrues **NET** rewards (only 88% to users) to the accumulator
- Splits reward into 4 buckets DURING accrual:
  - 88% (sCut) → staker accumulator
  - 10% (cCut) → charityAccrued bucket
  - 1% (tCut) → marked but not accrued
  - 1% (fCut) → marked but not accrued

### 2. **Charity Mint System** ⚠️ MAJOR
**v8.6.0**:
- Charity was **included in pending rewards calculation**
- User claims triggered computation of charity slice
- More complex reward slicing logic (45+ line `_mintSlices` function)

**v8.5.0**:
- Charity is **separate from user pending**
- Only 88% of rewards go to user pending calculation
- Simplified `_mintSlices` (only 20 lines, minimal slicing)
- Uses `charityAccrued[pid]` bucket to track per-pool charity

### 3. **Reward Calculation Complexity** 
**v8.6.0**:
```
d.pending = ((d.balBefore * d.acc) / 1e12) - d.debtBefore; // GROSS (100%)
```

**v8.5.0**:
```
d.pending = ((d.balBefore * d.acc) / 1e12) - d.debtBefore; // NET (88%)
```

The calculation looks identical, but `accRewardPerShare` is built differently (see below).

### 4. **Pool Accrual Logic** ⚠️ CRITICAL
**v8.6.0 _accruePool()**:
```solidity
uint256 rewardGross = _sumRewardAcrossPhases(...);
accRewardPerShare[pid] += Math.mulDiv(rewardGross, 1e12, p.totalStaked);
// Then:
sCut = 0;  // UNUSED - all goes to accumulator
tCut = 0;  // UNUSED
fCut = 0;  // UNUSED
```
Results in GROSS rewards in the accumulator.

**v8.5.0 _accruePool()**:
```solidity
uint256 reward = _sumRewardAcrossPhases(...);
uint256 cCut = Math.mulDiv(reward, CHARITY_BPS, TOTAL_BPS);      // 10%
uint256 tCut = Math.mulDiv(reward, TREASURY_BPS, TOTAL_BPS);     // 1%
uint256 fCut = Math.mulDiv(reward, CHARITY_FUND_BPS, TOTAL_BPS); // 1%
uint256 sCut = reward - cCut - tCut - fCut;                      // 88%

if (sCut > 0) accRewardPerShare[pid] += Math.mulDiv(sCut, 1e12, p.totalStaked);
if (cCut > 0) {
    charityAccrued[pid] += cCut;
    emit CharityAllocated(pid, cCut);
}
```
Results in NET (88%) rewards in the accumulator, with charity split out immediately.

---

## Implications

### For User Rewards
If a user had **1000 OBN staked earning 100 OBN in a period**:

**v8.6.0 behavior**:
- User pending = 100 OBN (GROSS)
- On claim: 88 OBN to user, 10 to charity, 1 to treasury, 1 to fund

**v8.5.0 behavior**:
- User pending = 88 OBN (NET)
- Charity pre-extracted to `charityAccrued[pid]` = 10 OBN
- On claim: User gets 88 OBN (already split)

**Result**: Same final numbers, but v8.5.0 extracts charity earlier (at accrual time, not claim time)

### Reward Debt Impact
The `userRewardDebt[pid][user]` tracking is affected:
- **v8.6.0**: Debt is calculated against GROSS accumulator
- **v8.5.0**: Debt is calculated against NET (88%) accumulator

This affects bootstrap reward calculations and migrations.

### Storage & Compatibility
- **No structural changes** to storage layout
- **charityAccrued mapping still exists** (for back-compat)
- **Event emissions changed** but not breaking
- **Function signatures unchanged**

---

## Risk Assessment

### What Could Go Wrong with v8.5.0
1. **Charity Bucket Issues**: If `charityAccrued[pid]` overflows or doesn't mint
2. **Rounding**: Splitting 88/10/1/1 at accrual time might lose precision
3. **Per-Pool Charity**: Charity is now per-pool, not global (could lead to uneven distribution)

### What's Missing
- No migrateBootstrap function (added in v9.0)
- No forceExitUserToSelf function (added in v9.0)
- No hardening against reward loss (added in v9.0)
- No enhanced validation (added in v9.0)

---

## Timeline

```
Commit 30a1a5b (Oct 2025)
↓
v8.6.0-gross-pending-88_10_1_1 DEPLOYED
(tracks GROSS rewards, splits at claim time)

Commit 6b867d7 (Early repo restoration)
↓
v8.5.0-perpool-charity-clean ADDED TO REPO
(tracks NET rewards, splits at accrual time)

Commit cbb0dc2 (Nov 9, 2025)
↓
governance-operations/2025-11-09-upgrade_stakingpools.json
(points to v8.5.0 implementation address, not v8.6.0!)

Nov 9, 2025 - EXECUTION
↓
v8.6.0 → v8.5.0 (DOWNGRADE executed)
```

---

## Current Production Status

- **Version Live**: 8.5.0-perpool-charity-clean
- **Previous Version**: 8.6.0-gross-pending-88_10_1_1
- **What Changed**: Reward split mechanism (GROSS → NET)
- **Storage Layout**: Identical (backward compatible)
- **Missing Features**: All v9.0 improvements (bootstrap migration, hardening, etc.)

