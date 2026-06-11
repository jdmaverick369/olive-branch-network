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
# Confirmed mainnet — do not modify
OBN_TOKEN            = 0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685
STAKING_PROXY        = 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2
TIMELOCK             = 0x86396526286769ace21982E798Df5eef2389f51c
OPERATOR_SAFE        = 0x066e2FABb036deab7DC58bAde428F819AC3542DD
OLD_CHARITY_FUND     = 0x398fE423a8b4FD9B40CADF8bc72448C95474455F
OLD_TREASURY         = 0x5C8a0aCfAD4528714076068f71a5ff2Ee06c3718

# Deployed during this upgrade — fill in as each contract is deployed:
V93_IMPL             = 0x...
EXTENDING_OB_ADDR    = 0x...
OFFERING_ADDR        = 0x...
ANNUAL_GOV_PROXY     = 0x...
ANNUAL_GOV_IMPL      = 0x...
LENS_PROXY           = 0x...
LENS_IMPL            = 0x...
```

The six permanent addresses above are confirmed against mainnet. Both auditors must independently verify each new deployment address before Phase 3 begins.

---

## Phase 0 — Pre-flight

### 0.1 Environment

- Hardhat fork points to correct mainnet block.
- All test artifacts compiled cleanly (`npx hardhat compile`).
- OZ upgrades validator passes: `npx hardhat run scripts/validate_upgrades.js`
  - Expected output: `OBNStakingLens: PASS` and `AnnualGovernance: PASS`
- Fork tests pass: `npx hardhat test` → 98 passing / 56 pending / 0 failing (unit + integration suite).
- Fork suite passes: `FORK_MAINNET=true npx hardhat test test/V93ForkMigration.test.js` → 61 passing / 0 failing.

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

### Verify on-chain

```bash
cast call $V93_IMPL "version()(string)"
# Expected: "9.3"
```

**[HARD STOP]** `version()` on the bare implementation is not "9.3".

```bash
cast call $V93_IMPL "owner()(address)"
```

**[HARD STOP]** `impl.owner()` returns Timelock, Safe, deployer, or any other privileged address. If nonzero-privileged, stop and investigate. The bare implementation must not be ownable-initialized.

### Basescan verification

```bash
V93_IMPL=$V93_IMPL npx hardhat verify --network base "$V93_IMPL" \
  --contract "contracts/StakingPoolsV93.sol:OBNStakingPools"
```

Wait 2–5 minutes after deployment before running. If it fails with "already verified", the contract was auto-verified during deployment — no action needed. Check: `https://basescan.org/address/$V93_IMPL#code`

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

### Basescan verification — ExtendOliveBranch

```bash
npx hardhat verify --network base "$EXTENDING_OB_ADDR" "$OBN_TOKEN" "$TIMELOCK"
```

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

### Basescan verification — TheOffering

```bash
npx hardhat verify --network base "$OFFERING_ADDR" "$OBN_TOKEN" "$EXTENDING_OB_ADDR" "$TIMELOCK"
```

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

### Basescan verification — AnnualGovernance

```bash
# 1. Verify the implementation (no constructor args — _disableInitializers() is the only constructor logic)
npx hardhat verify --network base "$ANNUAL_GOV_IMPL" \
  --contract "contracts/AnnualGovernance.sol:AnnualGovernance"

# 2. Register the proxy so Basescan shows the implementation ABI at the proxy address
curl -s "https://api.basescan.org/api?module=contract&action=verifyproxycontract\
&address=$ANNUAL_GOV_PROXY&apikey=$BASESCAN_API_KEY"
# Expected response: { "status": "1", ... }
# If Basescan has not yet indexed the proxy, retry in 2–3 minutes.
```

After proxy registration, `https://basescan.org/address/$ANNUAL_GOV_PROXY#readProxyContract` should show the AnnualGovernance ABI.

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

### Basescan verification — OBNStakingLens

```bash
# 1. Verify the implementation
npx hardhat verify --network base "$LENS_IMPL" \
  --contract "contracts/OBNStakingLens.sol:OBNStakingLens"

# 2. Register the proxy
curl -s "https://api.basescan.org/api?module=contract&action=verifyproxycontract\
&address=$LENS_PROXY&apikey=$BASESCAN_API_KEY"
```

