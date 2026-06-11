# OBN v9.3 Upgrade Execution Runbook

**Status:** Final review and hardening — do not execute until explicitly authorized.

**Constraints in force until explicitly lifted:**
- Do not deploy anything to mainnet.
- Do not transfer reserve funds.
- Do not submit any Timelock proposal.

---

## Auditing Protocol

Every phase must be independently verified by two parties before proceeding:

1. **Primary** — executor reads the on-chain values directly (cast call, block explorer, or hardhat fork).
2. **Secondary** — a second person independently reads the same values and compares. Discrepancy → full stop, investigate before continuing.

Hard stops are prefixed **[HARD STOP]**. Any hard stop triggers a mandatory halt regardless of time pressure. Investigate and resolve before proceeding; do not work around.

---

## Address Registry (fill in before execution begins)

```
OBN_TOKEN            = 0x...    (confirmed mainnet)
STAKING_PROXY        = 0x...    (confirmed mainnet)
TIMELOCK             = 0x...    (confirmed mainnet)
OPERATOR_SAFE        = 0x...    (confirmed mainnet)
OLD_CHARITY_FUND     = 0x...    (confirmed mainnet)
OLD_TREASURY         = 0x...    (confirmed mainnet)

# Deployed during this upgrade:
V93_IMPL             = 0x...
EXTENDING_OB_ADDR    = 0x...
OFFERING_ADDR        = 0x...
ANNUAL_GOV_PROXY     = 0x...
ANNUAL_GOV_IMPL      = 0x...
LENS_PROXY           = 0x...
LENS_IMPL            = 0x...
```

All addresses must be filled in and agreed upon by both auditors before Phase 3 begins.

---

## Phase 0 — Pre-flight

### 0.1 Environment

- Hardhat fork points to correct mainnet block.
- All test artifacts compiled cleanly (`npx hardhat compile`).
- OZ upgrades validator passes: `npx hardhat run scripts/validate_upgrades.js`
  - Expected output: `OBNStakingLens: PASS` and `AnnualGovernance: PASS`
- Fork tests pass: `npx hardhat test` → 105 passing / 56 pending / 0 failing.

**[HARD STOP]** OZ upgrades validator does not pass on both contracts.

### 0.2 Snapshot pre-upgrade state

Record from mainnet:

```
staking.version()                     → "9.2"
staking.globalTotalStaked()           → <value>
staking.poolLength()                  → <value>
staking.currentRewardsPerSecond()     → <value>
staking.owner()                       → TIMELOCK
```

Both auditors sign off on recorded values before continuing.

---

## Phase 1 — Deploy v9.3 Implementation (bare)

Deploy `StakingPoolsV93` as a bare implementation — not a proxy.

```bash
# Foundry
forge create contracts/StakingPoolsV93.sol:OBNStakingPools \
  --rpc-url $BASE_MAINNET_URL \
  --account <keystore>
# Record: V93_IMPL
```

### Verify

```bash
cast call $V93_IMPL "version()(string)"
# Expected: "9.3"
```

**[HARD STOP]** `version()` on the bare implementation is not "9.3".

```bash
cast call $V93_IMPL "owner()(address)"
```

**[HARD STOP]** `impl.owner()` returns Timelock, Safe, deployer, or any other privileged address. If nonzero-privileged, stop and investigate. The bare implementation must not be ownable-initialized.

---

## Phase 2 — Deploy TheOffering and ExtendOliveBranch

These are non-upgradeable. Deploy in dependency order.

### 2.1 ExtendOliveBranch

```bash
forge create contracts/ExtendOliveBranch.sol:ExtendOliveBranch \
  --constructor-args $OBN_TOKEN $TIMELOCK \
  --rpc-url $BASE_MAINNET_URL \
  --account <keystore>
# Record: EXTENDING_OB_ADDR
```

### Verify

