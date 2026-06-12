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

# Recorded after Phase 6.0 fork rehearsal — both auditors must independently verify:
V93_IMPL_CODEHASH     = <keccak256 of V93_IMPL bytecode>
MIGRATE_CALLDATA_HASH = <keccak256 of MIGRATE_CALLDATA>
OUTER_CALLDATA_HASH   = <keccak256 of OUTER_CALLDATA>
```

The six permanent addresses above are confirmed against mainnet. Both auditors must independently verify each new deployment address before Phase 3 begins.

---

## Phase 0 — Pre-flight

### 0.1 Environment

- Hardhat fork points to correct mainnet block.
- All test artifacts compiled cleanly (`npx hardhat compile`).
- OZ upgrades validator passes: `npx hardhat run scripts/validate_upgrades.js`
  - Expected output: `OBNStakingLens: PASS` and `AnnualGovernance: PASS`
- Fork tests pass: `npx hardhat test` → 106 passing / 56 pending / 0 failing (unit + integration suite).
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

### 5.3 No-touch rule — AnnualGovernance between Phase 5 and Phase 6

Between vault wiring (Phase 5.2) and the staking upgrade (Phase 6), the system is partially assembled: vaults are wired but staking still runs v9.2. During this window:

- **Do not call `startAnnualCycle`.**
- **Do not submit any other AnnualGovernance transaction.**
- **Read-only verification calls only.**

The only purpose of Phase 5 completing before Phase 6 is to have governance wired so that verification in Phase 6.3 can confirm it. No governance action is appropriate until the full upgrade is verified complete.

---

## Phase 6 — Atomic staking proxy upgrade (upgradeToAndCall)

This is the single most critical transaction. It bundles the upgrade and `migrateV93` in one atomic call. Splitting them is not safe (see section 7 of V93ForkMigration.test.js).

**The danger is not a revert** — a revert leaves the proxy on v9.2 with no state change. **The danger is silent success with wrong calldata**: specifically the two vault addresses transposed in `migrateV93`, or empty inner calldata that upgrades the implementation but skips migration entirely. The four-window approach below is designed to prevent both.

### 6.0 Fork rehearsal — Window 0

Before encoding anything for the Timelock, run the exact final bytes against a live mainnet fork. This is the highest-confidence check: it proves the bytes do what you think before they are queued.

```bash
FORK_MAINNET=true \
V93_IMPL=$V93_IMPL \
OFFERING_ADDR=$OFFERING_ADDR \
EXTENDING_OB_ADDR=$EXTENDING_OB_ADDR \
OPERATOR_SAFE=$OPERATOR_SAFE \
npx hardhat run scripts/governance/rehearse_upgrade.js
```

The script:
1. Verifies on-chain identity of each address (anti-swap check: `OFFERING_ADDR.extendOliveBranch()` must return `EXTENDING_OB_ADDR`)
2. Encodes `MIGRATE_CALLDATA` and `OUTER_CALLDATA`
3. Immediately decodes both and prints every argument for auditor verification
4. Prints `keccak256` hash of each — **record these in the Address Registry below before proceeding**
5. Impersonates the Timelock on the fork and executes the exact `OUTER_CALLDATA`
6. Verifies all 8 post-upgrade invariants

**[HARD STOP]** The rehearsal script exits non-zero or any of the 8 post-upgrade checks fails. Do not queue until the script completes with `REHEARSAL PASSED`.

Both auditors must run the script independently and compare their printed `keccak256` hashes before either queues anything.

> **Record in Address Registry after rehearsal passes:**
> ```
> MIGRATE_CALLDATA_HASH = <keccak256 from script output>
> OUTER_CALLDATA_HASH   = <keccak256 from script output>
> ```

### 6.1 Encode calldata and double-decode (Window 2)

After the fork rehearsal, encode the final calldata for the Timelock queue and independently verify it by decoding back to addresses:

```bash
# Encode inner calldata
MIGRATE_CALLDATA=$(cast calldata "migrateV93(address,address,address)" \
  $OFFERING_ADDR \
  $EXTENDING_OB_ADDR \
  $OPERATOR_SAFE)