After proxy registration, `https://basescan.org/address/$LENS_PROXY#readProxyContract` should show the OBNStakingLens ABI.

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

### 5.0 Confirm proxy ownership before queueing

Do this before preparing the Timelock proposal. These values must be correct or the vault wiring targets the wrong contract.

```bash
cast call $ANNUAL_GOV_PROXY "owner()(address)"
# Expected: TIMELOCK

cast call $ANNUAL_GOV_PROXY "voteAdmin()(address)"
# Expected: OPERATOR_SAFE

cast call $ANNUAL_GOV_PROXY "stakingPools()(address)"
# Expected: STAKING_PROXY (not the staking implementation)
```

**[HARD STOP]** Any of the above does not match. Do not queue vault wiring until the proxy state is confirmed.

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

cast call $STAKING_PROXY "treasury()(address)"
# Expected: OFFERING_ADDR (not OLD_TREASURY)

cast call $STAKING_PROXY "charityFund()(address)"
# Expected: EXTENDING_OB_ADDR (not OLD_CHARITY_FUND)

cast call $STAKING_PROXY "charityFundOperator()(address)"
# Expected: OPERATOR_SAFE
```

**[HARD STOP]** `version()` on the proxy is not "9.3" after upgradeToAndCall.

**[HARD STOP]** `staking.treasury()` equals OLD_TREASURY or `staking.charityFund()` equals OLD_CHARITY_FUND — migration did not redirect fund flows to the new vaults.

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
# Expected: matches Phase 0.2 snapshot exactly, unless a user deposited or withdrew
# between the snapshot and this verification. Reward accrual alone must NOT change
# globalTotalStaked — any deviation that cannot be explained by a deposit or withdrawal
# is a migration error and a hard stop.

cast call $STAKING_PROXY "poolLength()(uint256)"
# Expected: matches pre-upgrade snapshot exactly
```

### 6.6 Basescan verification — staking proxy re-registration

The staking proxy was already verified before this upgrade. After `upgradeToAndCall`, Basescan's proxy reader needs to be updated so it shows the v9.3 ABI at the proxy address (the implementation changed from v9.2 to v9.3).

V93_IMPL was verified in Phase 1. Only the proxy registration needs to be refreshed:

```bash
curl -s "https://api.basescan.org/api?module=contract&action=verifyproxycontract\
&address=$STAKING_PROXY&apikey=$BASESCAN_API_KEY"
```

After indexing (2–5 minutes), `https://basescan.org/address/$STAKING_PROXY#readProxyContract` should show the v9.3 ABI including `upgradeBlock`, `totalStakedByUser`, and `userAmount`.

---

## Phase 7 — Bootstrap checkpoints (batchBootstrap) — Optional

This phase is **not required for the upgrade to be safe or complete.** The upgrade is fully functional without it.

`batchBootstrap` is a gas-saving preparation step. Any staker who has not been pre-bootstrapped will be automatically bootstrapped (lazy-initialized) the first time they cast a vote, deposit, withdraw, or interact with the staking contract. No staker loses access to their funds or voting rights by skipping this phase.

**Recommended before the first governance cycle** to reduce gas costs for large stakers during Phase 1/2 voting, since bootstrapping on-demand during a vote costs slightly more than pre-bootstrapping.

