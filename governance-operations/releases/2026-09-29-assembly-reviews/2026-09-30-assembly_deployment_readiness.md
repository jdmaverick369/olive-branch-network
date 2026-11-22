# AnnualGovernanceV2 / OliveAssembly deployment readiness

Review date: 2026-09-30. Outcome: contract candidate passed local regression and a pinned Base fork rehearsal; the complete release is not yet ready. No mainnet/testnet transaction, deployment, scheduling, push, or release-checkout update was performed. Local Hardhat tests instantiate contracts on an in-process chain only.

The production frontend checkout is **C:\obn-frontend**, confirmed by the operator. It was inspected read-only and deliberately left unchanged. Frontend testing below concerns **C:\obn\obn-frontend**, the integration/test copy. Production Solidity and application source were not modified by this review; additions are review tooling, a fork test, and documentation.

## Findings to resolve before frontend release

### Medium: Phase 2 can remember a different nonprofit from the submitted vote

`obn-frontend/src/app/governance/extend/page.tsx:353` stores the current `selected`, `address`, and cycle when a pending transaction confirms. Ballot selection remains enabled while the transaction is pending (`:722`). Submit for nonprofit A, choose B before confirmation, and the confirmation effect stores B as the vote. The event recovery at `:311` skips recovery when a stored choice exists, so this incorrect display can persist. Switching accounts while waiting also leaves confirmation tied to the current account rather than the submitted transaction's account.

Reproduced by executing the actual source confirmation callback with a submitted address ending in repeated `1` digits and pending selection ending in repeated `2` digits: the callback recorded the second address. This was a callback-level reproduction, not a browser-wallet test. The on-chain vote still goes to the submitted nonprofit; no vote tally or funds are changed by this display error. This behavior predates the NFT changes but affects the release under review.

Recommended fix: retain immutable submitted account, cycle, chain and nonprofit alongside the transaction hash; reconcile success with the receipt event. Disable changing selection during submission/confirmation, and handle receipt errors and account changes explicitly. Add a regression covering selection/account changes during confirmation.

### Low: Phase 2 total voting power is still labeled as money

`obn-frontend/src/app/governance/extend/page.tsx:664` renders `totalVotes` as `OBN` and feeds it into `ObnUsd`. NFT cycles use square-root VP; this total is not an OBN balance or dollar amount. Individual rows already use VP. Remove the USD conversion and use the correct vote unit for the total.

### Quality gate: voting pages do not pass ESLint

Expanded lint scope reports two errors and 22 warnings across the two voting pages. Errors are `react-hooks/set-state-in-effect` at `offering/page.tsx:72` and `extend/page.tsx:77` (countdown effects). Warnings include effect dependencies. These countdown patterns predate this upgrade. The previously reported targeted lint pass omitted these pages; it should not be described as a clean lint result for the whole governance frontend. Next's production build passes despite these lint errors.

## Remaining release preparation

- **Frontend integration deferred intentionally.** C:\obn-frontend is at local commit `12eaa21` (2026-09-29). It lacks the new registration component, Assembly integration and shared governance release switch; its voting pages still redirect away outside development. Do not publish the C:\obn test copy as a substitute. Integrate reviewed changes into the release checkout later, preserving its newer unrelated work, then repeat build and wallet checks there. Its only reported untracked file, `squarespace-homepage.html`, was present before and after inspection and was not modified.
- **Prepare the actual V2 release tooling/payload.** Existing `obn-project/scripts/governance/prepare_annual_allocation_upgrade.js:25` targets `AnnualGovernance`, and `:37` encodes an upgrade with empty initialization data. Its baseline checker expects frozen V1, which is not the current live implementation. It is for the earlier fixed-allocation upgrade and must not be repurposed unchanged. The correct new path creates an atomically initialized OliveAssembly proxy, then upgrades the existing governance proxy with `initializeNFTVoting(assemblyProxy)` and binds Assembly to governance. The fork test successfully exercised the latter two calls in one Timelock batch. Concrete production implementation/proxy addresses, bytecode checks, initialization arguments, operation salt and Safe schedule/execute payloads still need preparation and review when deployment is authorized. The existing direct Safe `startAnnualCycle` generator remains compatible.
- **Real-wallet rehearsal remains open.** Test approvals/deposits, persistent profile display/effects, both votes, account/chain switching during pending operations, rejected/reverted/replaced transactions, smart-wallet receipts and alternate-recipient withdrawals. Current frontend tests use mocked wallet/receipt boundaries; the fork test impersonates the Safe and does not exercise real Safe signatures or browser wallets.
- **Release configuration and operations remain open.** Verify real frontend chain/RPC/contracts, Assembly address and shared release flag; verify keeper funding and scheduled workflow operation. The keeper source remains compatible with `executeCurrentCycle`, but no live workflow was triggered and its credentials/funding were not tested. Recheck current chain state and candidate artifacts immediately before the eventual authorized operation.

