# NFT governance upgrade review — 2026-09-29

The intermediate change requiring Timelock to open Phase 2 was incorrect and has been removed. Permissionless phase progression was restored. Subsequently, the operator explicitly requested moving both monetary snapshots to Phase 1 start; this new allocation behavior supersedes the original cutoff. See the current upgrade runbook.

## Follow-up — 2026-09-30

The sections below preserve the original review. Current disposition after the user's design decision and requested fixes:

| Finding | Current status |
| --- | --- |
| R1: stake splitting | Accepted economic design tradeoff. Preserve square-root weighting, limited NFT supply and pseudonymous participation. UI now qualifies the extra-NFT statement as applying within the same wallet. No unique-person or secret-ballot claim. |
| R2: stranded manual transfers | Implemented owner-only, nonreentrant recovery for unregistered NFTs, custody/recipient/evidence checks, events and an app warning. Registered OliveNFT deposits are excluded. Recipient verification remains a disclosed Timelock responsibility. |
| R3: active-cycle vault upgrades | Implemented one-time reciprocal binding and fail-closed active-cycle checks. Tested all four active states, completed/cancelled states and unavailable governance. User withdrawals do not depend on governance availability. |
| R4: alternate withdrawal recipient | Added ABI support, validated optional recipient input and explicit account/token/recipient confirmation. Tested actual component handlers against mocked wallet/RPC boundaries and contract receiver rejection separately. |
| R5: rollout | One shared frontend release switch controls registration and voting access; withdrawals stay available. No additional readiness activation or waiting period remains. One direct voteAdmin Safe start is followed by permissionless keeper execution of both phases, without a Timelock start delay. Every cycle requires a nonzero registration count at its snapshot. Operator still verifies public announcement/frontend availability; zero-vote BURN remains unchanged. |
| R6: chain defaults | Aligned the new vault module's omitted-chain fallback with the existing wallet configuration (84532). Explicit production chain configuration remains required operationally. |
| R7: cosmetic effect-clock inconsistency | Remains open; not part of the four requested fixes. |

Validation: 108 contract tests and 19 governance frontend tests passed. The review reproductions for R2/R3/R5 now assert the corrected behavior; R1 and direct mint remain intentional behavior. No deployment or production configuration activation occurred. See `nft_governance_upgrade_runbook.md` for current rollout and recovery procedures. This draft assumes a newly deployed vault; it is not a counter-history migration for a previously deployed prototype vault.

## Original review

Review of the local, uncommitted OliveAssembly, AnnualGovernanceV2 and frontend integration. No deployment, live transaction, or production configuration change was made. Production code was not changed during this review. Findings remain open.

The review found an economic weakness, custody/upgrade risks, and frontend release gaps. No permissionless theft of a properly registered NFT, single-NFT reuse at one snapshot, or storage-layout corruption was reproduced. This is a local source review with targeted tests, not an independent audit or verification of the currently deployed implementation.

## R1 — High economic risk: splitting stake across wallets increases voting power

Sources: `obn-project/contracts/AnnualGovernanceV2.sol:188`, `obn-project/contracts/OliveAssembly.sol:55`.

The vault enforces one active NFT per address. Governance applies square root separately to each address's stake. One controller can register distinct NFTs through multiple wallets and distribute their stake across them.

Confirmed in a local reproduction: 400 OBN in one wallet corresponds to 20 VP; four registered wallets staking 100 OBN each cast a combined 40 VP. In general, splitting equally across N qualifying wallets multiplies aggregate influence by approximately sqrt(N), subject to rounding. Acquiring enough NFTs and funding each wallet are prerequisites. Reusing one NFT across these wallets at the same snapshot does not work.

This is an address-based voting design limitation. Multiple NFTs held in one wallet still do not add weight, as requested. However, the app's unqualified statement that more NFTs do not add voting power overstates the protection across wallets.

Recommendation: explicitly decide whether to accept this economic property before release. Linear stake weighting with an NFT gate removes the square-root incentive to split, but changes the chosen weighting policy. Retaining square-root weighting with resistance to wallet splitting requires an additional identity or aggregation mechanism; another per-wallet cap cannot establish that different wallets have one controller. Clarify the UI wording regardless. Do not silently change the weighting policy as part of a routine fix.

