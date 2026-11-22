# NFT registration and square-root annual governance

Current release addendum (2026-10-06): use [the remediation release](../../governance-operations/releases/2026-10-06-assembly-remediation/remediation-report.txt) and its `reviewed-manifest.json` for preparation and pre-execution checks. It pins the staking implementation address and runtime hash, adds frontend RPC recovery, and corrects the FAQ. Earlier manifests are historical and must not be used with the updated tooling. The Safe schedules the upgrade; open Timelock execution permits anyone to execute the exact operation after 24 hours. BaseScan verification remains required.

Status: local implementation and validation only, hardened 2026-09-30. No mainnet or testnet contracts have been deployed, no Timelock operation has been scheduled, and no production frontend configuration has been enabled by this work. This is a revision of the undeployed draft, not a migration path for an older deployed vault with existing deposits.

## Agreed behavior

- Preserve the existing OliveNFT collection. Multiple NFTs may be held in a wallet.
- One active registered NFT per wallet in OliveAssembly, the new governance vault.
- Registration transfers custody to the vault. Only the depositor can withdraw; no minimum deposit period, voting-period lock, or withdrawal fee.
- NFT registration and staked OBN are evaluated at the existing annual snapshot (`cycle-start block - 1`). Both phases use that one snapshot.
- Withdrawing after the snapshot preserves this cycle's rights. Transferring the NFT and registering it through another wallet does not reuse eligibility for this cycle.
- Registered NFT count is a boolean gate. At least 1 OBN aggregate checkpointed stake across all pools is required at the snapshot. At or above that minimum, weight is the square root of aggregate stake. Below it, power is zero in both phases; NFT registration is unaffected.
- NFTs remain visible in the depositor's profile with wallet-based staking progression. Mint is hidden for wallet holders and vault registrants.
- No NFT rewards, emissions, minimum qualifying duration, delegation, or claim of unique human identity.
- Both production contracts in this change are UUPS-upgradeable, owned by the same Timelock. This supersedes the earlier proposal for an immutable vault.
- Open, pseudonymous participation is intentional. Square-root weighting plus scarce NFTs imposes an economic barrier to wallet splitting, not proof of unique identity. Votes and wallet addresses remain public.
- No separate readiness activation or registration waiting period. Registration is continuous and persists until withdrawal. The configured voteAdmin Safe starts the voting round directly; the existing keeper executes both phases. There is no Timelock delay for starting voting.
- Every NFT cycle requires a nonzero registered-NFT count at the previous-block snapshot. This does not guarantee positive stake or turnout; zero-participation BURN remains unchanged.

## Contracts

`obn-project/contracts/OliveAssembly.sol` is a new UUPS implementation. OliveAssembly is the renamed governance vault; the rename preserves storage layout and external function names, including governance's `nftVault()` getter. The frontend retains `NEXT_PUBLIC_OLIVE_GOVERNANCE_VAULT` as its address configuration key for compatibility. Deploy its proxy using `initialize(existingOliveNFT, timelockOwner)` atomically with proxy creation. The implementation disables initializers. An initialized proxy stores:

- `oliveNFT`: original collection address.
- `registeredTokenId(account)`: zero if unregistered; otherwise the single registered NFT ID.
- `depositorOf(tokenId)`: withdrawal authority.
- Per-address block-number checkpoints recording zero or one.
- A receiver guard, binding timestamp, one-time governance reference, total-registration checkpoints, and a 42-slot reserved storage gap. OpenZeppelin inherited state is namespaced. The three new slots consume the original gap starting at slot 5.

`deposit(tokenId)` requires ownership, token approval and no existing registration. Only transfers initiated by `deposit` are accepted by the receiver callback. `withdraw()` returns to the depositor; `withdrawTo(recipient)` gives depositing smart wallets a way to select a compatible receiver. Both are guarded against reentry and update checkpoints atomically with custody changes. Failed transfers revert all accounting changes.

The implementation has no privileged withdrawal of registered NFTs or eligibility rewrite function. **Timelock upgrade authority can change logic in a future implementation**; upgradeability remains an explicit trust assumption. Preserve custody records, historical checkpoints, total-registration history and withdrawal rights in every future vault upgrade. After binding, both contracts block upgrades in all four active cycle states. Failed governance reads also block vault upgrades, but never block user withdrawal. Binding is one-time and has no rebinding bypass; future governance compatibility/recovery must be planned carefully.

Unsolicited `safeTransferFrom` and safe mints to the vault revert. A plain ERC721 `transferFrom` cannot be intercepted; NFTs sent that way are not registered. Users must use the registration flow. The app explicitly warns against manual transfers.