```bash
cast call $EXTENDING_OB_ADDR "owner()(address)"
# Expected: TIMELOCK

cast call $EXTENDING_OB_ADDR "governance()(address)"
# Expected: address(0) — not yet wired
```

**[HARD STOP]** `ExtendOliveBranch.owner()` is not Timelock.

### 2.2 TheOffering

```bash
forge create contracts/TheOffering.sol:TheOffering \
  --constructor-args $OBN_TOKEN $EXTENDING_OB_ADDR $TIMELOCK \
  --rpc-url $BASE_MAINNET_URL \
  --account <keystore>
# Record: OFFERING_ADDR
```

### Verify

```bash
cast call $OFFERING_ADDR "owner()(address)"
# Expected: TIMELOCK

cast call $OFFERING_ADDR "obn()(address)"
# Expected: OBN_TOKEN

cast call $OFFERING_ADDR "extendOliveBranch()(address)"
# Expected: EXTENDING_OB_ADDR

cast call $OFFERING_ADDR "governance()(address)"
# Expected: address(0) — not yet wired
```

**[HARD STOP]** `TheOffering.owner()` is not Timelock.

**[HARD STOP]** `TheOffering.obn()` is not OBN_TOKEN or `TheOffering.extendOliveBranch()` is not EXTENDING_OB_ADDR. These are immutables — they cannot be corrected after deployment. The contract must be redeployed.

---

## Phase 3 — Deploy AnnualGovernance as UUPS proxy

AnnualGovernance is UUPS upgradeable. Deploy via proxy, not bare.

```bash
# Using hardhat-upgrades (or equivalent proxy factory):
# deployProxy(AnnualGovernance, [
#   OBN_TOKEN,
#   STAKING_PROXY,
#   OFFERING_ADDR,
#   EXTENDING_OB_ADDR,
#   TIMELOCK,         ← timelockOwner_ (becomes owner())
#   OPERATOR_SAFE,    ← voteAdmin_
#   100               ← maxBallotSize
# ], { kind: "uups" })
#
# Record: ANNUAL_GOV_PROXY, ANNUAL_GOV_IMPL
```

### Verify — proxy state

```bash
cast call $ANNUAL_GOV_PROXY "owner()(address)"
# Expected: TIMELOCK

cast call $ANNUAL_GOV_PROXY "stakingPools()(address)"
# Expected: STAKING_PROXY

cast call $ANNUAL_GOV_PROXY "theOffering()(address)"
# Expected: OFFERING_ADDR

cast call $ANNUAL_GOV_PROXY "extendOliveBranch()(address)"
# Expected: EXTENDING_OB_ADDR

cast call $ANNUAL_GOV_PROXY "voteAdmin()(address)"
# Expected: OPERATOR_SAFE

cast call $ANNUAL_GOV_PROXY "currentCycleId()(uint256)"
# Expected: 0

cast call $ANNUAL_GOV_PROXY "maxBallotSize()(uint256)"
# Expected: 100
```

**[HARD STOP]** `AnnualGovernance` proxy owner is not Timelock.

### Verify — UUPS/ERC1967

```bash
cast storage $ANNUAL_GOV_PROXY 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
# Expected: ANNUAL_GOV_IMPL (left-padded to 32 bytes)

cast call $ANNUAL_GOV_PROXY "proxiableUUID()(bytes32)"
# Expected: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
```

**[HARD STOP]** ERC1967 implementation slot does not contain ANNUAL_GOV_IMPL.

### Verify — bare implementation is locked

```bash
cast call $ANNUAL_GOV_IMPL "initialize(address,address,address,address,address,address,uint256)" \
  $OBN_TOKEN $STAKING_PROXY $OFFERING_ADDR $EXTENDING_OB_ADDR $TIMELOCK $OPERATOR_SAFE 100
# Expected: revert (Initializable: contract is already initialized)
```

**[HARD STOP]** The bare AnnualGovernance implementation can be initialized (i.e., `_disableInitializers()` is not working).

---

## Phase 4 — Deploy OBNStakingLens as UUPS proxy