## R2 — Medium custody risk: plain NFT transfers strand assets

Sources: `obn-project/contracts/OliveAssembly.sol:55`, `:67`, `:83`.

An owner can call OliveNFT.transferFrom(owner, vault, tokenId). ERC721 does not call the receiver hook for this operation, so ownership moves to the vault without creating registeredTokenId or depositorOf records. The former owner then cannot register or withdraw that token. Reproduced with the real OliveNFT contract.

There is no recovery path in this implementation. A future owner-authorized vault upgrade could add recovery; therefore this is not necessarily permanent loss, but it requires privileged intervention. The runbook already disclosed this risk. The public registration card does not explicitly warn against manual transfers.

Recommendation: explain that registration must use the app's deposit function, and decide on an auditable recovery policy before launch. A sweep function must exclude registered tokens and must not let an arbitrary caller claim a stranded NFT by merely naming its token ID. Proving the prior owner requires special care because the present vault did not record the transfer.

## R3 — Medium privileged integrity risk: vault upgrades bypass the active-cycle freeze

Sources: `obn-project/contracts/OliveAssembly.sol:53`, `obn-project/contracts/AnnualGovernanceV2.sol:182`, `:273`.

Governance blocks upgrades during an active cycle, but the vault's upgrade authorization checks only ownership. Confirmed: while Phase 1 was open, upgrading governance reverted and upgrading the vault succeeded.

Governance reads historical registration by calling the vault when each vote is cast. A faulty or deliberately changed vault implementation can therefore change how the same historical block is interpreted, reject otherwise eligible voters, or affect withdrawals during an active vote. Already accumulated vote tallies would not automatically be recomputed. Only the vault owner can perform the upgrade; this is a Timelock trust and operational risk, not a permissionless bypass.

Recommendation: bind the vault to the intended governance instance and enforce an appropriate active-cycle upgrade restriction, with tests for all active states and a considered recovery procedure. Preserve withdrawal availability and historical checkpoint semantics across every upgrade. Upgradeability continues to imply owner trust even with this restriction. The current runbook relies on operational discipline here.

## R4 — Medium frontend gap: the app omits the alternate withdrawal receiver

Sources: `obn-frontend/src/components/OliveGovernanceRegistration.tsx:105`, `obn-frontend/src/lib/oliveAssembly.ts:9`, `obn-project/contracts/OliveAssembly.sol:81`.

The contract supports withdrawTo(recipient), but the frontend ABI and button expose only withdraw(). A smart wallet that owns an NFT through an unsafe inbound transfer can deposit it even if its ERC721 receiver rejects safe inbound transfers. Its withdrawal back to itself then reverts. Receiver behavior may also change after deposit.

The existing contract regression test confirms that receiver rejection leaves custody/accounting intact and withdrawTo succeeds with a compatible recipient. Such users currently need a separate contract interaction tool to recover their NFT; the advertised app withdrawal flow cannot do it.

Recommendation: add an optional alternate recipient flow with clear recipient confirmation, address validation, and receipt/error handling. Add an interactive test for a rejecting receiver. Preserve depositor-only authorization.

## R5 — Medium rollout risk: registration can open while production voting remains disabled

Sources: `obn-frontend/src/app/protocol-funds/page.tsx:300`, `:392`, `obn-frontend/src/app/governance/offering/page.tsx:215`, `obn-frontend/src/app/governance/extend/page.tsx:174`, `obn-project/contracts/AnnualGovernanceV2.sol:291`, `:423`.

The new registration card is enabled by vault configuration. The existing voting links remain development-only, and both voting routes redirect away in a production build. Setting the new environment variables alone can therefore allow public deposits without an app path to vote. These development restrictions predate this upgrade and are noted in the runbook, but they remain a release blocker for the combined feature.

Separately, cycle start has no registration-readiness guard. Confirmed locally: the admin can start a cycle with no registrants; nobody meets the NFT gate, and permissionless Phase 1 execution after the deadline burns the Offering balance with zero votes. Zero-vote BURN is existing intended governance behavior. Introducing a new registration prerequisite makes readiness particularly important. A cycle started in the same block as the first deposits also excludes those deposits by design.

