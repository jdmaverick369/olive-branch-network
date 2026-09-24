# Sponsored monthly autoclaim — V9.3.1

This runbook defines wallet consent, claim execution, sponsorship, and operator recovery. Transaction history and activation status are maintained in the [release record](2026-09-24-staking-v931-autoclaim-record.json).

- Staking proxy: `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2`.
- Implementation: [`0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f`](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code).
- Executor smart account: `0x8cc01b1EA8a1Bb480456AEF2B91B7cBA81A21d27`.

## Behavior

Users enable `setAutoClaimEnabled(true)` from their own wallet on the existing
staking proxy. Consent covers all current and future pools for that wallet.
Disabling is always available, including after fully withdrawing or while the
executor is paused. Only the wallet can change its preference. These transactions
use sponsorship when the connected wallet supports the configured paymaster;
other wallets pay gas for consent transactions. The monthly claims themselves
are submitted and sponsored through OBN's dedicated CDP smart account.

The worker batches every eligible pool for a wallet into one
`autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)`
call. Batches above 32 pools are split into bounded operations. Pool IDs must be
strictly ascending. Pools already automatically claimed this month and pools
with no claimable user rewards are skipped. A batch with no rewards reverts.
Other failures revert the entire batch, including its monthly accounting.

The contract enforces one successful automatic claim per pool per UTC Gregorian
calendar month, encoded as `year * 12 + month`, with January numbered 1. Enabling
allows the first claim in the current month. Re-enabling does not reset limits.
Consent nonces invalidate queued calls when users disable/re-enable. An operation
prepared for an earlier month cannot execute in a later month. This is not a
rolling 30-day cooldown; claims near a month boundary can be close together.

The worker runs daily to catch new opt-ins and retry failures. Manual claims,
deposits and withdrawals retain their existing behavior and do not consume the
automatic monthly allowance. Claims follow the original reward distribution;
neither the executor nor the user can supply alternate reward recipients.

The legacy `claimFor(pid,user)` remains owner-only, including its existing ability
to claim without opt-in. Consent restrictions apply to the delegated automation
entry point. Governance retains all existing administrative powers.

## Contract and storage

- Implementation: `contracts/StakingPoolsV931.sol:OBNStakingPoolsV931`, derived
  from the frozen V9.3 source, not V9.4's seed changes.
- Inherited abstract module: `MonthlyAutoClaimUpgradeable.sol`. Its code is compiled
  into the staking implementation; no separate deployment or runtime contract
  dependency is required. ERC-7201 namespace
  `obn.storage.MonthlyAutoClaim` holds executor, preferences, consent nonces and
  per-pool monthly records. The V9.3 linear storage layout and 93-slot gap remain
  intact. Never reorder or repurpose the namespace fields.
- Upgrade atomically with `upgradeToAndCall(candidate,
  abi.encodeCall(initializeV931,(executor)))`. The owner-only reinitializer sets
  version `9.3.1` and the executor; V9.3 migration must already be complete.
- Owner may rotate the executor or set it to zero with `setAutoClaimExecutor`.
  Use the smart account address, not its EOA owner. Counterfactual smart accounts
  may not have deployed bytecode until their first operation.
- Subsequent staking implementations must preserve the autoclaim namespace,
  consent, monthly limits, executor, and initializer-version ordering.
- Implementation compiler overrides use Solidity 0.8.28, viaIR, Cancun and
  optimizer runs=1 to fit EIP-170. Existing V9.3 compiler settings stay unchanged.
  V9.3.1 runtime size is 23,660 bytes, below the 24,576-byte EIP-170 limit.

## Commission the dedicated account

Use separate CDP credentials for this service. Do not reuse protocol admin keys
or the swap service's credentials. From the private production frontend repository, after configuring the
server-only variables in `.env.local`:

```powershell
node --env-file=.env.local scripts/autoclaim/create-account.mjs
```

