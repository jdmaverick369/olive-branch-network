# OBN — v9.4 Upgrade: Community-Funded Pool Seeding (Seed contract)

Reserve update: consolidation is complete. The 300M OBN allocation includes 11M already seeded and 289M remaining at consolidation for 289 additional 1M seeds. A separate 50M OBN protocol reserve remains. This reserve capacity is not a pool cap and does not itself imply the v9.4/Seed contracts have been deployed.

Release order: deploy [V9.3.1 monthly autoclaim](v931_autoclaim_runbook.md) first.
V9.4 must preserve `MonthlyAutoClaimUpgradeable` and its ERC-7201 namespace,
including the configured executor, user consent and monthly claim records.
Run `MonthlyAutoClaim.test.js` before V9.4 release to validate V9.3.1-to-V9.4
storage compatibility and behavior. Do not deploy an older V9.4 build that lacks
these changes. The V9.4 compiler override uses optimizer runs=1 to stay within
the contract-size limit; recheck size after every future modification.

One-time upgrade that authorizes a new `Seed` contract to call
`charityFundBootstrap` on the staking proxy — nothing else. This lets additional approved pools be seeded by community donations as the 300M OBN Nonprofit Seed Reserve allocation is exhausted. The allocation supports 300 seeds in total, not a specific pool-ID cutoff. After this upgrade executes once, no
further Timelock or Safe action is needed for the community-funded seed deposit itself. Pool creation and recipient approval still require the multisig/Timelock.

This upgrade also adds a new rule to the core staking contract: `deposit()`/`depositFor()`/
`depositWithPermit()` now require a pool to already be bootstrapped (have its nonprofit's own
genesis lock in place) before the public can stake into it. This is backfilled automatically
for every pool that's already bootstrapped as of this upgrade — **but only if the backfill can
still find the stake under the pool's current charity wallet.** See the mandatory pre-upgrade
audit in Prerequisites below — skipping it can leave an already-bootstrapped pool incorrectly
gated, or (worse) allow a second genesis lock to be raised for it.

See `community_seed_pool_runbook.md` for the steady-state onboarding flow this upgrade enables.

---

## Addresses

| Contract | Address |
|---|---|
| OBNToken | `0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685` |
| StakingPools (proxy) | `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` |
| Timelock | `0x86396526286769ace21982E798Df5eef2389f51c` |
| OPERATOR_SAFE | `0x066e2FABb036deab7DC58bAde428F819AC3542DD` |
| StakingPoolsV94 implementation | *(deployed in Step 1 below)* |
| Seed | *(deployed in Step 2 below)* |

---

## Prerequisites

- **Mandatory: audit every existing pool for a charity-wallet rotation that happened WITHOUT a
  matching `migrateBootstrap()` call.** This is a one-time, backward-looking check only.
  `OBNStakingPoolsV94.updateCharityWallet` now reverts on-chain (`"bootstrapped: use
  migrateBootstrap"`) if the pool already holds a genesis stake, so this gap can no longer be
  created by any rotation that happens once this implementation is live — not by
  `gen_safe_updateCharityWallet.js`, not by a hand-crafted Safe transaction, not by any future
  tool. It can only exist from rotations that already happened on the pre-v9.4 contract, which
  had no such check. The `poolBootstrapped` backfill in `setSeedContract`
  can only see the pool's CURRENT charity wallet's balance — it has no way to look up past
  wallets on-chain. `updateCharityWallet()` changes only `poolInfo[pid].charityWallet`; it does
  NOT move the pool's existing `userAmount`/`lockedAmount`. Only `migrateBootstrap()` actually
  moves the position. So: for every pool, pull its `CharityWalletUpdated` events (full history,
  via an indexer or a paid Basescan/RPC plan — a free-tier `eth_getLogs` call cannot cover the
  full block range) and confirm any wallet change was followed by a corresponding
  `migrateBootstrap()`. If you find one that wasn't, remediate it BEFORE proceeding to Step 3.
  Skipping this can (a) leave an already-bootstrapped pool incorrectly gated from public
  staking, or (b) worse, let a full second `Seed` campaign raise another 1,000,000 OBN and lock
  it under the same pid — see the "HISTORICAL LIMITATION" test in `test/Seed.test.js` for exactly
  this scenario reproduced end-to-end.

  **Remediation is NOT a bare `migrateBootstrap(pid, oldWallet, currentWallet)` call** — that
  reverts with `"oldNonprofit not pool charity"`, because by the time you're remediating, the
  pool's *current* charity wallet is already `currentWallet`, not `oldWallet`, and
  `migrateBootstrap` requires `oldNonprofit == poolInfo[pid].charityWallet`. Instead, batch
  these two calls atomically through the Timelock (same `scheduleBatch`/`executeBatch` pattern
  as everywhere else in this runbook):
  1. `updateCharityWallet(pid, oldWallet)` — restores `oldWallet` as the pool's current charity
     wallet so `migrateBootstrap`'s check passes. `oldWallet` still holds the bootstrap stake at
     this point, so this step alone doesn't move any funds.
  2. `migrateBootstrap(pid, oldWallet, currentWallet)` — now `oldNonprofit == currentCharity`
     holds; this moves the bootstrap position (and pending rewards) from `oldWallet` to
     `currentWallet` and sets `poolInfo[pid].charityWallet` back to `currentWallet` in the same
     call.

  This requires `userAmount[pid][currentWallet] == 0` going in (true for the case this fixes —
  `currentWallet` never received a bootstrap, which is exactly why the backfill missed it). If
  a second `Seed` campaign already raised and locked a duplicate bootstrap under `currentWallet`
  before you catch this, `migrateBootstrap` will reject the destination (`"newNonprofit already
  staked"`) and this two-step remediation no longer applies — that pool needs a purpose-built
  fix reconciling the two locked positions, not this runbook step.