## Live state verified read-only

Pinned Base chain ID **8453**, block **52,015,686**:

| Item | Observed value |
| --- | --- |
| Existing governance proxy | `0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270` |
| Existing implementation | `0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3` |
| Owner / Timelock | `0x86396526286769ace21982E798Df5eef2389f51c` |
| voteAdmin / Safe | `0x066e2FABb036deab7DC58bAde428F819AC3542DD` |
| Voting round / state | `0 / INACTIVE` |
| Timelock minimum delay | 86,400 seconds |
| Safe threshold | 2 signatures |
| Staking migration block | 47,348,216 |
| Pool count / maximum ballot size | 11 / 100 |
| Original NFT | `0xB66F67444b09f509D72d832567C2df84Edeb80F8` |

TheOffering and ExtendOliveBranch both reference the existing governance proxy. Governance's OBN, staking and fund addresses match the local canonical addresses. Runtime comparison matches local `AnnualGovernance` after accounting for UUPS's implementation-address immutable and Solidity metadata; it does not match the older frozen `AnnualGovernanceV1`. The fork test independently checks executable bytecode with the actual UUPS immutable value and runs OpenZeppelin upgrade-layout validation from this baseline to AnnualGovernanceV2.

Round ID zero is consistent with the operator's first annual accumulation period: `startAnnualCycle` opens the end-of-period ballot, not the start of the accumulation year. The observed idle state is eligible for an upgrade; it is not a promise that the state will remain idle until deployment.

## Validation completed

| Check | Result |
| --- | --- |
| Five governance contract suites | **120 passing** |
| New pinned Base fork rehearsal | **1 passing** |
| Frontend governance / withdrawal tests | **23 passing** |
| Frontend API / swap / analytics tests | **14 passing** |
| TypeScript | Passed |
| Frontend ABI against compiled contracts | All 20 governance and 7 Assembly entries matched |
| Production build of integration copy | Passed with temporary public test configuration |
| Expanded governance frontend lint | **2 errors, 22 warnings**, as above |

The build initially failed because the sandbox could not fetch Google Fonts, then because this test copy lacked an RPC URL. With network access and public Base configuration supplied only to the build process, compilation, TypeScript and all 24 static pages completed successfully. A dummy WalletConnect project ID produced an expected remote-configuration 403 fallback warning. No private release environment was copied, no environment file was written, and this build does not verify production credentials or WalletConnect connectivity.

The new fork rehearsal used public RPC reads and local chain ID **31337**. It checked the actual current governance baseline, instantiated the candidate implementation and Assembly on the fork, used the real Timelock contract with an impersonated Safe, verified that early execution reverts, advanced local time through the delay, and executed the atomic upgrade/binding batch. It then used the actual NFT, staking, OBN and fund contracts to register an NFT, stake exactly 1 OBN, start directly as voteAdmin, withdraw NFT and stake after the snapshot, cast both votes, execute GIVE, and verify the nonprofit receives the fixed allocation. No writes were sent to the remote RPC. Local funding borrowed 1 OBN from the impersonated staking proxy and immediately redeposited it; owner minting supplied the test NFT. These are test setup conveniences, not proposed live operations.