# Decode inner — verify every argument
cast calldata-decode "migrateV93(address,address,address)" $MIGRATE_CALLDATA
# Expected:
#   arg[0] = OFFERING_ADDR     ← newTreasury (TheOffering)
#   arg[1] = EXTENDING_OB_ADDR ← newCharityFund (ExtendOliveBranch)
#   arg[2] = OPERATOR_SAFE

# Encode outer calldata
OUTER_CALLDATA=$(cast calldata "upgradeToAndCall(address,bytes)" \
  $V93_IMPL \
  $MIGRATE_CALLDATA)

# Decode outer — verify impl address and that inner bytes are present
cast calldata-decode "upgradeToAndCall(address,bytes)" $OUTER_CALLDATA
# Expected:
#   arg[0] = V93_IMPL
#   arg[1] = $MIGRATE_CALLDATA  (decode this again to re-verify the three addresses)
```

Both auditors independently run these decode commands and compare output to the address registry. Hash the resulting calldata and compare to the hashes recorded after Phase 6.0:

```bash
cast keccak $MIGRATE_CALLDATA
# Must match MIGRATE_CALLDATA_HASH from Address Registry

cast keccak $OUTER_CALLDATA
# Must match OUTER_CALLDATA_HASH from Address Registry
```

**[HARD STOP]** Any decoded address does not match the address registry.

**[HARD STOP]** Computed keccak256 does not match the hash recorded after the fork rehearsal. The bytes are not identical — investigate before queueing.

### 6.2 Queue upgradeToAndCall via Timelock

```
target: STAKING_PROXY
value:  0
data:   OUTER_CALLDATA
```

After queueing, read the `CallScheduled` event emitted by the Timelock (Window 3). Both auditors independently fetch the on-chain event data and decode it — do not rely on what the Safe UI shows:

```bash
# Fetch the CallScheduled event and decode the payload field
cast calldata-decode "upgradeToAndCall(address,bytes)" <payload from event>
# arg[0] must be V93_IMPL
# arg[1] decode again as migrateV93 — must show OFFERING_ADDR, EXTENDING_OB_ADDR, OPERATOR_SAFE

# Hash the payload and compare to OUTER_CALLDATA_HASH
cast keccak <payload from event>
# Must match OUTER_CALLDATA_HASH
```

**[HARD STOP]** The on-chain event payload decodes to anything other than expected. Do not execute — cancel the Timelock operation.

### 6.3 After delay: execute and verify upgrade

Before pressing execute, confirm the pre-conditions one final time:

```bash
cast call $STAKING_PROXY "version()(string)"
# Expected: "9.2" — confirms proxy is still on v9.2 and is the right proxy

cast call $STAKING_PROXY "owner()(address)"
# Expected: TIMELOCK

cast call $OFFERING_ADDR "governance()(address)"
# Expected: ANNUAL_GOV_PROXY — vault wiring from Phase 5 is in place

