# AnnualGovernanceV2 and OliveAssembly security review

This review covers the current governance upgrade, its NFT custody contract, supporting staking and fund behavior, the synchronized test frontend, and upgrade operations. **Do not approve the full release yet.** Contract invariants held in the tests performed, but the frontend dependency graph includes critical advisories and additional interface failures were reproduced. No review can establish that software has no vulnerabilities.

The production frontend remains `C:\obn-frontend`, at local commit `12eaa21`. The integration copy is `C:\obn\obn-frontend`; the latest tracked source updates are synchronized there with the pending governance work preserved. Both copies have identical package locks. This review did not change production contracts or application source, install or upgrade dependencies, update the release checkout, deploy, schedule, push, or submit a transaction on a live network. Added files are audit reports, evidence and isolated tests.

This report supersedes the open-findings status in `assembly_deployment_readiness_2026-09-30.md`. The earlier wrong cached nonprofit choice, VP/USD total and voting-page lint findings were fixed before this review and their regression tests pass. The findings below are distinct.

## Critical dependency advisories require remediation

`obn-frontend/package-lock.json:13886` locks **Next.js 16.1.6** and `:15739` locks **sharp 0.34.5**. The live checkout has the same versions. The maintainer's [AVIF optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) lists affected Next.js 16.x releases below 16.3.3 and identifies remote code execution through the image-processing dependency. The [Windows hosting advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) identifies a separate critical issue and also lists 16.3.3 as patched.

The application uses Next Image optimization, permits IPFS image gateways, and configures AVIF in `next.config.ts:64`. The image advisory is therefore relevant to this application's configuration. Windows-specific applicability depends on where the server actually runs; a Windows development checkout does not prove production is Windows-hosted. Managed hosting may use a separately maintained optimizer. **No exploit was attempted against the application, and the deployed hosting runtime or provider mitigations were not verified.** The finding is a confirmed vulnerable dependency range and release blocker, not a demonstrated compromise of the live site.

The production-dependency audit (`npm audit --omit=dev --json`) reported **44 vulnerable dependency entries: 1 critical, 9 high, 34 moderate**. These include transitive dependencies and propagated severity; they are not 44 distinct proven application exploits. The complete machine-readable result is `assembly_dependency_audit_2026-09-30.json`. Other flagged paths include axios, sharp, ws and wallet SDK dependencies. Their reachability needs triage; blindly accepting major-version replacements or suggested downgrades is inappropriate.

Priority: update Next.js and the relevant image-processing dependency to supported patched versions, assess the other advisories against the actual runtime, and repeat package, application and wallet regression checks. Testing the existing version successfully does not resolve a published vulnerability. Coordinate remediation in the authoritative live checkout through the normal release process; this review has not changed it.

## Medium frontend correctness findings

### A cancelled registration or withdrawal can report success

`src/components/OliveGovernanceRegistration.tsx:119` and `:124` check only the receipt status. The installed viem `waitForTransactionReceipt` follows transactions replacing the original nonce, including a successful cancellation. A replacement receipt without an Assembly event can therefore produce a successful registration/withdrawal message even though custody never changed. The withdrawal case was reproduced through the actual component handler with a successful replacement receipt containing no logs. The same status-only condition exists for deposit.

Impact: the NFT remains in its prior location, while the user is told the operation completed. Subsequent refreshed registration reads may correct the button, but the success claim is false. This does not bypass depositor authorization or transfer the NFT to an attacker.

Remediation: validate `Registered`/`Withdrawn` events against the submitted Assembly address, depositor, token and withdrawal recipient; distinguish cancelled/replaced transactions explicitly. Apply the same submitted-context discipline already used by vote receipt validation.

### Failed tally reads can invent the completed Phase 2 outcome

`src/app/governance/extend/page.tsx:227` converts unavailable nonprofit vote results to zero. The completed result at `:547` then derives a winner or rollover from the incomplete array. Two reproductions confirm that all reads failing produce a false no-votes rollover, and one read failing can select another nonprofit as the winner.

Impact: the on-chain settlement remains correct, but the application can misrepresent the community decision and recipient. A transient RPC failure is sufficient; no hostile contract is needed.

Remediation: distinguish unknown counts from real zero counts. For the completed outcome, use the confirmed `Phase2Executed` or `Phase2RolledOver` event and show an unavailable state if it cannot be established. Do not declare a winner from partial tally data.

### Voting ignores the MiniApp selected wallet