Regression coverage also includes unauthorized withdrawal/recovery/upgrades, implementation initializer locking, same-block checkpoints, one registration per wallet, post-snapshot NFT transfer without duplicate voting eligibility, historical linear votes, the 1 OBN aggregate threshold, zero allocations, later receipts, cancellation, shortfall/replenishment and upgrade blocking during all active states.

Runtime bytecode sizes are **13,659 bytes** for AnnualGovernanceV2 and **7,863 bytes** for OliveAssembly, below the 24,576-byte runtime limit. Local full-supply test receipt gas remains registration **238,289**, cycle start **227,878**, vote **120,501**. The collection has 20,000 minted tokens in that gas test, with two registrants and one nonprofit; this is not a benchmark of 20,000 simultaneously active registrants or a worst-case ballot. Code inspection confirms no holder/registrant enumeration during voting. Cycle start still loops over pools and deduplicates the ballot, so pool count remains an independent scaling factor.

## Accepted behaviors and trust assumptions checked

- One registered NFT per address, persistent registration, and at least 1 OBN aggregate stake at the previous-block snapshot. Both phases use the same snapshot and square-root power. Withdrawal after the snapshot preserves that round's rights.
- Multiple pseudonymous addresses can increase aggregate square-root weight if each has an NFT and sufficient stake. This is the accepted economic barrier, not a unique-person guarantee; votes and addresses remain public.
- A positive registered count permits cycle start but does not prove anyone has 1 OBN staked or will vote. Zero Phase 1 participation still burns only the Offering allocation fixed at start; zero Phase 2 participation rolls funds over.
- Admin recovery of an unregistered manual transfer remains owner-controlled and outside the app. Its transfer hash is an audit reference, not cryptographic proof of the rightful recipient. Registered deposits cannot use this recovery path.
- Timelock upgrades remain a trust assumption; both contracts block upgrades during active voting. Fund balances are accounting reservations, so an owner sweep can create a shortfall and require replenishment before settlement.

No new critical/high-severity contract vulnerability was identified in this review. This is a bounded engineering review and test result, not a guarantee of absence of vulnerabilities or an independent security audit.

## Reproduction

From `C:\obn\obn-project`:

```powershell
node scripts/governance/check_assembly_readiness.cjs
node node_modules/hardhat/internal/cli/cli.js test --config hardhat.nft-voting.config.cjs test/AnnualGovernanceStartSnapshot.test.js test/OliveGovernanceReview.test.js test/OliveGovernanceUpgrade.test.js test/AnnualGovernance.test.js test/AnnualGovernanceAllocation.test.js
node node_modules/hardhat/internal/cli/cli.js test --config hardhat.assembly-fork.config.cjs test/AssemblyDeploymentRehearsal.test.js
```

> Note (2026-10-14): `hardhat.assembly-fork.config.cjs` was superseded by `hardhat.assembly-release-20261005.config.cjs` and moved to `governance-operations/releases/2026-10-14-superseded-release-tooling/obn-project/`.

The first command permits only read RPC methods and uses no wallet/secret configuration. The last command is an in-process fork at block 52,015,686, with no live network definitions. The fork test is skipped under the ordinary non-fork config.

From `C:\obn\obn-frontend`:

```powershell
node --test scripts/governance-nft.test.cjs scripts/governance-withdrawal.test.cjs scripts/api-security.test.cjs scripts/swap.test.mjs scripts/analytics/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/components/OliveGovernanceRegistration.tsx src/components/CycleFundAllocation.tsx src/hooks/useRegisteredOlive.ts src/lib/oliveAssembly.ts src/lib/ownedNfts.ts src/lib/getDisplayedVotingPower.ts src/app/governance/offering/page.tsx src/app/governance/extend/page.tsx
# Build requires valid public configuration; see the build qualifications above.
node node_modules/next/dist/bin/next build
```
