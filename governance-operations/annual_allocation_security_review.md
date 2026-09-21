# Fixed Phase 2 allocation: local security review

Reviewed 17 September 2026; release isolation rechecked 20 September 2026.
Implementation prepared locally; no deployment,
Safe submission, or live-chain upgrade was performed.

## Scope and conclusion

Reviewed the AnnualGovernance change, appended storage fields, frontend allocation
read/display, implementation preflight, and Timelock upgrade payload. No new
security defect was identified in the reviewed change under the existing trusted
OBN token/vault and administrative-role model. This is a local code review and
test result, not an independent audit or a guarantee of absence of vulnerabilities.

## Properties checked

- **Allocation integrity:** the snapshot occurs after the real Give transfer in
  the same transaction. Burn does not add TheOffering funds. Later receipts never
  increase that cycle's recorded allocation, including during delayed execution.
- **Zero handling:** a separate fixed flag distinguishes a real zero allocation
  from an old or unexecuted cycle. There is no live-balance fallback.
- **Single execution:** existing state gates reject repeat execution. Phase 1 sets
  its execution flag before the existing vault call; Phase 2 sets its flag before
  distribution. Failures revert these state changes atomically. The new balance
  queries are static calls, and no additional token allowance or arbitrary call
  target is introduced. The existing OBN token/vaults do not invoke recipient hooks.
- **Storage safety:** fields are appended only within the mapping-backed Cycle
  struct. The existing mappings, slots, gap, enum values, and ABI remain intact.
  OpenZeppelin validates the upgrade without storage-check bypasses. Actual proxy
  upgrades preserve historical summaries, ballots, voting flags, tallies,
  dependency addresses, and roles. The frozen V1 source was compared with the
  original repository source; only its contract name differs.
- **Upgrade authority:** owner-only UUPS authorization, disabled implementation
  initialization, and active-cycle upgrade guards remain intact. All four active
  states are tested on both old and new implementations. A real Timelock enforces
  its delay and executes the production-shaped `upgradeToAndCall(candidate, 0x)`.
- **Distribution rules:** ballot authority after whitelist revocation, rollover,
  cancellation, exact payout, and retention for the following cycle are exercised.
- **Operational checks:** preflight rejects a wrong chain, unexpected current
  implementation, unrecognized V1 executable code, incorrect candidate build,
  and wrong owner. UUPS immutable addresses are substituted at compiler-reported
  offsets before bytecode comparison; candidate metadata is also checked.

## Material limitation

ExtendOliveBranch's existing Timelock-controlled manual distributions and emergency
sweep remain available. The fixed allocation is not segregated or locked in the
vault. If an admin withdraws committed funds, Phase 2 reverts on insufficient
balance and requires replenishment. Tests cover partial and total depletion,
atomic failure, replenishment, and retry. A Phase 2 shortfall also delays completion
and therefore further upgrades/cycles. There is deliberately no allocation-editing
or cancellation bypass after Phase 1. See the
[upgrade runbook](annual_allocation_upgrade_runbook.md) for recovery details.

## Validation results

- Isolated source release: **127 passing**, compiled from committed project files
  plus only the annual-governance release files, with fresh artifacts/cache.
  Neither unreleased `StakingPoolsV94.sol` nor `Seed.sol` was present. Installed
  node dependencies were reused; this was not a fresh dependency-install check.
- The release includes **26** focused allocation/upgrade tests using committed
  staking v9.3, both real vaults, and the real OBN token.
- Explicit optional v9.4 integration run in the working tree: **27 passing** with
  `TEST_GOVERNANCE_V94=true`. Default tests no longer require untracked v9.4 work.
- The earlier combined working-tree suite passed 162 tests before that dependency
  was made opt-in. All runs used the local Hardhat network with mainnet fork disabled.
- Frontend TypeScript check: passed.
- ESLint on changed frontend files: zero errors; 10 warnings in existing code.
- Node syntax checks for both new operational scripts: passed.
- Git whitespace/diff checks: passed.

Live implementation/source matching, source verification of the new deployment,
and actual Safe/Timelock execution are release steps, not completed local checks.

The release preserves linear stake-weighted voting. Its concentration and
vote-buying risks are unchanged; square-root voting and identity/Sybil defenses
are outside this update's scope.