cast call $EXTENDING_OB_ADDR "governance()(address)"
# Expected: ANNUAL_GOV_PROXY
```

Execute. Then immediately verify:

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

#### Emergency response if any Phase 6.3 hard stop triggers

`setGovernance(address(0))` goes through the Timelock and has a mandatory delay — it cannot be used as an instant pause. If a hard stop fires after execution, the correct response is:

1. Stop all further phases immediately. Do not run Phase 7, 8, 9, or 10.
2. Do not deploy the frontend pointing to new contract addresses.
3. Do not transfer reserves (Phase 10).
4. Do not call `startAnnualCycle`.
5. Do not run `batchBootstrap` unless the failure is confirmed unrelated to migration state.
6. Diagnose the exact mismatch against the fork rehearsal output from Phase 6.0.
7. If vault governance is already wired (Phase 5 complete) and there is active risk, queue `setGovernance(address(0))` for both vaults via Timelock as a precautionary measure — but accept that it will take at least 24 hours to execute.
8. Prepare a corrective Timelock action only after the root cause is fully understood.

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
2. Set `NEXT_PUBLIC_GOVERNANCE_CONTRACT` = `ANNUAL_GOV_PROXY` in the production environment.
   - **This must be the proxy address, not the implementation address.**
3. Remove or leave blank both env vars in staging until verified.
4. Deploy frontend. Monitor for:
   - `pendingRewards` calls succeeding on the Lens proxy.
   - `userAmount` mapping reads on the staking proxy.
   - No `invalid address` errors in viem (would indicate env var is empty).

**[HARD STOP]** `NEXT_PUBLIC_LENS_CONTRACT` is set to `LENS_IMPL` instead of `LENS_PROXY`.

**[HARD STOP]** Production deployment must not proceed if `NEXT_PUBLIC_LENS_CONTRACT` is unset, empty, or does not equal `LENS_PROXY`. An unset or invalid value causes silent read failures — users see zero balances and zero rewards with no error message.

**[HARD STOP]** `NEXT_PUBLIC_GOVERNANCE_CONTRACT` is set to `ANNUAL_GOV_IMPL` instead of `ANNUAL_GOV_PROXY`. Governance reads will fail silently or revert.

### 9.1 Verify archive RPC supports historical block reads (required for governance page)

The governance page displays voting power for unbootstrapped pre-upgrade stakers by reading `userAmount(pid, user)` at `blockNumber = snapshotBlock` via Multicall3. This requires an archive-capable RPC endpoint. Alchemy Base (the configured provider) supports this, but confirm before deploying the governance page.

```bash
# Replace UPGRADE_BLOCK with the actual upgradeBlock value from Phase 6.
cast call --block $UPGRADE_BLOCK $STAKING_PROXY \
  "userAmount(uint256,address)(uint256)" 0 <any_known_staker_address>
# Expected: non-zero value matching their pre-upgrade stake in pool 0.
# If this returns 0 and the staker is known to have stake, the RPC endpoint
# does not serve historical state — switch to an archive provider.
```

**[HARD STOP]** The above call reverts or returns an unexpected value. Your RPC endpoint does not support archive reads. The governance page will show "temporarily unavailable" for unbootstrapped stakers instead of their correct voting power. Switch to an archive-capable provider before deploying the governance page.

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
| 14b | `NEXT_PUBLIC_GOVERNANCE_CONTRACT` is set to ANNUAL_GOV_IMPL instead of ANNUAL_GOV_PROXY |
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

---

## Two-Auditor Verification Protocol

**Rule:** Claude gathers and formats raw on-chain data. ChatGPT verifies raw values. Jack proceeds only after explicit PASS. No phase proceeds from summaries or confidence.

**ChatGPT response format for each package:**

```
PACKAGE X VERIFICATION RESULT: PASS / FAIL

1. <check> — PASS/FAIL — <reason if fail>
2. <check> — PASS/FAIL — <reason if fail>
...

Decision:
PASS TO NEXT PHASE
or
HARD STOP — DO NOT PROCEED
Required correction: <exact issue>
```

**Operating rules:**
- Submit one package at a time. Do not proceed until explicit PASS is returned.
- If any field is missing, truncated, summarized, or replaced with "same as before" → FAIL (insufficient raw data).
- For Package 3: the full raw hex payload is required. Decoded values alone are not sufficient.
- Hash mismatch in Package 3 is an unconditional NO-GO regardless of decoded values.

---

### Package 1 — Deployments (Phases 1–4)

Paste to ChatGPT after all contracts are deployed and before Phase 5 vault wiring begins.

```
REQUESTED DECISION: PASS TO NEXT PHASE / FAIL AND HARD STOP