```bash
# Call staking.batchBootstrap([addr1, addr2, ...])
# Permissionless — can be called by anyone, from any wallet.
# Use the active_stakers.js script to generate the address list:
#   npx hardhat run scripts/active_stakers.js --network base
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

**[HARD STOP]** Production deployment must not proceed if `NEXT_PUBLIC_LENS_CONTRACT` is unset, empty, or does not equal `LENS_PROXY`. An unset or invalid value causes silent read failures — users see zero balances and zero rewards with no error message.

---

## Phase 10 — Reserve transfer

**Prerequisites — all must be confirmed before executing this phase:**
- Phase 6 complete: `staking.version()` == "9.3" and `staking.upgradeBlock()` != 0
- Phase 9 complete: frontend live and reading correctly from `LENS_PROXY`
- Both auditors have signed off on the two-way checklist

**Never bundle this transfer with the upgrade transaction.** It must be a separate, standalone operation executed only after the full system is verified functional.

The 88,000,000 OBN reserve currently held at `OLD_CHARITY_FUND` needs to move to `OPERATOR_SAFE` (the new `charityFundOperator`), where it will be used for future `depositForWithLock` bootstrapping.

### 10.1 Confirm controller of OLD_CHARITY_FUND

Do not assume Timelock controls `OLD_CHARITY_FUND`. Confirm the actual controller before preparing the transfer.

```bash
# Check if OLD_CHARITY_FUND is a contract or EOA:
cast code $OLD_CHARITY_FUND
# If bytecode is returned it is a contract — identify it (Safe, Timelock, or other).
# If empty it is an EOA — the private key holder must sign the transfer directly.

# If it is a Safe, confirm the signers match expected operators before proceeding.
```

**[HARD STOP]** The controller of `OLD_CHARITY_FUND` cannot be identified or does not match expected operators. Do not proceed until confirmed.

### 10.2 Verify source balance before transfer

```bash
cast call $OBN_TOKEN "balanceOf(address)(uint256)" $OLD_CHARITY_FUND
# Expected: 88,000,000 OBN (88000000000000000000000000 in wei)
# Record the exact value before transferring.
```

**[HARD STOP]** Balance at `OLD_CHARITY_FUND` does not match expected reserve amount. Investigate before proceeding.

### 10.3 Execute transfer

The transfer must be signed by the controller confirmed in step 10.1.

```
OBNToken.transfer(OPERATOR_SAFE, 88000000000000000000000000)
# Sent from OLD_CHARITY_FUND (via Timelock, Safe, or EOA as identified above)
```

### 10.4 Verify after transfer

```bash
cast call $OBN_TOKEN "balanceOf(address)(uint256)" $OPERATOR_SAFE
# Expected: increased by exactly 88,000,000 OBN vs pre-transfer balance

cast call $OBN_TOKEN "balanceOf(address)(uint256)" $OLD_CHARITY_FUND
# Expected: 0 (or pre-transfer balance minus 88,000,000 OBN)
```

**[HARD STOP]** `OPERATOR_SAFE` balance did not increase by the expected amount.

---

## Two-way audit checklist (complete after all phases)

Both auditors independently verify each row. Mark only when both agree.

| Check | Primary | Secondary |
|---|---|---|
| `staking.version()` == "9.3" | | |
| `staking.upgradeBlock()` is non-zero | | |
| `staking.treasury()` == OFFERING_ADDR | | |
| `staking.charityFund()` == EXTENDING_OB_ADDR | | |
| `staking.charityFundOperator()` == OPERATOR_SAFE | | |
| `staking.globalTotalStaked()` matches pre-upgrade exactly (reward accrual alone must not change it) | | |
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
| `OLD_CHARITY_FUND` balance transferred to OPERATOR_SAFE | | |
| `OLD_CHARITY_FUND` balance is 0 after transfer | | |

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

---

## Basescan verification — all-in-one

After completing all phases, run the verification script once with all addresses filled in. It will verify every implementation and register every proxy:

```bash
V93_IMPL=$V93_IMPL \
EXTENDING_OB_ADDR=$EXTENDING_OB_ADDR \
OFFERING_ADDR=$OFFERING_ADDR \
ANNUAL_GOV_IMPL=$ANNUAL_GOV_IMPL \
ANNUAL_GOV_PROXY=$ANNUAL_GOV_PROXY \
LENS_IMPL=$LENS_IMPL \
LENS_PROXY=$LENS_PROXY \
STAKING_PROXY=$STAKING_PROXY \
OBN_TOKEN=$OBN_TOKEN \
TIMELOCK=$TIMELOCK \
npx hardhat run scripts/governance/verify_v93.js --network base
```

Or add the addresses to `.env` and run:

```bash
npx hardhat run scripts/governance/verify_v93.js --network base
```

**Expected outcome:** 5 implementation verifications pass, 3 proxy registrations submitted. `#readProxyContract` tab shows the correct ABI at each proxy address on Basescan.
