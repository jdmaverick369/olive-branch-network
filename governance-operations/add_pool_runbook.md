# OBN — Add and Bootstrap a Nonprofit Pool

Complete checklist for onboarding a new nonprofit pool post-v9.3. Every admin function
goes through the 2-of-3 OPERATOR_SAFE. Two separate Safe transactions are required: one
to schedule through the Timelock, one to execute 24 hours later. A third Safe transaction
bootstraps the 1,000,000 OBN genesis stake.

---

## Addresses

| Contract | Address |
|---|---|
| OBNToken | `0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685` |
| StakingPools (proxy) | `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` |
| ExtendOliveBranch | `0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B` |
| Timelock | `0x86396526286769ace21982E798Df5eef2389f51c` |
| OPERATOR_SAFE | `0x066e2FABb036deab7DC58bAde428F819AC3542DD` |

---

## Prerequisites

- Add the nonprofit to `scripts/governance/nonprofits.js` (name + wallet).
- Confirm the next PID by checking `poolLength()` on the staking proxy at Basescan.
- Confirm OPERATOR_SAFE holds ≥ 1,000,000 OBN for the genesis bootstrap.
- Have .env populated with `OBN_STAKING_CONTRACT`, `TIMELOCK_ADDR`, `EXTENDING_OB_ADDR`, `OPERATOR_SAFE`, `OBN_TOKEN_CONTRACT`.

---

## Step 1 — Schedule via Timelock (Safe tx #1)

Run the schedule script to generate calldata and a Safe JSON:

```bash
npx hardhat run scripts/governance/gen_safe_addPool.js --network base -- --pid <N>
```

The script resolves the charity wallet from `nonprofits.js` by PID. Pass `--charity 0x...`
to override if the wallet differs from the registry entry.

This batches two calls atomically in one `Timelock.scheduleBatch`:
- `StakingPools.addPool(charityWallet)` — creates the pool
- `ExtendOliveBranch.setApprovedNonprofit(charityWallet, true)` — approves the wallet for AnnualGovernance ballot

**Output:** `governance-operations/YYYY-MM-DD-addPool-pidN-schedule.json`

Copy the exported env vars printed to console — you will need them in Step 3:
```
export TARGETS_CSV="..."
export VALUES_CSV="..."
export DATAS_HEX_CSV="..."
export PREDECESSOR="..."
export SALT="..."
export OP_ID="..."
```

**Import the JSON into Safe Transaction Builder → sign with 2-of-3 → execute.**

---

## Step 2 — Wait the Timelock Delay

The Timelock delay is **24 hours** (86,400 seconds).

Track progress using the OP_ID printed in Step 1:

```bash
OP_ID=0x... node scripts/governance/timelock_countdown.js
```

Do not proceed until the countdown reaches zero and `isOperationReady(opId)` returns `true`.

---

## Step 3 — Execute via Timelock (any EOA)

The Timelock's `EXECUTOR_ROLE` is held by `address(0)`, meaning **anyone** can call
`executeBatch`. Use any funded EOA with the values printed in Step 1:

```bash
cast send 0x86396526286769ace21982E798Df5eef2389f51c \
  "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)" \
  "[$TARGETS_CSV]" "[$VALUES_CSV]" "[$DATAS_HEX_CSV]" "$PREDECESSOR" "$SALT" \
  --rpc-url https://mainnet.base.org --account <keystore>
```

**After execution, verify on Basescan:**
- `poolLength()` should have incremented by 1
- `getPoolInfo(pid)` should return the nonprofit's charity wallet
- `ExtendOliveBranch.approvedNonprofit(charityWallet)` should return `true`

---

## Step 4 — Bootstrap the Genesis Stake (Safe tx #3)

The genesis bootstrap deposits **1,000,000 OBN** permanently locked to the nonprofit's
wallet. OPERATOR_SAFE is `charityFundOperator` and must call `charityFundBootstrap`
directly using tokens it holds.

Generate the bootstrap Safe JSON:

```bash
node scripts/governance/gen_safe_bootstrap.js --pid <N>
# Optional: --amount 1000000 (default)
```

Wallet is resolved from `nonprofits.js`. Pass `--charity 0x...` to override.

**Output:** `governance-operations/YYYY-MM-DD-bootstrap-pidN.json`

This batches two calls in a single Safe transaction:
1. `OBNToken.approve(stakingProxy, 1_000_000e18)` — grant allowance from Safe
2. `StakingPools.charityFundBootstrap(pid, 1_000_000e18, charityWallet)` — lock stake

**Import into Safe Transaction Builder → sign with 2-of-3 → execute.**

**After execution, verify on Basescan:**
- `userAmount(pid, charityWallet)` = 1,000,000 OBN (in wei: `1000000000000000000000000`)
- `lockedAmount(pid, charityWallet)` = 1,000,000 OBN (permanently locked, cannot be withdrawn)

---

## Step 5 — Record Keeping

Rename the three Safe JSON files with the actual date and commit to the repo under
`governance-operations/`:

```
YYYY-MM-DD-addPool-pidN-schedule.json
YYYY-MM-DD-addPool-pidN-execute.json   (if Safe JSON was used for execute)
YYYY-MM-DD-bootstrap-pidN.json
```

---

## Notes

- A pool can only be added when `poolLength() < 99` (the 99-pool cap).
- `addPool` and `setApprovedNonprofit` are batched atomically — a pool is never added
  without ExtendOliveBranch approval, and vice versa.
- The bootstrap is permanently locked: `charityFundBootstrap` calls `depositWithLock`
  internally. The nonprofit receives rewards from this stake but can never withdraw principal.
- If a pool is later shut down, its charity wallet is removed from future AnnualGovernance
  ballots but the locked bootstrap stake remains in the contract.
- `schedule_bootstrap.js` (the old script) is not compatible with v9.3 because it expects
  a raw private key for the charityFund. Use `gen_safe_bootstrap.js` instead.