`src/app/governance/offering/page.tsx:186` and `extend/page.tsx:143` use wagmi's connected account without respecting `MiniAppWalletProvider.viewAddress` or `viewOnly`. The registration card correctly enforces this at `OliveGovernanceRegistration.tsx:89`.

Reproduction: verified wallet B is selected for viewing while A remains connected; the vote button remains usable and submits A's vote. A still must sign, so this is not an authentication bypass. It can nevertheless consume the wrong wallet's irreversible vote and makes registration/profile behavior inconsistent with voting.

Remediation: apply the selected-wallet identity and signing guard consistently, show which account will vote, and require connecting that account before submission. Include Farcaster wallet selection and switching in the real-wallet rehearsal.

## Lower severity and operational findings

### Voting power errors claim there is no active cycle

`useDisplayedVotingPower.ts:57` can return `votingPower=null, isError=true`. Both pages ignore the error flag and show “No active governance cycle” (`offering/page.tsx:517`, `extend/page.tsx:527`) during an actual active cycle. Reproduced. Render the current cycle independently of power availability and offer an explicit unavailable/retry state.

### Excessive authorized phase durations can lock governance

`AnnualGovernanceV2.sol:305` checks only a one-day minimum. The direct Safe generator similarly lacks a maximum (`gen_safe_startAnnualCycle.js:47`). A 30-day Phase 2 duration accidentally provided in milliseconds creates roughly **82 years** of voting. After Phase 1 executes, cancellation and upgrades of both governance and Assembly are blocked until that deadline. NFT withdrawals remain available.

This inherited behavior requires an authorized Safe mistake; it is not a permissionless attack. It was reproduced in `AssemblyAdversarialAudit.test.js`. Agree on reasonable maximum durations and enforce them in both payload generation and the contract before release, or explicitly accept and operationally control this risk. This review did not choose new governance policy limits.

### Readiness inspection is not a rejecting deployment gate

`scripts/governance/check_assembly_readiness.cjs:53` collects comparison and state results but does not reject mismatches. An offline mocked inspection exited successfully with both baseline matches false, an active round, wrong wiring and zero delay. It is useful evidence for a human review, but automation must not interpret exit code zero as deployment approval.

A strict production preflight should separately reject unexpected chain, implementation, code, owners, dependencies, collection, initialization/binding, active round and role/delay assumptions. Production V2 deployment and exact Timelock payload tooling still need preparation. The old fixed-allocation preparation script targets a different upgrade and must not be reused unchanged.

## Contract and upgrade validation

Three separate review tracks examined contract behavior, frontend behavior, and upgrade operations; their conclusions were cross-checked against code and test evidence. These are reviews within one engineering session, not an independent external audit.

**130 local contract checks completed successfully**: 120 existing governance regression tests, 3 deterministic model tests, and 7 new adversarial tests. Some adversarial tests intentionally demonstrate accepted trust boundaries or the duration risk; their passing status does not mean those risks are resolved.

The model tests executed **480 mixed operations**, checking token ownership, depositor mappings, unique active registration, current and historical registration flags, total registered counts and manual-transfer recovery against an independent in-memory model. This is bounded randomized testing using three reproducible seeds, not exhaustive or formal verification.

Additional adversarial tests used a real v9.2 to v9.3.1 checkpoint migration and covered lazy checkpoint initialization, the first post-snapshot stake change, stake recycling between wallets, same-block NFT handoff, exact deadlines, and 100 unique nonprofit ballot entries. Custody/reentrancy, 1 OBN aggregate minimum, historical linear cycles, later receipts, fixed allocations, cancellation and shortfall recovery remain covered by existing tests. No unauthorized NFT withdrawal, duplicate eligibility from handing off one NFT, manipulation of historical registration, or incorrect fund distribution was reproduced.

Independent compiled-layout inspection found the original governance slots 0–7 unchanged, new fields at 8–9 and the remaining gap at 10–57. All 17 original Cycle members retain their storage positions. All 31 existing public functions and 14 existing events retain full ABI compatibility. Runtime sizes remain 13,659 bytes for V2 and 7,863 for Assembly.

The previously completed pinned Base fork rehearsal at block **52,015,686** checked real baseline bytecode and OpenZeppelin layout validation, atomically upgraded/initialized and bound through the actual Timelock after its delay, and completed both phases following NFT/stake withdrawal after the snapshot. The Safe was impersonated locally; real signatures were not tested. This rehearsal was reviewed, not rerun in this pass because the production contracts were unchanged.

