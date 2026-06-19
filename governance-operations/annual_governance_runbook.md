# OBN — Annual Governance Cycle Runbook

Full lifecycle for an annual governance cycle: from starting the cycle through both
phases of voting to final execution. The first cycle is planned for **9 September 2027**.

---

## Addresses

| Contract | Address |
|---|---|
| AnnualGovernance (proxy) | `0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270` |
| TheOffering | `0xc75B2a5C7B8F88327D44C223769cFa19cc93E341` |
| ExtendOliveBranch | `0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B` |
| OPERATOR_SAFE (voteAdmin) | `0x066e2FABb036deab7DC58bAde428F819AC3542DD` |

---

## How a cycle works

```
OPERATOR_SAFE calls startAnnualCycle()
        │
        ▼
Phase 1 OPEN — stakers vote: Burn TheOffering balance or Give it to ExtendOliveBranch
        │  (duration = phase1Duration set at cycle start)
        ▼
executePhase1() fires automatically after phase1End (GitHub Actions bot)
        │  GIVE wins only if giveVotes > burnVotes (strictly greater)
        │  Zero participation → BURN
        ▼
Phase 2 OPEN — stakers vote: which nonprofit receives ExtendOliveBranch balance
        │  (duration = phase2Duration, clock starts at executePhase1 call time)
        ▼
executePhase2() fires automatically after phase2End (GitHub Actions bot)
        │  Winner = most votes; tie → lowest ballot index
        │  Zero participation → rollover (funds stay for next cycle)
        ▼
Cycle COMPLETED — new cycle may now be started
```

**Automation:** Once a cycle is started, `.github/workflows/execute_cycle.yml` polls
`getCycleState()` every 5 minutes and calls the permissionless `executeCurrentCycle()`
the moment a phase becomes ready — no manual execution needed for Steps 3 and 5 below.
Those steps are kept as a manual fallback only (bot outage, or wanting to force execution
sooner than the next poll).

---

## Phase durations (common values)

| Duration | Seconds |
|---|---|
| 7 days | 604800 |
| 14 days | 1209600 |
| 30 days | 2592000 |
| Minimum | 86400 (1 day) |

---

## Step 1 — Start the cycle (OPERATOR_SAFE)

`startAnnualCycle` is called directly by OPERATOR_SAFE (as voteAdmin). No Timelock delay.

```bash
node scripts/governance/gen_safe_startAnnualCycle.js \
  --phase1 <seconds> --phase2 <seconds>
```

**Output:** `governance-operations/YYYY-MM-DD-startAnnualCycle.json`

Import into Safe Transaction Builder → sign with 2-of-3 → execute.

**What happens on execution:**
- `snapshotBlock` is set to `block.number - 1` — voting power is locked at that block
- The ballot is built from all non-removed pools' charity wallets (deduplicated)
- Every ballot address must already be approved in ExtendOliveBranch or the tx reverts
- Phase 1 opens immediately; Phase 2 clock does not start until `executePhase1` is called

**Verify after execution:**
- `getCycleState(currentCycleId)` == `PHASE1_OPEN`
- `currentCycleId` incremented by 1
- `getVotingPowerForCycle(cycleId, addr)` returns correct power for known stakers

---

## Step 2 — Phase 1 voting (stakers)

Stakers call `castOfferingVote(cycleId, burn)` directly on AnnualGovernance.

- `burn = true` → vote to burn TheOffering's accumulated OBN
- `burn = false` → vote to send it to ExtendOliveBranch

No Safe required. Stakers interact via the frontend or directly via Basescan.

Pre-upgrade stakers with no checkpoint are lazy-bootstrapped automatically on their
first vote — their voting power will be correct.

Monitor live totals via `getCycleSummary(cycleId)` — returns a tuple including
`burnVotes` and `giveVotes` (there is no standalone `getBurnVotes`/`getGiveVotes` getter).

---

## Step 3 — Execute Phase 1 (automatic — manual fallback below)

Normally fires on its own: the GitHub Actions bot detects `PHASE1_READY` and calls
`executeCurrentCycle()` within ~5 minutes of `phase1End`. No action needed.

Manual fallback (permissionless — anyone can call, no Safe required):

```bash
cast send 0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270 \
  "executeCurrentCycle()" \
  --rpc-url https://mainnet.base.org --account <any-funded-keystore>
```

Or target a specific cycle:
```bash
cast send 0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270 \
  "executePhase1(uint256)" <cycleId> \
  --rpc-url https://mainnet.base.org --account <any-funded-keystore>
```

**What happens:**
- GIVE wins only if `giveVotes > burnVotes` (strictly greater; ties go to BURN)
- Zero participation → BURN
- If BURN: `TheOffering.burn(balance)` — OBN is permanently destroyed
- If GIVE: `TheOffering.sendToExtend(balance)` — OBN transferred to ExtendOliveBranch
- Phase 2 clock starts now (not at cycle start)

**Verify:**
- `getCycleState(cycleId)` == `PHASE2_OPEN`
- Check `Phase1Executed` event for outcome and amount

---

## Step 4 — Phase 2 voting (stakers)

Stakers call `castNonprofitVote(cycleId, nonprofitAddress)` on AnnualGovernance.

The ballot is the list of active nonprofit charity wallets set at cycle start.
Stakers vote for which nonprofit receives ExtendOliveBranch's full accumulated balance.

Monitor live totals:
- `getNonprofitVotes(cycleId, nonprofitAddress)` — votes for a specific nonprofit

---

## Step 5 — Execute Phase 2 (automatic — manual fallback below)

Normally fires on its own: the GitHub Actions bot detects `PHASE2_READY` and calls
`executeCurrentCycle()` within ~5 minutes of `phase2End`. No action needed.

Manual fallback (permissionless — anyone can call, no Safe required):

```bash
cast send 0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270 \
  "executeCurrentCycle()" \
  --rpc-url https://mainnet.base.org --account <any-funded-keystore>
```

**What happens:**
- Winner = nonprofit with the most votes
- Tie → lowest index on the ballot wins
- Zero participation → rollover (ExtendOliveBranch balance stays for next cycle)
- If winner found: `ExtendOliveBranch.distributeFromGovernance(winner, balance)`

**Verify:**
- `getCycleState(cycleId)` == `COMPLETED`
- Check `Phase2Executed` or `Phase2RolledOver` event

---

## Emergency — Cancel a cycle

`cancelCycle` can only be called **before** `executePhase1`. Once TheOffering has been
triggered, the cycle must run to completion.

```bash
node scripts/governance/gen_safe_cancelCycle.js --action schedule --cycle <N>
```

Wait 24h, then:

```bash
SALT=0x... OP_ID=0x... \
node scripts/governance/gen_safe_cancelCycle.js --action execute --cycle <N>
```

After cancellation the cycle is permanently cancelled. A new cycle can be started
immediately since the previous one is in CANCELLED state.

---

## Record keeping

Commit the `startAnnualCycle` Safe JSON and any cancel JSONs to `governance-operations/`.
Note the cycle ID, outcome, and amounts in the commit message.