- Full test coverage passing for `Seed` and the widened `StakingPoolsV94`
  access checks (see `test/Seed.test.js`), including regression checks that
  `setLockedAmount`/`depositForWithLock` still reject any caller other than
  `charityFund`/`charityFundOperator`, that the `poolBootstrapped` backfill correctly marks
  every already-bootstrapped pool without wrongly marking an in-limbo (added-but-not-yet-
  bootstrapped) pool, and that a mid-campaign `updateCharityWallet()` call blocks further
  `Seed` contributions/finalization rather than silently redirecting escrowed donations.
- A full rehearsal on Base Sepolia: deploy both new contracts, run this exact upgrade flow
  against a test Timelock, then run one full community-seed cycle end-to-end before touching
  mainnet.
- `.env` populated with `OBN_STAKING_CONTRACT`, `TIMELOCK_ADDR`, `OPERATOR_SAFE`,
  `OBN_TOKEN_CONTRACT` (all already set from prior upgrades), plus `MIN_CONTRIBUTION_OBN`
  if you want something other than the 500 OBN default.

---

## Step 1 — Deploy the new implementation

```bash
npx hardhat run scripts/deploy/deploy_stakingpools_v94_impl.js --network base
```

Copy the printed address into `.env` as `STAKING_V94_IMPL_ADDR`.

## Step 2 — Deploy Seed

```bash
npx hardhat run scripts/deploy/deploy_seed.js --network base
```

Copy the printed address into `.env` as `SEED_ADDR`. This deploy grants the
contract no rights on its own — it can't call `charityFundBootstrap` until Step 3 executes.

## Step 3 — Schedule via Timelock (Safe tx #1)

```bash
npx hardhat run scripts/governance/gen_safe_upgradeV94.js --network base -- --action schedule
```

This bundles `StakingPools.upgradeTo(newImpl, setSeedContract(seedAddr))`
into a single Timelock `scheduleBatch` call (one target, not a multi-call batch).

**Output:** `governance-operations/YYYY-MM-DD-upgradeV94-schedule.json`

Copy the printed `SALT` and `OP_ID` — needed for Step 5.

**Import the JSON into Safe Transaction Builder → sign with 2-of-3 → execute.**

## Step 4 — Wait the Timelock Delay

24 hours (86,400 seconds), same as every other Timelock operation.

```bash
OP_ID=0x... node scripts/governance/timelock_countdown.js
```

## Step 5 — Execute via Timelock (any EOA)

```bash
SALT=0x... OP_ID=0x... npx hardhat run scripts/governance/gen_safe_upgradeV94.js --network base -- --action execute
```

Import the generated execute JSON into Safe Transaction Builder (or use `cast send` directly
against the Timelock, as in `add_pool_runbook.md` Step 3) — the `EXECUTOR_ROLE` is open, so any
funded EOA can execute once ready.

**After execution, verify on Basescan:**
- `StakingPools.version()` returns `"9.4"`
- `StakingPools.seedContract()` returns the `Seed` address from Step 2
- `StakingPools.poolBootstrapped(pid)` returns `true` for every pool that was ACTUALLY
  bootstrapped before this upgrade (not necessarily every existing pid — an added-but-never-
  bootstrapped pool correctly stays `false`). Spot-check a few, including any pool the
  pre-upgrade audit above flagged as previously wallet-rotated.
- `setLockedAmount` and `depositForWithLock` still revert for any address other than
  `charityFund`/`charityFundOperator` — this upgrade must not have touched those paths

## Step 6 — Dry run before relying on it

Before pointing a real nonprofit's onboarding at this, confirm the `Seed` contract can
actually call `charityFundBootstrap` successfully — e.g. by watching the first real campaign
(see `community_seed_pool_runbook.md`) closely rather than assuming it works from the upgrade
succeeding alone.

---

## Notes

- This is a one-time operation. There is no mutable setter for `seedContract` —
  changing it later requires a new upgrade, by the same design principle that governs
  `charityFund`/`charityFundOperator`/`treasury`.
- The upgrade widens exactly three call sites in `charityFundBootstrap`'s call chain
  (`charityFundBootstrap` itself, `_enforceCharitySelfStakePolicy`, `_applyLockIfNeeded`).
  `setLockedAmount` and `depositForWithLock` are deliberately untouched.
- The upgrade also tightens `updateCharityWallet`: it now reverts (`"bootstrapped: use
  migrateBootstrap"`) if the pool already holds a genesis stake, regardless of whether that
  stake came from the operator Safe or a community `Seed` campaign. See
  `charity_wallet_runbook.md` for the operational impact.
- `minContribution` on `Seed` IS mutable (Timelock-gated) — unlike everything
  else in this upgrade, it's expected to be adjusted over time as OBN's price moves, so a fixed
  OBN floor doesn't accidentally price out contributors.
- This is a pure-donation model: contributions are tracked on-chain (events + the
  `contributions` ledger) for donation record-keeping purposes only. There is no NFT, no
  badge, and no financial claim of any kind for contributors.
- The operator Safe's existing bootstrap path (`gen_safe_bootstrap.js`) is unaffected — it can
  still be used for any pool, community-funded or not.