OBNStakingLens is UUPS upgradeable. Deploy via proxy, not bare.

```bash
# Using hardhat-upgrades (or equivalent proxy factory):
# deployProxy(OBNStakingLens, [
#   STAKING_PROXY,    ← stakingPoolsProxy_
#   TIMELOCK          ← timelockOwner_
# ], { kind: "uups" })
#
# Record: LENS_PROXY, LENS_IMPL
```

### Verify — proxy state

```bash
cast call $LENS_PROXY "owner()(address)"
# Expected: TIMELOCK

cast call $LENS_PROXY "stakingPools()(address)"
# Expected: STAKING_PROXY
```

**[HARD STOP]** Lens proxy owner is not Timelock.

### Verify — UUPS/ERC1967

```bash
cast storage $LENS_PROXY 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
# Expected: LENS_IMPL (left-padded to 32 bytes)

cast call $LENS_PROXY "proxiableUUID()(bytes32)"
# Expected: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
```

**[HARD STOP]** ERC1967 implementation slot does not contain LENS_IMPL.

### Verify — bare implementation is locked

```bash
cast call $LENS_IMPL "initialize(address,address)" $STAKING_PROXY $TIMELOCK
# Expected: revert (Initializable: contract is already initialized)
```

**[HARD STOP]** The bare Lens implementation can be initialized.

### Smoke test Lens reads (pre-upgrade — should still work against v9.2 proxy)

```bash
cast call $LENS_PROXY "getGlobalStats()(uint256,uint256,uint256,uint256)"
# Expected: non-zero totalStaked

cast call $LENS_PROXY "getPoolStats(uint256)" 0
# Expected: valid pool data matching pre-upgrade snapshot
```

> **Lens sequencing note:** The Lens proxy is deployed here to record its address early.
> However, `getPoolAPR`, `pendingRewards`, `getUserPoolView`, and `pendingRewardsMultiple`
> all call `sumRewardAcrossPhases()` on the staking proxy, which does not exist on v9.2.
> These functions will revert until after Phase 6 completes. Only `getGlobalStats` and
> `getPoolStats` are safe to call before the staking upgrade.
>
> **Do not set `NEXT_PUBLIC_LENS_CONTRACT` or point the frontend at LENS_PROXY until
> Phase 9 (after Phase 6 is verified complete).**

---

## Phase 5 — Wire vault governance (Timelock executions)

Both vault calls must go through the Timelock. Queue and execute as separate transactions with the mandatory delay.

### 5.1 Queue both calls

```
theOffering.setGovernance(ANNUAL_GOV_PROXY)
extendOliveBranch.setGovernance(ANNUAL_GOV_PROXY)
```

**These calls must target `ANNUAL_GOV_PROXY`, not `ANNUAL_GOV_IMPL`.**

**[HARD STOP]** Vault governance is set to `ANNUAL_GOV_IMPL` instead of `ANNUAL_GOV_PROXY`. This would mean governance calls can never reach the proxy's state.

### 5.2 After Timelock delay: execute and verify

```bash
cast call $OFFERING_ADDR "governance()(address)"
# Expected: ANNUAL_GOV_PROXY

cast call $EXTENDING_OB_ADDR "governance()(address)"
# Expected: ANNUAL_GOV_PROXY
```

**[HARD STOP]** Either vault governance is not ANNUAL_GOV_PROXY after execution.

### 5.3 Confirm proxy ownership before proceeding

Before queueing vault wiring, independently confirm:

```bash
cast call $ANNUAL_GOV_PROXY "owner()(address)"
# Expected: TIMELOCK

cast call $ANNUAL_GOV_PROXY "voteAdmin()(address)"
# Expected: OPERATOR_SAFE
```

**[HARD STOP]** Do not call `startAnnualCycle` until:
- Both vaults return `governance() == ANNUAL_GOV_PROXY`
- All intended nonprofit addresses are approved in ExtendOliveBranch (`approvedNonprofit(addr) == true`)

