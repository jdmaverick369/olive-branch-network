# OBN — Charity Wallet Operations

Covers two distinct operations for managing a nonprofit's wallet association with a pool.
Choose the right one based on what needs to change.

---

## Which operation do you need?

| Scenario | Operation |
|---|---|
| Nonprofit rotates their receiving wallet; you only need future 10% emissions to go to the new address | **updateCharityWallet** |
| Nonprofit's wallet is compromised or they're fully migrating; you need to move the locked genesis stake too | **migrateBootstrap** |

Key difference: `updateCharityWallet` leaves the 1,000,000 OBN bootstrap stake sitting at the old wallet. `migrateBootstrap` moves everything — stake, lock, and reward debt — to the new wallet atomically and also updates the charity wallet. If in doubt, use `migrateBootstrap`.

Both are `onlyOwner` → require Timelock proposal signed by OPERATOR_SAFE (schedule → 24h → execute).

---

## Addresses

| Contract | Address |
|---|---|
| StakingPools (proxy) | `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` |
| Timelock | `0x86396526286769ace21982E798Df5eef2389f51c` |
| OPERATOR_SAFE | `0x066e2FABb036deab7DC58bAde428F819AC3542DD` |

---

## Option A — updateCharityWallet

Redirects future 10% pool emissions to a new wallet. The genesis bootstrap stake stays at the old wallet and continues generating rewards there.

### Prerequisites

- Confirm `getPoolInfo(pid).charityWallet` matches the expected current wallet
- Confirm the nonprofit controls the new wallet
- The new wallet can be any address (does not need to be clean)

### Step 1 — Schedule

```bash
node scripts/governance/gen_safe_updateCharityWallet.js \
  --action schedule --pid <N> --new 0xNEW_WALLET
```

**Output:** `governance-operations/YYYY-MM-DD-updateCharityWallet-pidN-schedule.json`

Save the printed `SALT` and `OP_ID`.

### Step 2 — Wait 24 hours

```bash
OP_ID=0x... node scripts/governance/timelock_countdown.js
```

### Step 3 — Execute

```bash
SALT=0x... OP_ID=0x... \
node scripts/governance/gen_safe_updateCharityWallet.js \
  --action execute --pid <N> --new 0xNEW_WALLET
```

### Step 4 — Verify and update registry

- `getPoolInfo(pid).charityWallet` == new wallet ✓
- Update `nonprofits.js` with the new wallet address for PID N

---

## Option B — migrateBootstrap

Full wallet migration: moves the locked genesis stake (balance + lock + reward debt) from old to new wallet, and updates the pool's charity wallet. The new wallet receives the bootstrap stake AND future 10% emissions.

### Prerequisites

| Check | Function | Expected |
|---|---|---|
| Pool charity wallet | `getPoolInfo(pid)` | charityWallet == oldWallet |
| Bootstrap stake exists | `userAmount(pid, oldWallet)` | > 0 |
| New wallet is clean in this pool | `userAmount(pid, newWallet)` | == 0 |

Get written confirmation from the nonprofit that they control the new wallet.
**This operation is not reversible without running migrateBootstrap again.**

### Step 1 — Schedule

```bash
node scripts/governance/gen_safe_migrateBootstrap.js \
  --action schedule --pid <N> --new 0xNEW_WALLET
```

The `--old` address is looked up automatically from `nonprofits.js`. Pass `--old 0x...` to override.

**Output:** `governance-operations/YYYY-MM-DD-migrateBootstrap-pidN-schedule.json`

Save the printed `SALT` and `OP_ID`.

### Step 2 — Wait 24 hours

```bash
OP_ID=0x... node scripts/governance/timelock_countdown.js
```

### Step 3 — Execute

```bash
SALT=0x... OP_ID=0x... \
node scripts/governance/gen_safe_migrateBootstrap.js \
  --action execute --pid <N> --new 0xNEW_WALLET
```

### Step 4 — Verify and update registry

| Check | Function | Expected |
|---|---|---|
| Pool charity updated | `getPoolInfo(pid)` | charityWallet == newWallet |
| New wallet has stake | `userAmount(pid, newWallet)` | > 0 |
| Old wallet zeroed | `userAmount(pid, oldWallet)` | 0 |
| Lock transferred | `lockedAmount(pid, newWallet)` | > 0 |

Update `nonprofits.js` with the new wallet for PID N.

---

## Record Keeping

Commit Safe JSONs to the repo under `governance-operations/` after each operation.

---

## Notes

- Future AnnualGovernance ballot entries follow `getPoolInfo(pid).charityWallet`, so both operations automatically update which wallet appears on the Phase 2 nonprofit ballot.
- Accumulated rewards already minted to the old wallet are NOT affected by either operation.
- `migrateBootstrap` verifies pending rewards are preserved within 1 wei and will revert if not.
