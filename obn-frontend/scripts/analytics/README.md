# Daily on-chain analytics

The network graphs and Squarespace impact widget use `/api/analytics`.
Nonprofit pool cards continue reading the Lens contract every 30 seconds.

## Definitions

- **Active Stakers:** distinct addresses with positive stake across any pool, including nonprofit bootstrap positions. A wallet in two pools counts once.
- **Total Staked:** sum of current staking balances, in OBN.
- **Total Contributed:** cumulative `CharityDistributed`, `CharityFundDistributed`, and the nonprofit's own-pool `Claim` rewards from its seed stake. A claim qualifies only when its recipient matches that pool's charity wallet at that exact event position. `PoolAdded` and `CharityWalletUpdated` track historical recipients, including migrations; removed pools cannot qualify treasury claims as nonprofit rewards. Each event's actual minted amount is counted once. Excludes seed principal, ordinary staker claims, pending/unminted rewards, `CharityAllocated`, treasury distributions, and direct donations outside these events.

Daily points are UTC end-of-day balances, with the most recent day showing the last indexed finalized block. Only the display converts exact integer token amounts into JavaScript numbers.

## Automatic operation

Merge `.github/workflows/daily_analytics.yml` into `main`, then run **OBN Daily Analytics** from GitHub Actions. It also runs daily at 07:41 UTC. The workflow needs permission to write repository contents and push data updates to `main` (branch protection must allow the bot). It submits no blockchain transactions and requires no wallet key.

The default is Base's free public RPC. Optionally set the Actions secret `ANALYTICS_RPC_URL` to another Base mainnet RPC with historical `eth_getCode` and `eth_call` access. Set the repository variable `ANALYTICS_LOG_RANGE` only if needed; otherwise the worker remembers an accepted range. It shrinks requests when providers enforce a smaller range, retries rate limits, and stops within a bounded time/request budget.

A verified history snapshot and checkpoint are included, covering September 6, 2025 onward. The workflow continues from that checkpoint. When rebuilding from scratch, the worker discovers the proxy's original deployment using historical code reads; initial backfill can require many runs, especially with small provider block-range limits. Run it again to resume immediately rather than waiting for the next day. Daily runs read only new blocks. Standard GitHub-hosted runners are free for public repositories; private repositories have a monthly allowance. Provider and Actions limits still apply.

The repository stores `scripts/analytics/state.json` (public on-chain wallet balances and an exact checkpoint) and `src/data/analytics.json` (small daily chart series). Checkpoints survive failed or time-limited runs. The worker publishes only after reaching the finalized tip and matching `globalTotalStaked` and `uniqueStakersGlobal`. A finalized block hash mismatch stops processing for investigation; it never silently resets history. Wallet-change events trigger historical balance reads to handle `migrateBootstrap`, which does not emit deposit/withdraw events.

Checkpoint schema 2 includes historical charity wallets and the exact `seedClaims` subtotal. Schema 1 checkpoints and archives are rejected because they omitted claim events; rebuild in a fresh state directory from deployment instead of appending new claims to incomplete history. RPC archives record their event topics and reject incompatible cached ranges. The frontend snapshot retains schema 1 because its response shape is unchanged.

If balances become negative or reconciliation fails, retain the checkpoint for diagnosis and rebuild from deployment with complete RPC history. Do not skip the failing events or publish the partial state. A changed historical data source cannot repair already-indexed days merely by continuing from a later cursor.

The API serves the snapshot bundled with the deployment. Connect the normal Vercel deployment to commits on `main`, including commits from `github-actions[bot]`, so daily updates reach the site. Confirm the first bot data commit deploys successfully; [Vercel applies commit-author checks for private repositories](https://vercel.com/docs/deployments/troubleshoot-project-collaboration). If deployment is manual, deploy after each update. A GitHub Actions deployment workflow will not automatically run in response to a push made with `GITHUB_TOKEN`; use the hosting provider's Git integration or explicitly invoke the deployment workflow. No runtime GitHub token or analytics service API key is needed, including for private repositories.

`src/data/analytics.json` keeps charts available during RPC outages. Until a complete snapshot is available, the graphs show unavailable status; they do not invent data. The API includes the indexed UTC cutoff in `throughTimestamp`; the page omits the freshness caption.

## Local import

From the repository root, using Node 22 or newer:

```powershell
$env:ANALYTICS_RPC_URL = 'https://mainnet.base.org'
$env:ANALYTICS_STATE_DIR = '.analytics'
node scripts/analytics/run.mjs
```

Root dependencies include ethers. For a standalone worker, run `npm ci` inside `scripts/analytics` first. Optional limits: `ANALYTICS_MAX_SECONDS` (default 480), `ANALYTICS_MAX_REQUESTS` (default 20000), `ANALYTICS_LOG_RANGE` (initial default 10000). Re-run with the same state directory until it reports `Published`. To ship a bundled snapshot, copy `.analytics/analytics.json` to `src/data/analytics.json` after successful verification. Keep the state file for later updates; do not substitute an upgrade block for deployment history.

To continue locally from the bundled checkpoint instead of rebuilding, create `.analytics` and copy `scripts/analytics/state.json` into it before running the worker. Publish both the validated chart snapshot and its corresponding checkpoint together.

Run `npm test --prefix scripts/analytics` for worker regression tests and `npm run typecheck` for frontend types.

### Optional faster initial import

`bootstrap.mjs` downloads finalized contract logs directly through JSON-RPC in four concurrent block ranges, saving completed ranges so interrupted downloads can resume. It discovers the deployment block automatically and verifies the checkpoint block hash. The default range is 2,000 blocks; `ANALYTICS_LOG_RANGE` can override it for providers supporting larger ranges. `ANALYTICS_BOOTSTRAP_CONCURRENCY` accepts 1–16 (default 4); use a concurrency within your provider's limits. The regular worker then verifies range anchors and reconciles balances. No third-party explorer index is used.

Dates use Base's two-second full-block clock, verified against the first/last event headers and the range's ending block. If those anchors do not match that cadence, the worker fetches individual event block timestamps instead. See the [Base derivation rules](https://docs.base.org/base-chain/specs/protocol/consensus/derivation) and [full blocks versus Flashblocks](https://blog.base.dev/accelerating-base-with-flashblocks). Finalized checkpoint hashes are checked on every restart.

With the same local environment as above:

```powershell
node scripts/analytics/bootstrap.mjs
$env:ANALYTICS_LOGS_FILE = '.analytics/bootstrap-logs.json'
node scripts/analytics/run.mjs
```

Optionally set `ANALYTICS_LOG_RPC_URL` to a separate Base RPC for log requests while `ANALYTICS_RPC_URL` handles block headers and historical contract reads. Both default to the same provider; the daily workflow needs only one RPC.
