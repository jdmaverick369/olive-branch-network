# OBN — Pool Shutdown and Removal Runbook

Use this when a nonprofit pool needs to be decommissioned. Shutdown and removal are
two separate Timelock operations that must happen in sequence.

**Shutdown** blocks new deposits but lets existing stakers withdraw at their own pace.
**Removal** permanently deletes the pool from the contract — requires the pool to be
completely empty (totalStaked == 0) first.

Both are `onlyOwner` → Timelock proposals signed by OPERATOR_SAFE.

---

## Addresses

| Contract | Address |
|---|---|
| StakingPools (proxy) | `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` |
| Timelock | `0x86396526286769ace21982E798Df5eef2389f51c` |
| OPERATOR_SAFE | `0x066e2FABb036deab7DC58bAde428F819AC3542DD` |

---

## Phase 1 — Shutdown the pool

Blocks new deposits. Existing stakers can still withdraw and claim rewards normally.
The pool remains on the AnnualGovernance ballot until it is fully removed.

### Step 1 — Schedule shutdown

```bash
node scripts/governance/gen_safe_shutdownPool.js --action schedule --pid <N>
```

**Output:** `governance-operations/YYYY-MM-DD-shutdownPool-pidN-schedule.json`

Save the printed `SALT` and `OP_ID`.

### Step 2 — Wait 24 hours

```bash
OP_ID=0x... node scripts/governance/timelock_countdown.js
```

### Step 3 — Execute shutdown

```bash
SALT=0x... OP_ID=0x... \
node scripts/governance/gen_safe_shutdownPool.js --action execute --pid <N>
```

**Verify:** `poolRemoved[pid]` (or check that a deposit attempt to PID N reverts).

### Step 4 — Notify stakers

Communicate to stakers that PID N is shutting down. They should withdraw at their
convenience. The 1,000,000 OBN genesis bootstrap is permanently locked and cannot
be withdrawn — it stays in the contract.

---

## Phase 2 — Wait for stakers to exit

The pool cannot be removed until `totalStaked == 0`. Check current stake:

```bash
# On Basescan read tab:
getPoolInfo(<pid>)  →  totalStaked field
```

If most stakers have exited but a few wallets remain stuck, use `forceExitUserToSelf`
to eject them (see below).

---

## Phase 3 — Remove the pool

`removePool` permanently removes the pool. The on-chain call reverts if `totalStaked > 0`.

### Step 1 — Schedule removal

```bash
node scripts/governance/gen_safe_removePool.js --action schedule --pid <N>
```

**Output:** `governance-operations/YYYY-MM-DD-removePool-pidN-schedule.json`

Save the printed `SALT` and `OP_ID`.

### Step 2 — Wait 24 hours

```bash
OP_ID=0x... node scripts/governance/timelock_countdown.js
```

### Step 3 — Execute removal

```bash
SALT=0x... OP_ID=0x... \
node scripts/governance/gen_safe_removePool.js --action execute --pid <N>
```

**Verify:**
- `poolFullyRemoved(pid)` returns `true`
- `getPoolInfo(pid).charityWallet` has been set to the treasury address (rewards from any
  remaining accrual go to treasury rather than address(0))
- Pool no longer appears on future AnnualGovernance ballots

### Step 4 — Update nonprofits.js

Mark the entry in `scripts/governance/nonprofits.js` as removed:

```js
{ pid: N, name: "NONPROFIT NAME [REMOVED]", wallet: "0x..." },
```

Do not delete the entry — preserving the PID mapping avoids confusion if scripts are
run against historical data.

---

## Emergency — Force exit a specific user

If a staker is unresponsive and the pool can't reach `totalStaked == 0`, the Timelock
can force-exit them back to their own wallet.

```bash
# With rewards:
node scripts/governance/gen_safe_forceExitUserToSelf.js \
  --action schedule --pid <N> --user 0xSTUCK_WALLET --claim

# Without rewards (if reward minting would fail for some reason):
node scripts/governance/gen_safe_forceExitUserToSelf.js \
  --action schedule --pid <N> --user 0xSTUCK_WALLET
```

Wait 24h, then execute:

```bash
SALT=0x... OP_ID=0x... \
node scripts/governance/gen_safe_forceExitUserToSelf.js \
  --action execute --pid <N> --user 0xSTUCK_WALLET [--claim]
```

The user's full position is withdrawn to their own wallet. Repeat for each stuck address
until `totalStaked == 0`.

---

## Notes

- Shutdown and removal each require their own Timelock cycle (24h delay each). Minimum
  total time from shutdown decision to pool removal is **48 hours** plus however long
  stakers take to exit.
- The 1,000,000 OBN genesis bootstrap stake is permanently locked — `removePool` requires
  `totalStaked == 0` but the bootstrap is included in `totalStaked`. This means the genesis
  stake must also be force-exited before a pool can be fully removed.
- Removed pools are excluded from future AnnualGovernance ballots (`poolFullyRemoved` flag).
  Shutdown pools that haven't been fully removed remain on the ballot.
