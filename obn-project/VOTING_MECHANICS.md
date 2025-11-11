# OBN Governance Voting Mechanics

## Overview

The OBN DAO supports **4 proposal types** with **2 different voting mechanisms**:

---

## Voting Mechanisms

### 1. Yes/No Vote (For/Against)

**Used For:**
- Single nonprofit Add Pool proposals
- Remove Pool proposals
- Update APY proposals
- Protocol Upgrade proposals

**How It Works:**
- Vote YES (support = true) or NO (support = false)
- Passing requires: `votesFor > votesAgainst` AND quorum met
- Not voting = **abstain** (not counted as NO)

**Example:**
```
Proposal: Add Ocean Cleanup Initiative
- Alice: YES (100k OBN)
- Bob: NO (50k OBN)
- Charlie: YES (75k OBN)
- Dave: YES (200k OBN)
- Frank: (abstains - doesn't vote)

Result:
- YES: 375k OBN
- NO: 50k OBN
- Total Votes: 425k OBN
- Quorum: 440k OBN required
- Outcome: DEFEATED (quorum not met)

Note: If Frank had voted YES (adding 50k), total would be 475k > 440k quorum ✅
```

---

### 2. Multi-Choice Vote

**Used For:**
- Add Pool proposals with 2-4 nonprofit options