`recoverUnregisteredNFT(collection, tokenId, recipient, transferTxHash)` is owner-only and nonreentrant. It requires vault custody, a valid recipient and a nonzero evidence hash; it categorically rejects OliveNFT tokens with a depositor record. Foreign ERC721 collections can also be recovered without confusing identical token IDs with registered OliveNFTs. Recovery does not create registration or checkpoints. Rejected safe receipts revert the recovery.

For recovery, inspect the original collection's canonical Transfer logs and current owner on the correct chain; identify the actual prior owner, not merely the transaction sender (which may be an approved operator). Verify any alternate recipient with that owner, document the evidence, and include the transfer transaction hash and exact recipient in the Timelock proposal for public review. Recheck custody/registration before scheduling and execution. The evidence hash is an audit reference, **not an on-chain proof of ownership**. The Timelock can choose the recipient of an unregistered NFT; this remains a disclosed trust assumption. Never add a recovery path for registered deposits.

`obn-project/contracts/AnnualGovernanceV2.sol` is a separate implementation copied from the current fixed-allocation AnnualGovernance baseline. Existing source remains available for validation and regression tests. It preserves existing Cycle fields and original custom slots 0-7, appends Offering/Extend start balances and a snapshot-presence flag to Cycle, adds vault and first-NFT-cycle fields at slots 8-9, and reduces the gap from 50 to 48 slots. The undeployed draft activation field/function have been removed.

Use `upgradeToAndCall(newImplementation, initializeNFTVoting(vaultProxy))` through the existing owner. Initialization is owner-only, one-time, requires an inactive/completed/cancelled cycle, and requires the vault owner to match the governance owner. New cycles fail closed if initialization was omitted. Check the configured NFT collection against the original address during preparation.

Then call `vault.bindGovernance(governanceProxy)` through the owner as part of one-time upgrade setup; it may be batched after governance initialization. The target must reference this vault, share its owner and be idle. `registrationOpenedAt` records this binding for audit only. It creates no waiting period or separate readiness approval. No NFT cycle can start before binding.

`firstNFTCycleId = currentCycleId + 1` retains linear voting-power views and tallies for historical cycles. New cycles use the vault gate. Tie behavior, double-vote checks, lazy stake bootstrap and permissionless phase execution remain in place. At the operator's explicit request, the monetary cutoff now moves to Phase 1 start as described below.

### Voting units

For raw 18-decimal staked OBN `S`, voting units are:

```text
VP_raw = 0 when S < 10^18
VP_raw = floor(sqrt(S)) * 10^9 when S >= 10^18
VP_display = VP_raw / 10^18
```

This retains 18-decimal formatting, with nine decimals of square-root precision and downward rounding. Taking the square root before scaling avoids multiplication overflow. Examples: 100 OBN -> 10 VP; 10,000 OBN -> 100 VP; 1 OBN -> 1 VP; 0.25 OBN -> 0 VP (below the minimum). Sum across pools before checking the minimum and applying square root. The public `squareRootVotingPower` helper enforces the same minimum used by both on-chain voting and the frontend historical-stake fallback. Historical linear cycles retain their original fractional voting power. VP is not spendable OBN and must not receive a USD valuation.

## Frontend

- `OliveGovernanceRegistration` adds a registration/withdrawal card on Protocol Funds, with individual-token approval followed by deposit, receipt confirmation, wallet/chain checks, and registration versus snapshot-eligibility messages.
- `useRegisteredOlive` reads the connected/displayed wallet's current registered token; failed reads are not treated as permission to mint.
- NFT fetching merges wallet NFTs and the registered NFT, deduplicates IDs, and prioritizes the registered NFT in the profile. Staking clock identity remains the same wallet and existing `owned` key; deposit/withdrawal does not reset progression.
- Cache keys now include chain, collection, vault and wallet. Deposit/withdrawal invalidates caches and contract queries.
- Voting pages label weights as VP and remove USD conversions from voting weights. Monetary fund balances retain OBN/USD displays.
- Historical-stake fallback checks NFT eligibility, sums historical stake and applies the same contract math. RPC failure cannot become a positive eligibility assumption or a partial stake total.
- Registration and both voting routes now use `NEXT_PUBLIC_GOVERNANCE_ENABLED=true` in production (development permits rehearsal). The registration card also checks reciprocal vault/governance binding. Disabling the release switch blocks new app deposits but preserves withdrawals; it does not pause public contract calls.
- The withdrawal form offers an alternate recipient with address validation and explicit confirmation tied to the account, token ID and recipient. Contract authorization remains depositor-only. The normal withdrawal still returns to the depositor.