OBN v9.3 Deployment Verification — Package 1
CURRENT COMMIT = <git rev-parse HEAD>

KNOWN GOOD ADDRESSES (hardcoded — do not accept substitutes):
  OBN_TOKEN        = 0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685
  STAKING_PROXY    = 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2
  TIMELOCK         = 0x86396526286769ace21982E798Df5eef2389f51c
  OPERATOR_SAFE    = 0x066e2FABb036deab7DC58bAde428F819AC3542DD
  OLD_TREASURY     = 0x5C8a0aCfAD4528714076068f71a5ff2Ee06c3718
  OLD_CHARITY_FUND = 0x398fE423a8b4FD9B40CADF8bc72448C95474455F

NEWLY DEPLOYED:
  V93_IMPL          = <address>
  EXTENDING_OB_ADDR = <address>
  OFFERING_ADDR     = <address>
  ANNUAL_GOV_PROXY  = <address>
  ANNUAL_GOV_IMPL   = <address>
  LENS_PROXY        = <address>
  LENS_IMPL         = <address>

ON-CHAIN READS:
  V93_IMPL.version()                           = <value>
  V93_IMPL.owner()                             = <value>

  EXTENDING_OB_ADDR.obn()                      = <value>
  EXTENDING_OB_ADDR.timelockOwner()            = <value>
  EXTENDING_OB_ADDR.governance()               = <value>

  OFFERING_ADDR.obn()                          = <value>
  OFFERING_ADDR.extendOliveBranch()            = <value>
  OFFERING_ADDR.timelockOwner()                = <value>
  OFFERING_ADDR.governance()                   = <value>

  ANNUAL_GOV_PROXY.owner()                     = <value>
  ANNUAL_GOV_PROXY.stakingPools()              = <value>
  ANNUAL_GOV_PROXY.theOffering()               = <value>
  ANNUAL_GOV_PROXY.extendOliveBranch()         = <value>
  ANNUAL_GOV_PROXY.voteAdmin()                 = <value>
  ANNUAL_GOV_PROXY.currentCycleId()            = <value>
  ANNUAL_GOV_PROXY.maxBallotSize()             = <value>
  ANNUAL_GOV_PROXY ERC1967 slot                = <value>
  ANNUAL_GOV_IMPL.initialize() result          = <reverted / did not revert>

  LENS_PROXY.owner()                           = <value>
  LENS_PROXY.stakingPools()                    = <value>
  LENS_PROXY ERC1967 slot                      = <value>
  LENS_PROXY.getGlobalStats()                  = <value or reverted>
  LENS_IMPL.initialize() result                = <reverted / did not revert>

  STAKING_PROXY.version()                      = <value>
  STAKING_PROXY.owner()                        = <value>

EXPECTED VALUES:
  V93_IMPL.version()                   = "9.3"
  V93_IMPL.owner()                     = address(0) or non-privileged
  EXTENDING_OB_ADDR.obn()              = OBN_TOKEN
  EXTENDING_OB_ADDR.timelockOwner()    = TIMELOCK
  EXTENDING_OB_ADDR.governance()       = address(0)
  OFFERING_ADDR.obn()                  = OBN_TOKEN
  OFFERING_ADDR.extendOliveBranch()    = EXTENDING_OB_ADDR
  OFFERING_ADDR.timelockOwner()        = TIMELOCK
  OFFERING_ADDR.governance()           = address(0)
  ANNUAL_GOV_PROXY.owner()             = TIMELOCK
  ANNUAL_GOV_PROXY.stakingPools()      = STAKING_PROXY
  ANNUAL_GOV_PROXY.theOffering()       = OFFERING_ADDR
  ANNUAL_GOV_PROXY.extendOliveBranch() = EXTENDING_OB_ADDR
  ANNUAL_GOV_PROXY.voteAdmin()         = OPERATOR_SAFE
  ANNUAL_GOV_PROXY.currentCycleId()    = 0
  ANNUAL_GOV_PROXY.maxBallotSize()     = 100
  ANNUAL_GOV_PROXY ERC1967 slot        = ANNUAL_GOV_IMPL
  ANNUAL_GOV_IMPL.initialize()         = reverted
  LENS_PROXY.owner()                   = TIMELOCK
  LENS_PROXY.stakingPools()            = STAKING_PROXY
  LENS_PROXY ERC1967 slot              = LENS_IMPL
  LENS_PROXY.getGlobalStats()          = non-zero totalStaked (safe pre-upgrade call)
  LENS_IMPL.initialize()               = reverted
  STAKING_PROXY.version()              = "9.2"
  STAKING_PROXY.owner()                = TIMELOCK