**How It Works:**
- Vote for ONE nonprofit from the list (choice 0, 1, 2, or 3)
- Plurality wins (nonprofit with most votes)
- Not voting = **abstain** (doesn't help anyone)
- Even if quorum is met, the winner is determined by relative votes

**Example:**
```
Proposal: Add Pool (3 options)
Options:
  0: Save the Whales
  1: Plant Trees DAO
  2: Clean Water Org

Votes:
- Alice: Option 0 (100k OBN) → Save the Whales
- Bob: Option 1 (50k OBN) → Plant Trees
- Charlie: Option 1 (75k OBN) → Plant Trees
- Dave: Option 0 (200k OBN) → Save the Whales
- Frank: (abstains)

Results:
- Option 0 (Save the Whales): 300k OBN ← WINNER
- Option 1 (Plant Trees): 125k OBN
- Option 2 (Clean Water): 0 OBN
- Total Votes: 425k OBN
- Quorum: 400k OBN required
- Outcome: PASSED - Save the Whales wins! ✅
```

---

## Proposal Types Breakdown

### Type 1: Add Pool

**Single Nonprofit (1 option)**
- Voting Mechanism: **Yes/No**
- Passing Criteria: `votesFor > votesAgainst` AND quorum met
- Example: "Should we add Ocean Cleanup Initiative?"
  - YES = approve this nonprofit
  - NO = reject this nonprofit
  - Abstain = don't participate

**Multiple Nonprofits (2-4 options)**
- Voting Mechanism: **Multi-Choice**
- Passing Criteria: Quorum met, then plurality wins
- Example: "Which nonprofit should we add?"
  - Pick your favorite from the list
  - Highest votes wins
  - Abstain = no preference

---

### Type 2: Remove Pool

**Always:** Yes/No Vote

- YES = remove this malicious pool
- NO = keep the pool
- Passing: `votesFor > votesAgainst` AND quorum met

**Example:**
```
Proposal: Remove Pool 1 (found to be fraudulent)
- Alice: YES (100k)
- Bob: YES (50k)
- Charlie: NO (75k)
- Dave: (abstains)

Result:
- YES: 150k OBN
- NO: 75k OBN
- Total: 225k OBN
- Quorum: 440k required
- Outcome: DEFEATED (quorum not met)
```

---

### Type 3: Update APY

**Always:** Yes/No Vote

- YES = approve new emission schedule
- NO = keep current schedule
- Passing: `votesFor > votesAgainst` AND quorum met
- Timing: Only allowed after Year 10

**Example:**
```
Proposal: Update APY to 5% for Year 11-15
- Alice: YES
- Bob: YES
- Charlie: NO
- Dave: YES

Result: PASSED (if quorum met)
```

---

### Type 4: Protocol Upgrade

**Always:** Yes/No Vote

- YES = approve upgrade to new implementation
- NO = reject upgrade
- Passing: `votesFor > votesAgainst` AND quorum met

**Example:**
```
Proposal: Upgrade to v8.10.0-governance
- Alice: YES (100k)
- Bob: YES (50k)
- Charlie: YES (75k)
- Dave: YES (200k)
- Frank: YES (50k)

Result:
- YES: 475k OBN
- NO: 0 OBN
- Total: 475k OBN
- Quorum: 440k required
- Outcome: PASSED ✅
```

---

## Abstaining (Not Voting)

**Important:** Not voting is NOT the same as voting NO!

**For Yes/No Votes:**
- Not voting = abstain
- Does not count toward YES or NO
- Does not count toward quorum
- Example: If Alice has 100k voting power but doesn't vote, quorum calculation doesn't include her 100k

**For Multi-Choice Votes:**
- Not voting = abstain
- Doesn't help any nonprofit
- Does not count toward quorum
- Your preferred nonprofit gets 0 votes from you

**Strategic Implication:**
- If you abstain, you reduce the total voting power participating
- This makes it harder to reach quorum
- If you want a proposal to pass, you should vote YES (even if you're lukewarm)
- If you want a proposal to fail, you can either vote NO or abstain (abstaining makes quorum harder to reach)

---

## Quorum Calculation

**Quorum:** 4% of total staked OBN in all pools

**Current Example** (19.1M OBN staked):
- Quorum = 19,125,254 × 4% = **765,010 OBN**

**How Quorum Works:**
```
Total Votes Cast >= Quorum Required
```

**Examples:**

**Scenario 1: Quorum Met**
```
Total Staked: 10M OBN
Quorum: 400k OBN (4%)

Votes:
- YES: 300k OBN
- NO: 125k OBN
- Abstain: 9.575M OBN (didn't vote)

Total Votes: 425k OBN ✅ (meets 400k quorum)
Result: Proposal can pass (YES > NO)
```

**Scenario 2: Quorum Not Met**
```
Total Staked: 11M OBN
Quorum: 440k OBN (4%)

Votes:
- YES: 150k OBN
- NO: 75k OBN
- Abstain: 10.775M OBN (didn't vote)

Total Votes: 225k OBN ❌ (below 440k quorum)
Result: Proposal DEFEATED (even though YES > NO)
```

---

## Voting Power Calculation

**Formula:**
```
Voting Power = Sum of all eligible stakes across all pools

Eligibility:
- Staked for 14+ days at proposal snapshot time
```

**Example:**
```
Alice's Stakes:
- Pool 0: 50k OBN (staked 20 days ago) ✅
- Pool 1: 30k OBN (staked 10 days ago) ❌
- Pool 2: 20k OBN (staked 30 days ago) ✅

Alice's Voting Power: 50k + 20k = 70k OBN
```

---

## Simulation Results

All voting mechanics have been tested and validated:

✅ **Single-Choice Add Pool (Yes/No)**
- Proposal 6: Ocean Cleanup Initiative
- YES: 375k OBN | NO: 50k OBN
- Result: Defeated (quorum not met, but would have passed on merits)

✅ **Multi-Choice Add Pool (3 options)**
- Proposal 0: Save the Whales vs Plant Trees vs Clean Water
- Winner: Save the Whales (300k votes)
- Result: Executed

✅ **Remove Pool (For/Against)**
- Proposal 1: Remove Pool 1
- FOR: 150k | AGAINST: 75k
- Result: Defeated (quorum not met)

✅ **Protocol Upgrade (For/Against)**
- Proposal 5: Upgrade to v8.10.0
- FOR: 475k | AGAINST: 0
- Result: Executed

---

## User Interface Implications

### Frontend Design Considerations

**For Single-Choice Add Pool:**
```
┌─────────────────────────────────────┐
│ Proposal: Add Ocean Cleanup         │
│                                     │
│ Should we add this nonprofit?      │
│                                     │
│ ○ YES - Approve                    │
│ ○ NO - Reject                      │
│                                     │
│ Your Voting Power: 100,000 OBN     │
│ Quorum: 765,010 OBN                │
│                                     │
│         [Submit Vote]              │
└─────────────────────────────────────┘
```

**For Multi-Choice Add Pool:**
```
┌─────────────────────────────────────┐
│ Proposal: Add Pool (Choose One)    │
│                                     │
│ Which nonprofit should we add?     │
│                                     │
│ ○ Save the Whales                  │
│   Ocean conservation               │
│                                     │
│ ○ Plant Trees DAO                  │
│   Reforestation                    │
│                                     │
│ ○ Clean Water Org                  │
│   Water access                     │
│                                     │
│ Your Voting Power: 100,000 OBN     │
│ Quorum: 765,010 OBN                │
│                                     │
│         [Submit Vote]              │
└─────────────────────────────────────┘
```

**For Yes/No Proposals (Remove/APY/Upgrade):**
```
┌─────────────────────────────────────┐
│ Proposal: Protocol Upgrade          │
│                                     │
│ Upgrade to v8.10.0-governance?     │
│                                     │
│ ○ FOR - Approve Upgrade            │
│ ○ AGAINST - Reject Upgrade         │
│                                     │
│ Your Voting Power: 100,000 OBN     │
│ Quorum: 765,010 OBN                │
│                                     │
│         [Submit Vote]              │
└─────────────────────────────────────┘
```

---

## Summary

**Key Takeaways:**

1. **Add Pool proposals adapt to context:**
   - 1 nonprofit → Yes/No vote
   - 2-4 nonprofits → Multi-choice vote

2. **All other proposals use Yes/No voting**

3. **Abstaining (not voting) is neutral:**
   - Doesn't count as NO
   - Doesn't help reach quorum
   - Strategic choice depending on your goals

4. **Quorum is based on total votes cast:**
   - Not total eligible voters
   - Must reach 4% of total staked OBN

5. **Voting power comes from staking:**
   - Must be staked for 14+ days
   - Aggregates across all pools
   - Snapshot prevents manipulation

---

**Document Version:** 1.0
**Last Updated:** November 10, 2025
**Simulation:** All scenarios passing ✅
