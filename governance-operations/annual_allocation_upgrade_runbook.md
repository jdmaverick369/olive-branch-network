# Annual governance: fixed Phase 2 allocation upgrade

Status (23 September 2026): upgrade executed and verified on Base at block 51703926.
The proxy now uses implementation `0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3`.
The Timelock operation is complete; owner, voteAdmin, and cycle ID were preserved.
See [execution record](2026-09-23-annual-fixed-allocation-execution-record.json).
See [archived deployment and scheduling instructions](../.archive/annual-governance-2026-09/2026-09-21-annual-fixed-allocation.md).

## Resulting behavior

Both protocol funds use `executePhase1()` as the contribution cutoff. Phase 1
still burns or transfers TheOffering's full balance. Immediately afterward, in
the same transaction, AnnualGovernance records ExtendOliveBranch's balance,
including any Give transfer, as that cycle's Phase 2 allocation.

Claims continue normally. Receipts before Phase 1 execution count for the current
cycle, including receipts after Phase 1 voting closes if execution is delayed.
Receipts after Phase 1 execution stay for the next cycle, including receipts
after Phase 2 voting closes. Transaction ordering determines the cutoff even
when a claim and execution occur in the same block. Unclaimed rewards are not
vault funds and enter the accounting when minted, not when economically earned.

Phase 2 pays only the recorded allocation. Zero is a valid fixed allocation and
does not cause a fallback to the live balance. With no Phase 2 participation,
the vault retains both the fixed allocation and subsequent receipts. They become
available to the next cycle. No new escrow or token allowance is introduced.

## Storage and compatibility

- Only AnnualGovernance's implementation changes. Both vaults, staking, token,
  proxy address, owner, voteAdmin, and voting rules stay in place.
- `phase2Allocation` and `phase2AllocationFixed` are appended to the end of the
  mapping-backed `Cycle` struct. All existing field offsets, nested mappings,
  top-level slots, and the 50-slot top-level gap are preserved. The gap is not
  reduced because no top-level state was added.
- Existing function signatures, cycle enum values, and event signatures remain.
  Added: `getPhase2Allocation(uint256) -> (uint256 amount, bool isFixed)` and
  `Phase2AllocationFixed(uint256 indexed cycleId, uint256 amount)`.
- The implementation requires no initializer or migration call. Upgrade calldata
  is `upgradeToAndCall(newImplementation, "0x")`.
- Old completed/cancelled cycles return `(0, false)` from the new getter; this
  does not mean a historical payout was zero. Use historical `Phase2Executed`
  events for payouts. New cycles return `(amount, true)` after Phase 1 execution.
- Both old and new implementations reject upgrades in every active cycle state.
  Upgrade before starting a cycle, or after completion/cancellation. Coordinate
  with voteAdmin so a cycle is not started during the Timelock delay.

## Administrative withdrawals and recovery

The existing vault lets its Timelock owner distribute or emergency-sweep funds.
The allocation is an accounting record, not an enforced vault reservation. Avoid
withdrawing the committed allocation during Phase 2.

If the vault holds less than the fixed allocation, execution reverts with
`phase2 allocation underfunded`; no partial payout or completion is recorded.
Restore sufficient OBN to the vault, then retry `executeCurrentCycle()`. Later
receipts can replenish a shortfall because tokens are fungible. Maintaining the
full allocation in the vault is necessary to preserve all later contributions
for the next cycle. Cancellation and upgrades remain blocked after Phase 1 until
the cycle completes. There is no new admin bypass to rewrite the voted allocation.

## Validation before deployment

From `obn-project`, with mainnet forking disabled:

```powershell
$env:FORK_MAINNET = 'false'
$env:TEST_GOVERNANCE_V94 = 'false'
npx.cmd hardhat test --network hardhat
```

The new `AnnualGovernanceAllocation.test.js` suite covers real claim emissions
on staking v9.3, real Give transfers and burns, execution cutoffs, consecutive
cycles, rollovers, zero allocations, cancellation, failed external calls,
administrative shortfalls and recovery, historical storage preservation,
OpenZeppelin upgrade validation, all active-state upgrade guards, authorization,
initializer locks, and a real Timelock upgrade rehearsal.

The separate, unreleased v9.4 staking work is not required by this release. If
`StakingPoolsV94.sol` is present, its additional claim integration can be run explicitly:

```powershell
$env:TEST_GOVERNANCE_V94 = 'true'
npx.cmd hardhat test test/AnnualGovernanceAllocation.test.js --network hardhat
$env:TEST_GOVERNANCE_V94 = 'false'
```

## Source release scope

This update preserves linear stake-weighted voting, the voting-power snapshot,
ballot rules, and Burn/Give outcomes. Identity verification and changes intended
to reduce wealth-based influence are deferred to a separate governance design.

Commit only these files for the annual-governance release:

```text
governance-operations/annual_governance_runbook.md
governance-operations/annual_allocation_upgrade_runbook.md
governance-operations/annual_allocation_security_review.md
obn-frontend/src/app/governance/extend/page.tsx
obn-frontend/src/hooks/useGovernanceCycle.ts
obn-frontend/src/lib/governanceAbi.ts
obn-project/contracts/AnnualGovernance.sol
obn-project/contracts/test/AnnualGovernanceV1.sol
obn-project/test/AnnualGovernance.test.js
obn-project/test/AnnualGovernanceAllocation.test.js
obn-project/scripts/governance/annual_allocation_upgrade_checks.js
obn-project/scripts/governance/prepare_annual_allocation_upgrade.js
```

Suggested commit title: `Fix annual Phase 2 allocation at Phase 1 execution`.
Source publication does not upgrade the deployed proxy; complete the deployment
procedure below separately.

## Baseline and frontend validation

`contracts/test/AnnualGovernanceV1.sol` is the pre-change source with only the
contract name changed. Keep it frozen as the storage and executable-code baseline.
The operational preflight compares deployed V1 executable bytecode to this
baseline, substituting the expected UUPS immutable implementation address and
ignoring only compiler metadata. It refuses an unrecognized baseline;
do not bypass that check. Investigate compiler settings/source differences and
validate against the actual deployed version instead.

From `obn-frontend`, run `npm.cmd run typecheck`. The Phase 2 voting page reads the
new getter and displays the fixed allocation. Older implementations or failed
reads show an explicitly labeled vault balance, never a fabricated zero allocation.

## Deploy and prepare unsigned Safe transactions

Historical procedure for the completed September 2026 upgrade. The V1 baseline
address below is the previous implementation, not the current implementation.
Do not rerun this operation; use the execution record above for current status.

Use the existing Base RPC, funded deployer configuration, and Timelock/Safe
configuration. Set these environment variables in PowerShell from `obn-project`:

```powershell
$env:ANNUAL_GOV_PROXY = '0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270'
$env:ANNUAL_GOV_EXPECTED_IMPL = '<independently verified current implementation address>'
$env:ACTION = 'check'
npx.cmd hardhat run scripts/governance/prepare_annual_allocation_upgrade.js --network base
```

The preflight verifies chain, proxy implementation address, V1 executable code,
Timelock ownership/code, inactive cycle state, and OpenZeppelin storage/upgrade
compatibility. The live preflight passed on 21 September 2026 against implementation
`0x4721Cc867084fD656E2B45A4b0937fE32245A553`; repeat it before scheduling or execution.

Deploy only the new implementation:

```powershell
$env:ACTION = 'deploy'
npx.cmd hardhat run scripts/governance/prepare_annual_allocation_upgrade.js --network base
```

Record the printed implementation address, verify its source on the explorer,
and preserve the reviewed build/artifacts used for deployment:

```powershell
$env:ANNUAL_GOV_ALLOCATION_IMPL = '<new implementation address>'
npx.cmd hardhat verify --network base $env:ANNUAL_GOV_ALLOCATION_IMPL
$env:ACTION = 'schedule'
npx.cmd hardhat run scripts/governance/prepare_annual_allocation_upgrade.js --network base
```

Schedule generation rechecks the proxy and candidate bytecode, checks the
configured delay against the live Timelock minimum, then writes an unsigned Safe
JSON under `governance-operations`. Review the target proxy, implementation,
zero ETH value, and empty initializer data before signing. Save the printed
`SALT` and `OP_ID`, then schedule through the existing Safe procedure.

After the operation becomes ready, generate its matching execute JSON:

```powershell
$env:SALT = '<salt from schedule>'
$env:OP_ID = '<operation ID from schedule>'
$env:ACTION = 'execute'
npx.cmd hardhat run scripts/governance/prepare_annual_allocation_upgrade.js --network base
```

This rechecks the same implementation, candidate build, owner, and cycle state;
the shared Safe helper requires an exact operation-ID match. Review and execute
through the Safe after the Timelock delay. Neither JSON-generation action sends
a transaction. Recheck cycle state immediately before signing/execution; a new
active cycle causes the on-chain upgrade to revert.

## Verify after execution

1. The proxy's ERC-1967 implementation equals the reviewed candidate address.
2. `owner`, `voteAdmin`, all dependency addresses, `maxBallotSize`, cycle ID,
   historical summaries, ballots, and votes match the pre-upgrade records.
3. `getPhase2Allocation` is callable. Historical cycles return `isFixed=false`.
4. During the next normal cycle, Phase 1 emits `Phase2AllocationFixed` after its
   Burn/Give action. The getter agrees with the event, including a zero amount.
5. The frontend shows the fixed allocation in Phase 2. `Phase2Executed.amount`
   agrees with it; later receipts remain in the vault, subject to the existing
   administrative powers described above.

Local validation is not an independent audit or a live-chain fork rehearsal.
Review the final deployment artifacts and execute the live preflight before release.