Registration is absent unless `NEXT_PUBLIC_OLIVE_GOVERNANCE_VAULT` contains a valid nonzero proxy address. No value was added to environment files. After a separately authorized deployment, configure this alongside the matching `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_OLIVE_NFT`, `NEXT_PUBLIC_GOVERNANCE_CONTRACT`, staking address and RPC. The card verifies that governance references that vault and the vault references the configured NFT before allowing new deposits. Withdrawals are not dependent on governance's continued reference to the vault.

## Local validation

The [2026-09-30 deployment readiness review](../../governance-operations/releases/2026-09-29-assembly-reviews/2026-09-30-assembly_deployment_readiness.md) adds a successful pinned Base fork rehearsal and production test build, and records outstanding frontend defects, expanded lint failures and release preparation. The release checkout is `C:\obn-frontend`; it remains unchanged and still needs the reviewed integration before release. Do not deploy or publish the reference/test frontend from this repository.

The isolated config below removes live networks and fork settings. Tests deploy only to Hardhat's in-process local chain.

Validated locally after hardening and the 1 OBN minimum: **120 contract tests and 23 governance frontend tests passed**. TypeScript and targeted ESLint are also checked. No live-chain or browser-wallet transactions were used. Component handler tests mock the wallet and receipt boundary; real browser/wallet rehearsal remains required.

```powershell
# In C:\obn\obn-project
node node_modules/hardhat/internal/cli/cli.js test --config hardhat.nft-voting.config.cjs test/AnnualGovernanceStartSnapshot.test.js test/OliveGovernanceReview.test.js test/OliveGovernanceUpgrade.test.js test/AnnualGovernance.test.js test/AnnualGovernanceAllocation.test.js

# In C:\obn\obn-frontend
node --test scripts/governance-nft.test.cjs scripts/governance-withdrawal.test.cjs
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/components/OliveGovernanceRegistration.tsx src/hooks/useRegisteredOlive.ts src/lib/oliveAssembly.ts src/lib/ownedNfts.ts src/lib/getDisplayedVotingPower.ts
```

Contract coverage includes real staking checkpoints, both real fund contracts, storage-layout validation, historical-cycle preservation, owner-only upgrades and initialization, one-registration enforcement, unauthorized withdrawal attempts, receiver rejection/reentry, multiple-wallet holdings, same-block boundaries, post-snapshot NFT/stake withdrawal and transfer, next-cycle eligibility, fractional/extreme math and full-supply gas measurements.

At 20,000 minted NFTs, measured local receipt gas (two active registrants, one nonprofit ballot):

| Operation | Gas |
| --- | ---: |
| Register NFT through vault proxy | 238,289 |
| Start NFT-governance cycle | 227,878 |
| Cast Phase 1 vote through governance proxy | 120,501 |

No operation scans the NFT collection or registrant list. These are local Cancun EVM measurements, not Base fee quotations; Safe execution and different ballot sizes add costs. Per-wallet eligibility lookup grows logarithmically with that wallet's checkpoint history. Cycle start also reads a total-registration checkpoint trace, whose lookup grows logarithmically with the number of blocks containing registration changes. Neither lookup scans NFT holders.

Frontend tests cover merged wallet/vault display data, cache isolation, bootstrap weighting, eligibility failure, RPC errors, configured/unconfigured registration rendering, withdrawal-preserved eligibility, and late registration.

## Before any separately authorized deployment

1. Review vault custody/upgrade trust and the voting math. Independently review the new contract code.
2. Verify the actual current governance implementation and storage against this baseline; local tests are not a live-state audit.
3. Rehearse proxy initialization, deposits, withdrawals and the full two-phase vote in a test environment, including real wallet approval, chain switching and transaction rejection/replacement behavior. Browser wallet end-to-end testing is still required; frontend checks here are type checks, helper tests and server-rendered component tests.
4. Prepare the vault proxy and governance implementation under the existing Timelock. Preserve the original NFT address. Verify contracts and initialization arguments.
5. Prepare the atomic governance upgrade-and-initialize operation while no cycle is active. Run upgrade-layout validation and a fork rehearsal with those exact artifacts and addresses.
6. Release a production build with the shared governance switch and verified addresses; test registration, both voting routes and alternate-recipient withdrawal. Bind the vault only as part of this coordinated rollout and publicly announce the registration window and snapshot rules.
7. Verify production access, keeper readiness and the published snapshot rules. There is no `activateNFTVoting()` call. The frontend release switch is an interface configuration, not another Timelock transaction.
8. At the scheduled end of the annual accumulation period, the voteAdmin Safe calls `startAnnualCycle(phase1Duration, phase2Duration)` directly to open Phase 1, provided the previous-block registered count is positive. Deposits made only in the cycle-start block cannot satisfy the gate. A positive count is not quorum; zero participation still burns Offering funds.