Record `AUTOCLAIM_OWNER` and `AUTOCLAIM_EXECUTOR`. The setup script creates or
retrieves named CDP accounts; it does not grant protocol permissions. SDK gas
sponsorship requires the explicitly configured `AUTOCLAIM_PAYMASTER_URL`:
[CDP smart-account documentation](https://docs.cdp.coinbase.com/wallets/using-wallets/smart-accounts).

Configure the provider policy for Base, this smart account, the staking proxy,
and the exact `autoClaimFor(uint256[],address,uint256,uint256)` selector, with
project/account gas budgets and rate limits. This worker never falls back to
self-funded transactions. Provider spending limits remain necessary even though
the contract prevents duplicate successful claims. Confirm the policy supports
the encoded smart-account batch envelope, not just its outer execution selector.

## Governance execution and verification

The Timelock owns the staking proxy. Governance upgrades it with a single
`upgradeToAndCall(implementation, initializeV931(executor))` call, so the
implementation and authorized executor are initialized atomically. The proxy
address and existing staking positions are preserved.

Use the saved operation ID and salt from the release record. Do not regenerate
an already scheduled operation. After the recorded Timelock delay, generate the
matching unsigned execution payload from `obn-project`:

```powershell
$env:FORK_MAINNET = 'false'
$env:STAKING_V931_IMPL = '0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f'
$env:AUTOCLAIM_EXECUTOR = '0x8cc01b1EA8a1Bb480456AEF2B91B7cBA81A21d27'
$env:SALT = '0xb0af7ce6c94b82cd5079e2cfd1a425bf047b51ce9de599f0ea05528ae7c17a1d'
$env:OP_ID = '0xef6f6aa72fa93747a7bda001c37a7649c94edf8e040af552ce294e0150352e58'
$env:ACTION = 'execute'
npx.cmd hardhat run scripts/governance/prepare_v931_upgrade.js --network base
```

The generator checks the existing implementation, owner, candidate bytecode,
storage compatibility, readiness, and operation ID. It writes unsigned Safe JSON;
it does not broadcast the upgrade. A completed operation must not be replayed.

After execution, verify the implementation slot, version `9.3.1`, Timelock owner,
executor, representative stakes, and historical voting power. Set
`AUTOCLAIM_START_BLOCK` to the upgrade execution receipt block, not the
implementation deployment or scheduling block. Preserve the receipt with the
release record. Worker activation additionally requires a controlled sponsored
mainnet claim and verification of its recipients and monthly records.

## Worker and activation

The following commands and workflow refer to the private production frontend repository, not the public reference frontend in this monorepo.

For the standalone GitHub worker, run `npm ci --ignore-scripts` and `npm test`
from `scripts/autoclaim`. `node --env-file=../../.env.local check.mjs` verifies
configuration without submitting transactions, including before the upgrade.
After upgrading, `node --env-file=../../.env.local run.mjs` with
`AUTOCLAIM_SEND=false` indexes opt-ins and simulates eligible batches.
Live submissions require `AUTOCLAIM_SEND=true`. See the worker's README for
GitHub secrets, variables, the disabled-by-default setup, and activation order.

The worker indexes finalized consent events from the upgrade block in bounded
RPC ranges, retaining a block hash and cursor. It rechecks current consent and
monthly state, skips zero stakes and pools already auto-claimed this month, and
includes every pool whose pending gross rewards produce a positive user payout
after the contract's integer-rounded 88% split. One gross wei waits; two gross
wei produces one user wei and qualifies. There is no service minimum threshold. Eligible pools
are batched per wallet, splitting only above the contract's 32-pool limit.
Default submission limit is 100 wallet batches per run, including failed batches.

The journal is `.autoclaim/state.json`. It reserves an idempotency key before
submission through CDP's combined `prepareAndSendUserOperation` endpoint (the key
covers preparation and broadcast), saves the UserOperation hash, waits for confirmation and checks the
inner `MonthlyAutoClaimed` events. A timeout leaves the operation unresolved and
stops further submissions until reconciliation. Confirmed failures are eligible
for a new attempt, as are operations CDP explicitly reports as dropped; unknown
outcomes must not be treated as failed transactions.
Do not manually run another worker with the same executor concurrently.

`.github/workflows/monthly_autoclaim.yml` remains disabled until repository variable
`AUTOCLAIM_ENABLED=true`. Configure its named secrets and variables first. Manual
dispatch defaults to simulation; scheduled runs submit once enabled. Workflow
concurrency serializes runs; cache and artifacts preserve the journal even after
worker failures. Restore the latest journal artifact if the cache is evicted.
Without it, chain records still prevent duplicate successful claims, but pending
submissions may be retried and waste sponsored gas. For higher scale, replace
file/cache persistence with a transactional store and distributed worker lease.
Do not rely on GitHub scheduling for an exact execution time or delivery SLA.

After an end-to-end sponsored pilot confirms, expose the profile control with
`NEXT_PUBLIC_AUTOCLAIM_ENABLED=true`. Keep that UI flag enabled if the worker is
paused so users can revoke their preference. A worker kill switch is the GitHub
variable; contract-level revocation is `setAutoClaimExecutor(address(0))` through
the current owner. Revocation ordering follows transaction inclusion: an already
executed claim cannot be undone.

## Future identity and voting

Consent belongs to wallet addresses and is not proof of a unique human. This
release collects no identity data and changes no voting rules. A future identity
registry can associate wallets with an independently verified participant and
inform governance eligibility or sponsorship quotas. Identity linking must not
allow another address to enable autoclaim, redirect rewards, or reset a wallet's
monthly limits. Keep identity, wallet custody and voting weight separate.

## Release verification and worker failure handling