```

---

### Package 2 — Vault wiring + fork rehearsal (Phase 5 + 6.0)

Paste to ChatGPT after vault governance is wired and fork rehearsal passes. Must precede Timelock queue.

```
REQUESTED DECISION: PASS TO NEXT PHASE / FAIL AND HARD STOP

OBN v9.3 Deployment Verification — Package 2
CURRENT COMMIT = <git rev-parse HEAD>

ADDRESSES CARRIED FROM PACKAGE 1 (do not re-derive):
  OFFERING_ADDR     = <value from Package 1>
  EXTENDING_OB_ADDR = <value from Package 1>
  ANNUAL_GOV_PROXY  = <value from Package 1>
  V93_IMPL          = <value from Package 1>
  OPERATOR_SAFE     = 0x066e2FABb036deab7DC58bAde428F819AC3542DD
  STAKING_PROXY     = 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2

VAULT GOVERNANCE WIRING (post Phase 5 execution):
  OFFERING_ADDR.governance()     = <value>
  EXTENDING_OB_ADDR.governance() = <value>

PRE-UPGRADE SNAPSHOT (gathered now — used to verify Package 4):
  STAKING_PROXY.version()           = <value>
  STAKING_PROXY.owner()             = <value>
  STAKING_PROXY.globalTotalStaked() = <value>
  STAKING_PROXY.poolLength()        = <value>

FORK REHEARSAL — full output of rehearse_upgrade.js:
<paste complete script output here>

CALLDATA (for Timelock queue):
  OUTER_CALLDATA_TARGET = STAKING_PROXY
  OUTER_CALLDATA_VALUE  = 0
  MIGRATE_CALLDATA      = <full hex>
  OUTER_CALLDATA        = <full hex>

HASHES TO LOCK IN:
  V93_IMPL_CODEHASH     = <value>
  MIGRATE_CALLDATA_HASH = <value>
  OUTER_CALLDATA_HASH   = <value>

EXPECTED VALUES:
  OFFERING_ADDR.governance()     = ANNUAL_GOV_PROXY
  EXTENDING_OB_ADDR.governance() = ANNUAL_GOV_PROXY
  STAKING_PROXY.version()        = "9.2"
  STAKING_PROXY.owner()          = TIMELOCK
  Rehearsal result               = REHEARSAL PASSED (all 10 checks)
  MIGRATE_CALLDATA arg[0]        = OFFERING_ADDR
  MIGRATE_CALLDATA arg[1]        = EXTENDING_OB_ADDR
  MIGRATE_CALLDATA arg[2]        = OPERATOR_SAFE
  OUTER_CALLDATA arg[0]          = V93_IMPL
  OUTER_CALLDATA arg[1]          = MIGRATE_CALLDATA (inner bytes match)
```

---

### Package 3 — Timelock queued event (Window 3, before 24h expires)

Paste to ChatGPT after the Timelock `schedule` transaction is confirmed. Must precede execution.

```
REQUESTED DECISION: PASS TO NEXT PHASE / FAIL AND HARD STOP

OBN v9.3 Deployment Verification — Package 3
CURRENT COMMIT = <git rev-parse HEAD>