Recommendation: coordinate registration, production voting availability, and an announced registration period before starting the first cycle. Test the production build, not just development rendering. Consider an explicit owner-controlled activation/readiness mechanism if on-chain rollout enforcement is desired; a nonzero registrant count alone does not establish meaningful participation. Changing the zero-vote policy requires a separate governance-design decision.

## R6 — Low configuration defect: the new module uses a different chain default

Sources: `obn-frontend/src/lib/oliveAssembly.ts:7`, `obn-frontend/src/wagmiConfig.ts:21`.

When NEXT_PUBLIC_CHAIN_ID is absent, the new vault module selects Base (8453), while the actual wallet configuration selects Base Sepolia (84532). With a configured vault but omitted chain variable, reads and requested chain switches target a chain not in the wallet configuration. The registration flow can become unavailable or return silently when no public client is available. Explicitly configuring the chain avoids this case.

Recommendation: derive chain selection from one shared validated configuration and use the same default. Add a configuration test covering an omitted chain variable and the two supported chains.

## R7 — Low display inconsistency: registration preview and profile use different effect clocks

Sources: `obn-frontend/src/components/OliveGovernanceRegistration.tsx:33`, `:126`, `obn-frontend/src/app/profile/page.tsx:544`.

The registration card computes effects directly from useOnChainStakeElapsed. The profile uses useStakingClock, which merges locally accumulated time with on-chain time and ticks forward. When the local clock is ahead, or an effect threshold passes after the on-chain read, the two views can show different effects for the same registered NFT. This does not alter governance rights or reset the underlying staking data.

Recommendation: share the effect/progression calculation between both views and test it at the 30/60/90-day boundaries.

## Confirmed safeguards and intentional behavior

- Only the NFT owner can register it; NFT approvals do not let another address claim registration.
- One active registration per address is enforced on-chain. Additional NFTs in that wallet do not increase its weight.
- Safe unsolicited transfers are rejected. Failed deposits/withdrawals roll back registration and checkpoint changes.
- Reentrant withdrawal attempts fail. Rejected smart-wallet receipts retain the registration and allow alternate-recipient recovery at contract level.
- Both vote phases use the same previous-block snapshot. Post-snapshot NFT transfer and registration by a new owner do not duplicate eligibility for that cycle.
- Post-snapshot stake/NFT withdrawals preserve voting rights. This intentionally permits short-term holdings around the snapshot; there is no minimum qualifying duration or voting-period custody requirement.
- Direct minting while the NFT is deposited remains possible because OliveNFT's mint check sees wallet balance, not vault registration. Confirmed that the depositor can mint and then withdraw successfully, ending with multiple wallet NFTs. This is compatible with the agreed multiple-holdings policy. Hiding mint in the app is a UI convention, not contract enforcement.
- Local OpenZeppelin upgrade-layout validation passes against the repository's AnnualGovernance baseline; historical cycle data and linear voting-power views remain intact in tests.

## Validation and boundaries

Added `obn-project/test/OliveGovernanceReview.test.js` with five executable reproductions: stake splitting, active-cycle vault upgrade, unsafe direct transfer, zero-registration burn, and direct mint followed by successful withdrawal. These tests intentionally assert present behavior, including unresolved risks. A passing reproduction does not mean the risk has been fixed.

Ran locally with the isolated configuration that excludes live networks and forks:

```powershell
# C:\obn\obn-project
node node_modules/hardhat/internal/cli/cli.js test --config hardhat.nft-voting.config.cjs test/OliveGovernanceReview.test.js test/OliveGovernanceUpgrade.test.js test/AnnualGovernance.test.js test/AnnualGovernanceAllocation.test.js
# Result: 100 passing, 0 failing.

# C:\obn\obn-frontend
node --test scripts/governance-nft.test.cjs
# Result: 13 passing, 0 failing.
```

The full-supply regression still measured 204,854 gas for registration, 164,570 for cycle start, and 120,543 for voting with its one-nonprofit fixture. Collection size does not create a collection scan; these numbers do not model all ballot sizes or wallet histories.

The contract fixtures use the local V9.3 staking implementation and local fund contracts. The V9.3.1 source was inspected for checkpoint continuity, but the exact deployed bytecode, production storage, current Timelock configuration, live RPC behavior, and browser wallet flows were not verified. Frontend checks are helper and static-render tests, not transaction end-to-end tests. Exact-artifact fork rehearsal and production-browser testing remain necessary before release.