The worker skips expected pre-submission simulation reverts (no payable rewards,
revoked/stale consent, or month rollover) and continues to later jobs. Unexpected
RPC or contract errors still stop the run. Structured CDP client rejections on a
fresh submission are persisted as failed, allowing later wallets to proceed and
a future retry to use a new idempotency key. Error messages/URLs are not saved.
Timeouts, 5xx, idempotency conflicts, malformed success responses, and rejections
after an earlier ambiguous submission remain unresolved: preserve the journal
and reconcile the same key. Never clear an uncertain entry just to resume work.
Older unresolved journals need the same reconciliation; a new rejection alone
does not establish that the original request never broadcast.

CDP SDK is pinned to 1.52.0. The worker disables the SDK's hidden HTTP retries
through its internal transport so an API rejection cannot conceal a previous
timeout. Run npm test from scripts/autoclaim before changing the SDK version. Classification
follows https://docs.cdp.coinbase.com/api-reference/v2/errors.

Base fork rehearsal passed at block 51718735: deployed V9.3.1 locally, upgraded
the existing proxy atomically from its impersonated Timelock owner, preserved
stake balances, and claimed for an existing staker. Duplicate claims and revoked
consent reverted. This rehearses owner execution, not live Safe signatures or the
Timelock delay; local contract tests cover the schedule/delay/execute path.
Reproduce from obn-project with FORK_MAINNET=true and FORK_BLOCK_NUMBER=51718735:
npx.cmd hardhat test test/MonthlyAutoClaimFork.test.js --network hardhat

The real Base Sepolia sponsored pilot passed against test proxy
0x94c1ca0eD9bEeb7C65C8E45f4bfd438de57De087, using executor 0x8cc01b1EA8a1Bb480456AEF2B91B7cBA81A21d27.
EntryPoint receipts confirmed successful UserOperations with a nonzero paymaster
for both the single-pool claim and the two-pool claim in one operation.

- Pools 0: https://sepolia.basescan.org/tx/0x1da77b29ff84194a2ea4db5340f512d5cbbaf20ce082dae4e6cc82980e852fa4
- Pools 0, 1: https://sepolia.basescan.org/tx/0x8a09c16f4e91c26d7608902c8b830ae2f9234d822cf56c9b0f03998a6b04d0b0
- Opt-out transaction: https://sepolia.basescan.org/tx/0x38f18ad305f0db3cf3a5a0c13a97958613943cd2b3538e259311fb49112c6f7d

After successful claims, eth_call simulations rejected duplicate monthly claims
with NoClaimableRewards. After the on-chain opt-out, simulation rejected the
executor with AutoClaimDisabled. These negative cases were simulated, not sent
as deliberately failing sponsored transactions. Test stakers were harness contract
wallets; the executor was the actual CDP smart account. Email-wallet onboarding
and sponsored opt-in were outside this pilot.

Credentials and executor configuration are now saved privately in
C:\obn-frontend\.env.local. Mainnet deployment, its actual upgrade start block,
and production paymaster acceptance/budgets still need completion. The maximum 32-pool batch has now also passed on Base Sepolia (see below).
Production contracts and automation activation flags were not changed.


## Maximum batch and mainnet configuration verification

The same Base Sepolia pilot proxy processed all pools 0 through 31 for a new
test staker in one successful CDP UserOperation. The EntryPoint event confirmed
paymaster 0x709A4bae3DB73a8E717AEfca13E88512f738b27f and 5,557,453 actual gas used.
Transaction: https://sepolia.basescan.org/tx/0x5d734dac4b305b484e0ed4145ddb204f083d408a95636bb62a18a1b003db7d28
Receipt evidence: governance-operations/autoclaim-sepolia-max-results.json in the
contracts repository. Duplicate and post-opt-out eth_call checks also passed.
This proves sponsorship for the tested state, not a worst-case gas guarantee.

Mainnet read-only checks confirmed chain 8453, the reviewed V9.3 implementation,
Timelock ownership, 11 existing pools, and access to the expected CDP owner and
executor. The executor is not yet deployed on mainnet; its first UserOperation
can deploy it. The missing AUTOCLAIM_RPC_URL is configured locally from the
verified Base endpoint. AUTOCLAIM_SEND remains disabled and AUTOCLAIM_START_BLOCK
must be set to the actual production upgrade block after execution.

User confirmed updating the mainnet paymaster policy to $10 per user monthly
and 300 UserOperations per user monthly; previously reported overall cap is $600.
These are user-reported settings, not independently retrieved from CDP. Whether
the updated policy is exclusive to automation or shared with frontend users has
not been confirmed. All automated users share the executor
address for these quotas. One wallet batch uses one operation, with additional
capacity needed for retries or batches above 32 pools. The overall budget does
not override the executor's per-user limits. Size an
automation-specific policy for enrolled wallets plus retry capacity; retain
ordinary frontend-user protections. No portal limits were changed by this check.

Production activation requires the configured proxy/function allowlist, an
opted-in stake, and a confirmed sponsored claim with the expected recipients and
monthly records. Preserve the pilot receipt before enabling scheduled submissions.