This document does not authorize deployment. No mainnet deployment or transaction was performed.

## Annual period and voting round terminology

The protocol is already in its first annual accumulation period, per the operator. The on-chain `startAnnualCycle` name is legacy: it opens the end-of-period Phase 1 ballot, not the start of the year. `currentCycleId` counts voting rounds and is not an elapsed-year counter. No new annual start date, automatic yearly timer or live-state change is introduced by this draft. The existing accumulation flow is unchanged. No new accumulation scheduler is added. The explicitly requested monetary cutoff change is described below.

- During the annual period, users register once, change stake freely and can withdraw their NFT anytime. Registration has no expiry and needs no annual renewal.
- At the period end, only the configured voteAdmin Safe can call `startAnnualCycle`, taking the previous-block NFT/stake snapshot and opening Phase 1. The existing direct-Safe start generator remains compatible. Multisig approval is required, but no Timelock scheduling or delay. The Timelock retains owner-only upgrades, recovery and voteAdmin rotation.
- After Phase 1's deadline, the existing keeper (or anyone) calls `executePhase1`/`executeCurrentCycle`. That transaction applies the Phase 1 outcome, fixes the Phase 2 allocation and opens Phase 2 for its full configured duration. No additional Timelock approval is required.
- After Phase 2's deadline, settlement remains permissionless. Completion closes this voting round and the protocol proceeds into the next annual accumulation period operationally. The next ballot opens only when the voteAdmin Safe initiates it.
- The next voting round snapshots stake again. A deposited NFT remains eligible across rounds without re-registration; the same wallet's square-root voting power can change.

There is no registration cutoff other than each voting round's snapshot, no per-voter activation, and no holding-period or withdrawal lock. Historical legacy cycles retain their original phase-execution rules.

Phase execution remains permissionless, driven by the existing keeper after one direct voteAdmin Safe start. `executePhase1` now spends only the start-of-Phase-1 Offering allocation and finalizes Extend allocation arithmetically. `executePhase2` and `executeCurrentCycle` retain their execution flow.

## Monetary cutoff: start of Phase 1

`startAnnualCycle` atomically records TheOffering and ExtendOliveBranch OBN balances in appended per-cycle fields, sets `fundsFixedAtStart`, and emits `CycleFundsSnapshotted`. `getCycleFundSnapshot(cycleId)` exposes those amounts and the flag. Zero is a legitimate snapshot; historical cycles return `isFixed=false`, never an inferred historical allocation. Existing completed cycle fields and events retain their original meaning. Upgrade during an active voting round remains prohibited.

- BURN spends only the Offering snapshot; the final Phase 2 allocation is the Extend start balance.
- GIVE transfers only the Offering snapshot; the final Phase 2 allocation is the Extend start balance plus that transfer. The internal GIVE belongs to the current cycle even though the transfer executes later.
- All other receipts after the start transaction contribute to future cycles, including receipts during Phase 1 and delayed keeper execution. Funds continue arriving in the same contracts. Unclaimed rewards are not retroactively included: the cutoff uses received OBN balances.
- `getPhase2Allocation` remains unfinalized until Phase 1 executes, because GIVE/BURN is undecided. It then exposes the final amount, with no live-balance fallback. The voting UI shows the starting allocation and possible GIVE total before finalization, and the final allocation afterward, separately from live balances.
- A zero Offering snapshot burns/transfers zero even if later receipts arrive. A zero final Phase 2 allocation pays zero.
- Cancellation before Phase 1 execution moves no funds. A replacement round takes a fresh snapshot. Zero Phase 2 turnout rolls funds over as before.
- Both allocations are accounting reservations, not separate token custody. An admin sweep can create a shortfall; execution reverts atomically until the original fixed amount is available. Replenishment can restore solvency, but cannot change the recorded allocation.

The fund cutoff is transaction ordering at Phase 1 start: receipts earlier in the same block are included; receipts after that transaction are excluded. This differs from the voter NFT/stake snapshot, which remains at the preceding block.

Regression coverage includes BURN/GIVE, receipts in both voting phases, delayed execution, zero snapshots, failed execution/replenishment, cancellation, rollover, next-cycle use of residual balances, and same-block receipt ordering.