Calling `startAnnualCycle` before vault wiring is complete is safe in terms of fund exposure (the vaults won't recognize governance), but it will produce a cycle that can never be executed. Starting a cycle before nonprofit approvals are complete will cause `startAnnualCycle` to revert mid-ballot. Both are operational errors that waste a Timelock-delayed cancelCycle transaction to recover from.

---

## Phase 6 — Atomic staking proxy upgrade (upgradeToAndCall)

This is the single most critical transaction. It bundles the upgrade and `migrateV93` in one atomic call. Splitting them is not safe (see section 7 of V93ForkMigration.test.js).

### 6.1 Encode migrateV93 calldata

```bash
cast calldata "migrateV93(address,address,address)" \
  $OFFERING_ADDR \
  $EXTENDING_OB_ADDR \
  $OPERATOR_SAFE
```

### 6.2 Queue upgradeToAndCall via Timelock

```
staking.upgradeToAndCall(V93_IMPL, <migrateV93 calldata>)
```

### 6.3 After delay: execute and verify upgrade

```bash
cast call $STAKING_PROXY "version()(string)"
# Expected: "9.3"

cast call $STAKING_PROXY "upgradeBlock()(uint256)"
# Expected: current block number (non-zero)

cast call $STAKING_PROXY "charityFundOperator()(address)"
# Expected: OPERATOR_SAFE

cast call $STAKING_PROXY "theOffering()(address)"
# Expected: OFFERING_ADDR

cast call $STAKING_PROXY "extendOliveBranch()(address)"
# Expected: EXTENDING_OB_ADDR
```

**[HARD STOP]** `version()` on the proxy is not "9.3" after upgradeToAndCall.

**[HARD STOP]** `upgradeBlock()` is 0 after the upgrade (migrateV93 did not run).

### 6.4 Verify ERC1967 slot points to v9.3 implementation

```bash
cast storage $STAKING_PROXY 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
# Expected: V93_IMPL (left-padded to 32 bytes)
```

**[HARD STOP]** Implementation slot does not contain V93_IMPL.

### 6.5 Verify pre-upgrade state preserved

```bash
cast call $STAKING_PROXY "globalTotalStaked()(uint256)"
# Expected: matches pre-upgrade snapshot (Phase 0.2) ± normal reward accumulation

cast call $STAKING_PROXY "poolLength()(uint256)"
# Expected: matches pre-upgrade snapshot
```

---

## Phase 7 — Bootstrap checkpoints (batchBootstrap)

This can be called by anyone. Run on the operator Safe or directly.

```bash
# Call staking.batchBootstrap([addr1, addr2, ...])
# with a representative sample of top stakers
```

### Verify (spot check)

```bash
cast call $STAKING_PROXY "checkpointCount(address)" <staker_addr>
# Expected: 1 (bootstrapped)

cast call $STAKING_PROXY "getPastVotingPower(address,uint256)" <staker_addr> <upgradeBlock>
# Expected: matches their staked amount at upgradeBlock
```

---

## Phase 8 — Smoke test end-to-end

### 8.1 Lens reads against upgraded proxy

```bash
cast call $LENS_PROXY "getGlobalStats()(uint256,uint256,uint256,uint256)"
# Expected: non-zero, consistent with globalTotalStaked on proxy

cast call $LENS_PROXY "pendingRewards(uint256,address)" 0 <staker_addr>
# Expected: non-zero for an active staker

cast call $LENS_PROXY "getPoolAPR(uint256)" 0
# Expected: non-zero (current yield schedule active)
```

### 8.2 Verify AnnualGovernance ballot eligibility

```bash
cast call $ANNUAL_GOV_PROXY "currentCycleId()(uint256)"
# Expected: 0 — no cycle started yet

# startAnnualCycle is NOT called here — this is pre-deployment verification only.
# Approval of nonprofits in ExtendOliveBranch should be queued separately before
# the first governance cycle.
```

---

## Phase 9 — Frontend cutover

1. Set `NEXT_PUBLIC_LENS_CONTRACT` = `LENS_PROXY` in the production environment.
   - **This must be the proxy address, not the Lens implementation address.**
2. Remove or leave blank `NEXT_PUBLIC_LENS_CONTRACT` in staging until verified.
3. Deploy frontend. Monitor for:
   - `pendingRewards` calls succeeding on the Lens proxy.
   - `userAmount` mapping reads on the staking proxy.
   - No `invalid address` errors in viem (would indicate env var is empty).

**[HARD STOP]** `NEXT_PUBLIC_LENS_CONTRACT` is set to `LENS_IMPL` instead of `LENS_PROXY`.

---

## Two-way audit checklist (complete after all phases)

Both auditors independently verify each row. Mark only when both agree.

| Check | Primary | Secondary |
|---|---|---|
| `staking.version()` == "9.3" | | |
| `staking.upgradeBlock()` is non-zero | | |
| `staking.theOffering()` == OFFERING_ADDR | | |
| `staking.extendOliveBranch()` == EXTENDING_OB_ADDR | | |
| `staking.charityFundOperator()` == OPERATOR_SAFE | | |
| `staking.globalTotalStaked()` matches pre-upgrade ± rewards | | |
| ERC1967 slot on staking proxy == V93_IMPL | | |
| `theOffering.governance()` == ANNUAL_GOV_PROXY | | |
| `extendOliveBranch.governance()` == ANNUAL_GOV_PROXY | | |
| `annualGov.owner()` == TIMELOCK | | |
| `annualGov.voteAdmin()` == OPERATOR_SAFE | | |
| `annualGov.currentCycleId()` == 0 | | |
| ERC1967 slot on annualGov proxy == ANNUAL_GOV_IMPL | | |
| `lens.owner()` == TIMELOCK | | |
| `lens.stakingPools()` == STAKING_PROXY | | |
| ERC1967 slot on Lens proxy == LENS_IMPL | | |
| Lens.getGlobalStats() returns non-zero totalStaked | | |
| Lens.pendingRewards(0, staker) returns non-zero | | |
| AnnualGov bare impl reverts on initialize() | | |
| Lens bare impl reverts on initialize() | | |
| NEXT_PUBLIC_LENS_CONTRACT == LENS_PROXY | | |

---

## Hard stop summary

| # | Condition |
|---|---|
| 1 | OZ upgrades validator does not pass on both UUPS contracts |
| 2 | `V93_IMPL.version()` is not "9.3" |
| 3 | `V93_IMPL.owner()` returns a privileged address |
| 4 | `AnnualGovernance` proxy owner is not Timelock |
| 5 | AnnualGovernance ERC1967 slot does not contain ANNUAL_GOV_IMPL |
| 6 | Bare AnnualGovernance implementation can be initialized |
| 6b | `TheOffering.obn()` or `TheOffering.extendOliveBranch()` is wrong (immutables — redeploy required) |
| 7 | Lens proxy owner is not Timelock |
| 8 | Lens ERC1967 slot does not contain LENS_IMPL |
| 9 | Bare Lens implementation can be initialized |
| 10 | Vault governance is set to an implementation address instead of the proxy |
| 11 | `staking.version()` is not "9.3" after upgradeToAndCall |
| 12 | `staking.upgradeBlock()` is 0 after upgradeToAndCall |
| 13 | ERC1967 slot on staking proxy does not contain V93_IMPL |
| 14 | `NEXT_PUBLIC_LENS_CONTRACT` is set to LENS_IMPL instead of LENS_PROXY |
| 15 | `startAnnualCycle` is called before both vaults return `governance() == ANNUAL_GOV_PROXY` |
| 16 | `startAnnualCycle` is called before all intended nonprofit addresses are approved in ExtendOliveBranch |
| 17 | Either auditor cannot independently reproduce a required on-chain value |
