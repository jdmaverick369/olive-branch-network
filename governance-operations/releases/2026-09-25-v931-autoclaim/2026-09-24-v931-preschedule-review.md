# V9.3.1 pre-scheduling recheck

Completed 2026-09-24. No release-blocking regression identified in these checks.
No mainnet transactions were submitted during this review. The deployed source,
implementation address, and unsigned Safe scheduling file were not changed.

## Exact release tested

- Base fork block: 51737615.
- Implementation: `0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f`.
- Staking proxy: `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2`.
- Operation ID: `0xef6f6aa72fa93747a7bda001c37a7649c94edf8e040af552ce294e0150352e58`.
- Safe file: `2026-09-24-staking-v931-autoclaim-schedule.json`.
- Safe file SHA256: `0c4641a8ca3455f08c2fb3964febdbf03dc0413af029774363e2530dd4573a64`.

## Results

The local fork scheduled the exact saved payload from the Operator Safe address,
advanced through the Timelock delay, and executed the upgrade to the already
deployed implementation with atomic initialization. Deployed code matched the
release runtime hash; OpenZeppelin storage validation passed. All old ABI
functions, events, and errors retained their signatures and definitions.

A control branch retained V9.3. The upgraded branch used V9.3.1. Both branches
ran the same transactions at explicitly matched timestamps. Across all 11 pools
and 16 representative wallet addresses, state matched immediately after upgrade
and after legacy transactions. Checks included stakes, locks, reward debt,
counters, reward-recipient balances, token supply, lens views, historical voting
power, AnnualGovernance voting-power reads, owner, and checkpoint migration anchor.
Legacy transaction events matched exactly, including token mint destinations.

Manual single/multi-pool claims, deposits, partial/full withdrawals, and locked
withdrawal rejection passed. The new entry point passed a two-pool claim using
the configured executor address, unauthorized-caller rejection, repeat rejection,
opt-out enforcement, unchanged principal, no executor reward, and full exit after
autoclaiming. All sampled preferences remained disabled after initialization.

The initial differential run exposed wall-clock drift in Hardhat transaction
timestamps during RPC reads. The harness now explicitly fixes and asserts every
legacy transaction timestamp. The corrected run passed; no Solidity change was
made. RPC reads were cached for the repeat at the same pinned fork block.

Live read-only preflight separately confirmed V9.3 baseline bytecode and Timelock
ownership. GitHub AUTOCLAIM_ENABLED remained false. Frontend source inspection
found stable proxy references and no exact-9.3 version gate in the existing UI.

## Scope and remaining activation work

This supplements the prior 141-test isolated release suite and sponsored Base
Sepolia pilot. It is not an independent audit or a proof covering every possible
protocol state. The fork impersonates the Safe/executor to test contract calls;
it does not test production Safe signatures or mainnet paymaster sponsorship.
Representative wallets include the deployed account holding positions in all
11 pools, pool charity wallets, and a fresh test wallet; they are not an enumeration
of every staker. The frontend check was source inspection, not a browser test.

The existing scheduling file is ready to schedule based on this evidence. Before
execution, recheck the operation and live baseline. Keep automation disabled until
the upgrade is confirmed and the controlled mainnet sponsored pilot passes.

Evidence: `2026-09-24-v931-preschedule-fork-review.json`.
Reproducible test: `../obn-project/test/V931ReleaseSafeFork.test.js` with
`FORK_MAINNET=true` and `FORK_BLOCK_NUMBER=51737615` on network `hardhat`.
