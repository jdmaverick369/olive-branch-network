# Monthly autoclaim worker

This standalone Node 22 package runs independently of the Vercel frontend.
From this directory: `npm ci --ignore-scripts`, then `npm test`.
`npm run check` verifies configuration and mainnet connectivity without creating
accounts, signing transactions or submitting claims. `npm start` runs the worker;
it simulates unless `AUTOCLAIM_SEND=true`.

## Contract configuration

The worker calls staking proxy `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` through executor smart account `0x8cc01b1EA8a1Bb480456AEF2B91B7cBA81A21d27`. The V9.3.1 implementation is `0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f`; the worker must continue targeting the proxy.

The worker requires the proxy to expose V9.3.1 and the configured executor. Deployment receipts and activation status are tracked in the [protocol release record](../../docs/v931-release-record.json).

Set `AUTOCLAIM_START_BLOCK` to the actual upgrade execution receipt block, not implementation deployment block 51737196 or scheduling block 51738479.

## GitHub Actions setup

Workflow: `.github/workflows/monthly_autoclaim.yml` on the default `main` branch.
Run it manually with `send=false` while `AUTOCLAIM_ENABLED=false` to execute the
regression tests and read-only readiness check. The claim job will be skipped.
Scheduled runs are disabled until the repository variable is explicitly enabled.

Repository secrets (never commit these values):

- `AUTOCLAIM_RPC_URL`
- `AUTOCLAIM_PAYMASTER_URL`
- `AUTOCLAIM_CDP_API_KEY_ID`
- `AUTOCLAIM_CDP_API_KEY_SECRET`
- `AUTOCLAIM_CDP_WALLET_SECRET`

Repository variables:

- `AUTOCLAIM_ENABLED=false` before launch.
- `AUTOCLAIM_OWNER`: dedicated CDP owner EOA.
- `AUTOCLAIM_EXECUTOR`: dedicated CDP smart account.
- `AUTOCLAIM_START_BLOCK`: actual V9.3.1 upgrade block; leave unset beforehand.

After the upgrade, record its block and verify the executor on-chain. A controlled
mainnet sponsored claim must succeed before enabling general scheduling. Enabling
the repository variable permits scheduled submissions on the 14th of each month, hourly from 09:23 through 23:23 UTC, so keep
it false until activation checks pass. Once enabled, manual `send=false` runs simulate;
manual `send=true` runs submit. The contract enforces the monthly limit per pool.

The job processes at most 300 wallet batches per run. This is distinct from CDP's
monthly 300-operation allowance for the shared executor. The $10 monthly executor
allowance also covers all opted-in wallets combined, rather than each staker.

## Recovery

The journal is `scripts/autoclaim/.autoclaim/state.json` relative to repository root.
The workflow serializes runs and preserves it in an Actions cache plus a private
90-day artifact. If the cache is evicted, recover the latest artifact before live
submission. Do not delete an ambiguous submission to force a retry. A lost
response reuses its idempotency key; confirmed rejections can retry with a new key.

SDK 1.52.0 is pinned because the transport disables hidden retries through a
version-specific integration. Run the transport test before upgrading dependencies.

See `docs/v931_autoclaim_runbook.md` for contract behavior and fork/testnet evidence.

## Runtime measurement

Run a local simulation with AUTOCLAIM_SEND=false after the upgrade and start block are configured. Keep scheduled automation disabled during the pilot. Each batch logs durationMs; the final summary reports indexingMs (startup and event indexing), eligibilityMs, walletsChecked, optedInWallets, and totalDurationMs. Simulation measures reads and preflight only, not CDP submission or confirmation latency.

Measure actual sponsored batch durations in the controlled mainnet pilot. Estimate a full run using observed read/indexing time plus batch count multiplied by conservative sponsored batch duration. Keep headroom below the 45-minute claim-job timeout, which also includes checkout and dependency installation. Confirm the estimate against the first full production run; a small pilot is not a 300-wallet load test. The 300 limit counts attempted batches, including failures; reconciliation is separate.

Live submissions are blocked outside the 14th UTC, including manual dispatches. Simulations remain available any day. Hourly runs on the 14th retry failures and continue batches beyond the per-run limit; successful pools are skipped. Claims not completed that day wait until the next month. Discovery uses finalized opt-in events and execution checks current consent; opt-ins not finalized before the last run may wait until the next month. A transaction submitted before midnight may confirm afterward.
