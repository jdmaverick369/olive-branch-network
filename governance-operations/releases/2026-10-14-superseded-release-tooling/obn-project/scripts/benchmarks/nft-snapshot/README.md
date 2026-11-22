# Direct OliveNFT eligibility snapshot gas benchmark

Direct on-chain snapshots are affordable at the observed supply of 13 NFTs, but the tested address-mapping implementations cannot handle the 20,000-token maximum in one Base transaction. This is a feasibility experiment, not an AnnualGovernance upgrade.

## Live collection observation

- Network: Base mainnet, chain ID 8453.
- NFT: `0xB66F67444b09f509D72d832567C2df84Edeb80F8`.
- Observation: September 28, 2026, America/Chicago (`2026-09-29T00:27:46.315Z`).
- Block: **51,926,159**, hash `0xcdbd04858a9e1fd9d0eeecbd7d54bdb8a9c65a1c6fba17699910f642babc87ee`.
- Supply: **13 NFTs / 13 distinct holders**; contract maximum **20,000**.
- Observed block gas limit: **400,000,000**. This is not the per-transaction limit.
- Local OliveNFT deployed bytecode hash exactly matches the live deployed bytecode: `0xcabdc9aa078301feb3a3e471c4856e2162dc0c7ad176f119db189ca9319cb3a4`.

All ownership reads were pinned to the same block. `live-snapshot.json` records the public addresses and token IDs.

## What was measured

`SnapshotBench.snapshot()` reads every token owner and stores `eligible[cycle][holder] = true`, deduplicating owners. Both versions increment a cycle counter and emit one snapshot event:

1. Enumerable: `tokenByIndex(i)` followed by `ownerOf(tokenId)`.
2. Sequential: `ownerOf(i + 1)`, exploiting this specific NFT's contiguous IDs starting at 1 and lack of an exposed burn function. This assumption must be retained and reviewed if used in production.

Fixtures are minted through the actual OliveNFT artifact's `ownerMint`, not through a mocked ownership function or fabricated NFT storage. Current ownership distribution is reproduced locally; maximum-supply fixtures cover one owner per token and all tokens owned by one address. Measurements are transaction-receipt `gasUsed`, not linear extrapolations. The two traversal versions start from identical benchmark storage using local snapshot/revert.

| NFTs | Distinct holders | Enumerable gas | Sequential gas |
| ---: | ---: | ---: | ---: |
| 13 (observed supply) | 13 | 431,548 | 388,738 |
| 100 | 100 | 2,961,628 | 2,632,355 |
| 500 | 500 | 14,674,325 | 13,026,835 |
| 1,000 | 1,000 | 29,318,712 | 26,020,813 |
| 5,000 | 5,000 | 146,614,431 | 130,007,797 |
| 10,000 | 10,000 | 293,585,641 | 260,079,419 |
| 20,000 | 20,000 | 588,699,938 | 520,515,629 |
| 20,000 | 1 | 141,722,288 | 73,537,979 |

Base's [Azul execution specification](https://docs.base.org/upgrades/azul/exec-engine) sets the ordinary transaction gas limit cap to **16,777,216**. The [upgrade overview](https://docs.base.org/upgrades/azul/overview) records mainnet activation on May 28, 2026. Paying a higher gas price cannot bypass this cap.

At 20,000 distinct holders the cheaper implementation needs about **31 times** that cap. Even the single-holder case exceeds it, because scanning 20,000 separate ownership entries is itself expensive. The 20,000-distinct-holder case also exceeds the observed entire block limit.

## Validation and limits

- A local execution with a 16,777,216 gas allowance succeeds for 13 and 500 distinct holders and runs out of gas for 1,000, for both traversal versions.
- Snapshot counts match fixtures; all current holders are eligible and a nonholder is excluded.
- Minting or transferring after a snapshot does not alter that snapshot's stored eligibility; a later snapshot recognizes a transfer recipient.
- The local chain deliberately permits 1 billion gas per block, allowing otherwise invalid oversized transactions to finish so their costs can be measured. These successful benchmark receipts do **not** mean Base would accept those transactions.
- Local execution uses Hardhat 2.26.1, Cancun rules, and a Solidity 0.8.26 benchmark harness with optimizer 500/viaIR. The NFT uses the existing compiled artifact whose runtime is byte-for-byte identical to mainnet. These are local EVM measurements, not live Base executions or complete Base fee quotations.
- Measurements include the snapshot transaction itself but exclude AnnualGovernance ballot creation, proxy/Safe execution overhead, and L1 data fees. A production integration needs additional headroom and its own gas test. The 13-holder result establishes feasibility of the snapshot component only.
- The first measured cycle includes the initial cycle-counter storage write; later cycles update a nonzero counter.
- This freezes current ownership during the start transaction, not historical NFT ownership at `block.number - 1`. The existing stake/NFT timing distinction remains unresolved by this experiment.
- No production contracts or live-chain state were changed. The benchmark has intentionally unrestricted methods and must not be deployed as governance code.

## Reproduce

From `C:\obn\obn-project`, with existing dependencies and the compiled OliveNFT artifact:

```powershell
# Optional refresh: read-only Base RPC, using BASE_MAINNET_URL from .env.
node scripts/benchmarks/nft-snapshot/read-live.cjs

# Local-only benchmark; isolated config has no live networks or private keys.
node node_modules/hardhat/internal/cli/cli.js run --no-compile --config scripts/benchmarks/nft-snapshot/hardhat.config.cjs scripts/benchmarks/nft-snapshot/benchmark.cjs
```

`results.json` contains all 26 measured scenarios, gas-cap execution checks, and behavioral assertions. Refreshing the live observation changes the current-supply row; the table above records this run.