A fresh **read-only** Base inspection at block **52,016,497** still found the expected implementation `0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3`, matching local `AnnualGovernance`, round 0/INACTIVE, the expected owner and fund wiring, Timelock delay 86,400 seconds, and Safe threshold 2. This establishes conditions at that block only; they must be rechecked before any future authorized operation.

## Scaling evidence

| Scenario | Local gas |
| --- | ---: |
| Register with 20,000 NFTs minted | 238,289 |
| Start cycle with one nonprofit and two registrants | 227,878 |
| Cast Phase 1 vote in that fixture | 120,501 |
| Start cycle with 100 unique nonprofits | 6,988,322 |
| Settle Phase 2 with 100 nonprofits | 560,301 |

The NFT-supply fixture does not contain 20,000 simultaneous registrants. Registration lookups use checkpoints rather than holder enumeration; pool traversal and ballot deduplication remain separate scaling factors. The 100-nonprofit result is below the test chain's 30-million block limit, not a Base fee quote or assurance for arbitrarily many historical pools.

## Frontend validation and unchanged trust assumptions

All **53 existing frontend tests** pass after the live-source synchronization, including the earlier vote-confirmation fixes. A new file, `scripts/governance-audit-20260930.test.cjs`, contains **five successful reproductions of current flaws**. Those five are separate from the passing regression count and are deliberately not evidence of fixes. Convert them to desired-behavior regressions when resolving the findings.

TypeScript, targeted governance ESLint with zero warnings, and a fresh production build pass. A follow-up inspection found that the test checkout's installed `node_modules/next` is **16.2.10**, while both lockfiles and the live checkout's installed Next.js are **16.1.6**. The build therefore does not establish a successful clean install/build of the committed dependency graph. Both Next.js versions remain within the image advisory's affected range. Reconcile the test dependency installation with its lockfile and repeat clean-install validation when preparing the security update. The build used public test addresses/RPC and a dummy WalletConnect identifier supplied only to the process. Its expected WalletConnect configuration fallback does not validate real provider credentials or wallet connectivity. No environment file or secret was copied from the live checkout.

The following properties are intended or accepted limitations rather than newly discovered permissionless vulnerabilities:

- Persistent one-NFT registration per wallet, minimum aggregate snapshot stake of 1 OBN, and square-root voting power are implemented. Both phases use the same previous-block snapshot. Post-snapshot withdrawal preserves that round's rights.
- Multiple pseudonymous wallets and temporary borrowing/rental across the snapshot remain possible. The system is not one-person-one-vote, and addresses/votes remain public. Owner reserve minting of OliveNFT does not pay the public mint fee.
- Positive registration count is not quorum or proof of eligible stake. Zero Phase 1 participation still burns the fixed Offering allocation; zero Phase 2 participation rolls funds over.
- Governance and Assembly block their own upgrades during voting, but the owner can still upgrade staking/OBN dependencies during a vote. The additional tests confirm this privileged trust boundary. Operationally freeze those dependencies during active rounds if snapshot semantics are to remain stable.
- Fund reservations are accounting entries, not segregated custody. Timelock sweeps or governance rewiring can impede settlement. Recovery of an unregistered manual NFT transfer remains owner-reviewed and absent from the app; its evidence hash is not on-chain proof of the recipient's entitlement.

## Required next steps

First remediate the critical frontend dependency ranges and triage the remaining advisories. Then fix the three medium frontend issues and the unavailable-power message. Decide and enforce phase-duration safeguards; prepare rejecting V2 preflight checks and the exact upgrade/binding payloads. Finally integrate the reviewed changes into the authoritative release checkout and rehearse real Safe/browser/Farcaster/smart-wallet paths, transaction replacement, archive RPC failures and reorg handling.

The existing local tests and fork rehearsal support the contract design, but they do not replace final artifact verification, production configuration checks, or an external contract security review before mainnet custody begins.

## Evidence files

- `obn-project/test/AssemblyModelAudit.test.js`
- `obn-project/test/AssemblyAdversarialAudit.test.js`
- `obn-frontend/scripts/governance-audit-20260930.test.cjs`
- `governance-operations/assembly_dependency_audit_2026-09-30.json`
- `governance-operations/assembly_audit_manifest_2026-09-30.json`

Run contract audit files with `hardhat.nft-voting.config.cjs` only. Run the frontend reproduction file with `node --test`; it asserts the current faulty behavior and should not be confused with a release acceptance suite.