LOCKED HASHES FROM PACKAGE 2 (do not accept new values):
  MIGRATE_CALLDATA_HASH = <value from Package 2>
  OUTER_CALLDATA_HASH   = <value from Package 2>

TIMELOCK CallScheduled EVENT:
  Transaction hash      = <tx hash>
  Operation ID/hash     = <value>
  Executable timestamp  = <unix timestamp — must be >= now + 24h>
  target                = <value>
  value                 = <value>
  data (raw hex)        = <full payload hex>
  predecessor           = <value>
  salt                  = <value>
  delay                 = <value in seconds>

DECODED PAYLOAD:
  outer function        = <upgradeToAndCall or other>
  outer arg[0]          = <value>
  outer arg[1] decoded  = <inner function name>
  inner arg[0]          = <value>
  inner arg[1]          = <value>
  inner arg[2]          = <value>

ON-CHAIN PAYLOAD HASH:
  keccak256(data)       = <value>

EXPECTED VALUES:
  target                = STAKING_PROXY
  value                 = 0
  outer function        = upgradeToAndCall
  outer arg[0]          = V93_IMPL
  inner function        = migrateV93
  inner arg[0]          = OFFERING_ADDR
  inner arg[1]          = EXTENDING_OB_ADDR
  inner arg[2]          = OPERATOR_SAFE
  keccak256(data)       = OUTER_CALLDATA_HASH from Package 2

HARD RULE: If keccak256(data) != OUTER_CALLDATA_HASH, NO-GO regardless of
decoded values. A hash mismatch means the queued bytes differ from what was rehearsed.
```

---

### Package 4 — Post-execution verification (Phase 6.3)

Paste to ChatGPT immediately after the upgrade execution transaction is confirmed.

```
REQUESTED DECISION: PASS / FAIL

OBN v9.3 Deployment Verification — Package 4
CURRENT COMMIT = <git rev-parse HEAD>

PRE-UPGRADE SNAPSHOT FROM PACKAGE 2 (reference values):
  globalTotalStaked (pre) = <value from Package 2>
  poolLength (pre)        = <value from Package 2>

FINAL PRE-EXECUTION READ (gathered immediately before pressing execute):
  STAKING_PROXY.version() = <value>

UPGRADE TRANSACTION:
  tx hash      = <value>
  block number = <value>

POST-UPGRADE ON-CHAIN READS:
  STAKING_PROXY.version()             = <value>
  STAKING_PROXY.upgradeBlock()        = <value>
  STAKING_PROXY.treasury()            = <value>
  STAKING_PROXY.charityFund()         = <value>
  STAKING_PROXY.charityFundOperator() = <value>
  STAKING_PROXY ERC1967 slot          = <value>
  STAKING_PROXY.globalTotalStaked()   = <value>
  STAKING_PROXY.poolLength()          = <value>

NEGATIVE CHECKS:
  STAKING_PROXY.treasury()    != OLD_TREASURY (0x5C8a0aC...)    = <true/false>
  STAKING_PROXY.charityFund() != OLD_CHARITY_FUND (0x398fE4...) = <true/false>

EXPECTED VALUES:
  Final pre-execution version  = "9.2"
  version() post               = "9.3"
  upgradeBlock()               = <tx block number above>
  treasury()                   = OFFERING_ADDR
  charityFund()                = EXTENDING_OB_ADDR
  charityFundOperator()        = OPERATOR_SAFE
  ERC1967 slot                 = V93_IMPL
  globalTotalStaked            = matches Package 2 snapshot exactly
  poolLength                   = matches Package 2 snapshot exactly
  treasury != OLD_TREASURY     = true
  charityFund != OLD_CHARITY_FUND = true
```

**Expected outcome:** 5 implementation verifications pass, 3 proxy registrations submitted. `#readProxyContract` tab shows the correct ABI at each proxy address on Basescan.
