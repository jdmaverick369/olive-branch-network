# Olive Branch Network Whitepaper v9.3 — Proof-of-Contribution

## Purpose

Olive Branch Network exists to answer a simple question:

If crypto allows us to code behavior into money, can we code money to do good?

OBN is a Proof-of-Contribution staking protocol designed to turn ordinary on-chain participation into continuous nonprofit funding while still rewarding users for participating. Users stake OBN into nonprofit-specific pools, earn staking emissions, and help route a defined portion of those emissions toward real-world causes.

The goal is not to ask users to choose between earning and giving. The goal is to make both happen through the same protocol action.

OBN introduces a contribution layer where staking activity creates transparent, on-chain records tied to the causes users support. Every stake, claim, nonprofit distribution, governance vote, burn, and annual allocation becomes part of a public system that can be tracked, verified, and built upon.

This paper defines the canonical OBN contract suite, token economics, nonprofit pool model, governance structure, upgradeability path, security assumptions, and the end-to-end process for supporting nonprofits. It also establishes the protocol-level framing of Proof-of-Contribution: a model where digital assets are not only used for speculation, yield, or governance, but also for measurable contribution.

---

## 1) Executive Summary

**Mission:** Make donating the path of least resistance by routing a fixed portion of staking emissions to verified nonprofit wallets—automatically, transparently, and forever on-chain.

**Core idea:** OBN is built around **Proof-of-Contribution**: a model where users prove participation not only by staking capital, but by continuously helping route value toward real-world nonprofit causes. Every stake, claim, and nonprofit reward flow becomes part of an on-chain contribution layer.

**Mechanism:** Users stake OBN in nonprofit-specific pools. Emissions split is hard-coded: 88% stakers, 10% nonprofit direct, 1% ExtendOliveBranch (annual nonprofit distribution), 1% TheOffering (annual burn-or-give vote).

**Focused impact model:** OBN will intentionally cap the protocol at 99 nonprofit pools. This keeps contribution focused, prevents dilution across too many organizations, and gives the network a clear, curated structure for long-term impact.

**Design guarantees:**

- Fixed four-way split (88/10/1/1) at the contract level
- Equal APR per token across all pools at a given time (pool APRs normalize by design)
- Proof-of-Contribution accounting through on-chain nonprofit funding flows and user contribution views
- Maximum nonprofit pool target of 99 pools for focused impact
- One charityWallet per pool; no "retire/active" flags on pools
- Admin locks are increase-only and auto-shrink if balance falls; intended only for bootstrap
- Single minter: Only the staking contract can mint OBN after setMinterOnce
- Timestamp-based emission phases with a 10-year declining schedule
- Nonprofit self-stake protection, pool lifecycle management, atomic bootstrap migration, emergency force-exit controls

**Governance & Upgradability:** UUPS proxies for Token & Staking; ownership migrates to a DAO + timelock.

---

## 2) Proof-of-Contribution

### 2.1 What Proof-of-Contribution Means

Proof-of-Contribution is the core identity of OBN.

In traditional staking systems, users prove participation by locking capital and earning yield. OBN keeps that staking foundation, but adds a second layer: every user action also helps fund a nonprofit pool. This means participation is not measured only by speculation, ownership, or yield extraction. It is also measured by contribution.

When a user stakes OBN into a nonprofit pool, they are not simply choosing where to earn rewards. They are choosing which cause their participation helps support. When they claim rewards, the protocol automatically mints the nonprofit share to the selected pool's charityWallet. The result is a transparent, on-chain record of contribution generated through ordinary protocol participation.

OBN therefore turns staking into a contribution mechanism.

### 2.2 Why This Matters

Most crypto protocols measure success through liquidity, volume, price, users, and TVL. OBN keeps these metrics, but adds another important measurement: how much value the network routes toward public-good organizations.

This creates a different type of network effect:

- More users create more staking activity
- More staking activity creates more emissions
- More emissions create more nonprofit funding
- More nonprofit funding creates more visible impact
- More visible impact strengthens the protocol's identity and credibility

Proof-of-Contribution aligns self-interest with public good. Users can earn, nonprofits can receive, and the protocol can build transparent contribution history without requiring users to make separate donations.

### 2.3 Contribution as an On-Chain Identity Layer

OBN can track contribution through existing and future protocol views, including:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- pool-level charity distributions
- total charity minted to each nonprofit wallet
- time staked and participation history

These metrics allow the protocol to build future contribution dashboards, user impact profiles, nonprofit reporting pages, and governance tools. Over time, Proof-of-Contribution can become an identity layer showing how users participated in the network and which causes they helped support.

This does not require users to sacrifice yield. The protocol is designed so earning and giving occur in the same action.

---

## 3) Contract Suite

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**Standards:** ERC20, EIP-2612 Permit, ERC20Votes (checkpointed voting power), Burnable.

**Core features:**

- **ERC20Upgradeable:** Standard token transfers, approvals, balances
- **ERC20PermitUpgradeable:** EIP-2612 permit() for gasless approvals
- **ERC20VotesUpgradeable:** Checkpointed voting power for governance (vote delegation, historical lookups)
- **ERC20BurnableUpgradeable:** Users can voluntarily burn tokens
- **UUPSUpgradeable:** Upgradeable with owner authorization
- **OwnableUpgradeable:** Single owner with transfer capability

**Genesis mint (one-time at initialize)** of the Initial Supply (currently planned: 1,000,000,000 OBN):

- 40% Liquidity — for DEX pool bootstrapping
- 30% Airdrop — early distribution to community
- 10% Charity Genesis Reserve — dedicated for nonprofit programs, including pool bootstraps
- 10% Treasury — for protocol governance and operations
- 10% Team — to the TeamVesting contract with cliff and vesting schedule

Total distribution is hard-coded in `initialize()` and happens atomically; no additional minting occurs during genesis.

**Single-minter model (hard rule):**

- `setMinterOnce(address minterAddr)` sets exactly one minter (the staking contract) and can only be called once
- After calling `setMinterOnce`, the minter cannot be changed unless the contract is upgraded
- Only the minter can call `mint(to, amount)` to distribute staking rewards
- This hard-coded constraint eliminates ad-hoc issuance risk and ensures predictable token supply

**Upgrade gate:** UUPS with `_authorizeUpgrade` restricted to owner (to be DAO-controlled post-bootstrap).

**Vote delegation:** Users can `delegate(delegatee)` to direct their voting power (ERC20Votes pattern).

**Why this structure?**
One-time distribution removes ambiguity about initial supply. A sole minter eliminates ad-hoc issuance risk. ERC20Votes aligns the token with DAO control and enables future governance. Burnability provides a voluntary sink for future integrations. Permit support (EIP-2612) improves UX by eliminating separate approval transactions.

### 3.2 OBNStakingPools (timestamp phases, per-pool accounting, UUPS)

**Hard-coded reward split (BPS):**

- STAKER_BPS = 8_800 → 88% to users
- CHARITY_BPS = 1_000 → 10% to charity wallet (direct, per-action)
- CHARITY_FUND_BPS = 100 → 1% to ExtendOliveBranch
- TREASURY_BPS = 100 → 1% to TheOffering

The `charityFund` address routes to **ExtendOliveBranch** and the `treasury` address routes to **TheOffering**. Both accumulate OBN throughout each annual cycle. AnnualGovernance resolves both balances through community votes at the end of each cycle. See Sections 3.4–3.6 for contract details.

**Emission phases (initialized at deploy):**

- Years 0–2: 10.00% APY
- Years 2–4: 7.50% APY
- Years 4–6: 5.00% APY
- Years 6–8: 2.50% APY
- Years 8–10: 1.25% APY

Governance may append future phases contiguously; prior phases remain immutable.

**Equal APR per pool:** By construction, per-token APR depends only on the active phase, not on which pool you choose.

**Proof-of-Contribution accounting:** The staking contract exposes user and pool contribution views that allow the protocol to calculate how much nonprofit funding is attributable to each user's participation.

**Data model:** PoolInfo { address charityWallet; uint256 totalStaked; } (one wallet per pool).

#### 3.2.1 Core User Actions

**Bounded, per-pool endpoints:**

- `deposit(pid, amount)` — Stake OBN in a pool
- `depositFor(pid, amount, beneficiary)` — Stake on behalf of another address
- `depositWithPermit(...)` — Stake with ERC20 Permit (no separate approval)
- `withdraw(pid, amount)` — Withdraw unlocked balance
- `claim(pid)` — Claim pending rewards
- `claimFor(pid, user)` — Claim rewards for another address
- `claimMultiple(pids[])` — Claim pending rewards from multiple pools in one transaction

**Charity mechanics:**

- 10% of rewards is minted per user action (claim, deposit, withdraw) directly to that pool's charityWallet
- 1% accrues continuously to ExtendOliveBranch; community votes each cycle which approved nonprofit receives the accumulated balance
- 1% accrues continuously to TheOffering; community votes each cycle to burn the balance or donate it to ExtendOliveBranch
- No global TVL buffer; splits happen per-action for atomic execution

#### 3.2.2 Pool Lifecycle Management

**Shutdown mechanism:**

- `shutdownPool(pid)` — Blocks NEW deposits; claims and withdrawals continue
- Allows users to exit gracefully without pool removal
- Pool data remains intact for stakers

**Pool removal:**

- `removePool(pid)` — Soft-delete after pool is completely empty (totalStaked == 0)
- No PID reindexing; backward compatible
- **Treasury safety:** If legacy charity accrues before removal, it's flushed to the pool's charityWallet; if wallet is zero, it's redirected to treasury
- Prevents reward loss if users claim after removal

#### 3.2.3 Nonprofit Self-Stake Protection

**Policy:** Nonprofits can receive exactly ONE permanent locked bootstrap deposit. All other self-staking is blocked.

**Enforcement:** The `_enforceCharitySelfStakePolicy` function checks:

- Is the beneficiary the pool's charity wallet?
- If yes, is this from charityFund AND locked AND their current balance is zero?
- If all true, allow it (first bootstrap). Otherwise, reject.

**Rationale:** Prevents accidental or malicious self-stakes by nonprofits that could break pool reward dynamics or enable attacks.

#### 3.2.4 Atomic Bootstrap Migration

**Function:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**Atomic guarantees:**

- Preserves pending rewards (verified down to 1 wei tolerance)
- Copies locked amounts safely with overflow prevention
- Updates charity wallet atomically in same transaction
- Deactivates old user's pool counters
- Activates new user if it's their first pool stake

**Preconditions:**

- oldNonprofit IS the pool's current charity wallet
- oldNonprofit ≠ newNonprofit
- oldNonprofit has a non-zero stake
- newNonprofit does not already have a stake in this pool

**Purpose:** Enables seamless nonprofit position transfers (e.g., address compromise, wallet rotation) without reward loss or stranding.

#### 3.2.5 Emergency Force Exit

**Function:** `forceExitUserToSelf(pid, user, claimRewards)` (owner-only, nonReentrant)

**Behavior:**

- Force-exits a user from a pool, ignoring locks
- Returns principal to the user immediately
- Optionally mints pending rewards to user
- Clears lock, reward debt, and active staker counters

**Use case:** Emergency governance control for pool removal when users need recovery; used after a pool is shutdown.

#### 3.2.6 Charity Wallet Updates

**Function:** `updateCharityWallet(pid, newWallet)` (owner-only)

**Allows:** Updating a pool's charity address (e.g., if compromised or rotating to new address).

**Tracked via:** CharityWalletUpdated event.

#### 3.2.7 Lock Management

**Function:** `setLockedAmount(pid, user, amount)` (charityFund-only)

**Rules:**

- Can only INCREASE or keep same; never decrease
- Cannot exceed user's balance
- Locks auto-shrink if balance drops below lock amount
- Intended only for bootstrap deposits

**Observability:**

Analytics reads are surfaced through **OBNStakingLens** (Section 3.7) — the canonical read layer for frontends and dashboards. Lock and balance reads remain on the staking contract directly:

- `pendingRewards(pid, user)` — Returns GROSS pending amount
- `pendingRewardsMultiple(pids[], user)` — Returns pending amounts for multiple pools plus total
- `unlockedBalance(pid, user)` — Returns balance minus lock
- `stakeElapsed(user)` — Total staking seconds (persists across unstakes)
- `charityContributedByUserInPool(pid, user)` — Total charity minted attributable to user in a pool
- `totalCharityContributedByUser(user)` — Total charity minted attributable to user across all pools

See Section 3.7 for the full OBNStakingLens view surface (getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor).

### 3.3 TeamVesting (linear, cliffed; non-upgradeable)

**Cliff:** ~4 months; **Duration:** ~20 months linear thereafter.

**`release()`:** Streams vested tokens to teamWallet.

**Helpers:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**Safety:** Cannot rescue the vested token; only stray ERC20s.

### 3.4 TheOffering (non-upgradeable)

TheOffering is the protocol's annual burn-or-give vault. The staking contract routes the 1% treasury emission slot to this address. OBN accumulates continuously throughout each annual cycle.

At the end of each cycle, AnnualGovernance executes the community's Phase 1 vote outcome:

- **BURN:** The entire accumulated balance is permanently burned, reducing total OBN supply.
- **GIVE:** The entire accumulated balance is transferred to ExtendOliveBranch, increasing that cycle's nonprofit distribution.

**Access control:** `timelockOwner` (Timelock) controls admin functions including `emergencySweep`. `governance` (AnnualGovernance) is the only address authorized to call `burn()` or `sendToExtend()`. The `governance` address is initialized to `address(0)` and wired to AnnualGovernance via `setGovernance()` through the Timelock.

**Non-upgradeable:** TheOffering is deployed as a standard contract with no proxy. The constructor arguments (`obn` token address, `timelockOwner`) are immutable. If replacement is required, the Timelock must deploy a new contract and call `setTreasury(newAddress)` on the staking proxy to re-route emissions.

### 3.5 ExtendOliveBranch (non-upgradeable)

ExtendOliveBranch is the protocol's annual nonprofit distribution vault. The staking contract routes the 1% charityFund emission slot to this address. OBN accumulates continuously and may also receive a donation from TheOffering when the community votes GIVE in Phase 1.

At the end of each cycle, AnnualGovernance executes the community's Phase 2 vote: the winning nonprofit pool's charityWallet receives ExtendOliveBranch's full accumulated balance in a single transaction.

**Approved nonprofit registry:** ExtendOliveBranch maintains a whitelist of approved recipient addresses. `setApprovedNonprofit(address, bool)` is callable by the Timelock. All pool charity wallets are kept on the whitelist; new pools are approved atomically alongside `addPool` via `schedule_addPool.js`.

**Distribution:** `distributeFromGovernance(to, amount)` is callable only by the `governance` address. Any `to` address is valid when called through governance, because a community vote constitutes explicit selection.

**Non-upgradeable:** Same immutability guarantee as TheOffering. Constructor args (`obn`, `timelockOwner`) are immutable.

### 3.6 AnnualGovernance (UUPS proxy)

AnnualGovernance coordinates the annual decision cycles for both TheOffering and ExtendOliveBranch. It is a UUPS upgradeable proxy owned by the Timelock.

**Cycle structure:** Each annual cycle runs two sequential phases:

1. **Phase 1 — Burn or Give:** Stakers vote on TheOffering's accumulated balance. The winning outcome is executed atomically: BURN calls `TheOffering.burn()`; GIVE calls `TheOffering.sendToExtend()`.

2. **Phase 2 — Nonprofit Selection:** Stakers vote to select which approved nonprofit receives ExtendOliveBranch's full accumulated balance. The ballot is curated by the `voteAdmin` to at most `maxBallotSize` nominees. The winning pool's charityWallet receives the distribution via `ExtendOliveBranch.distributeFromGovernance()`.

**Tie-breaking:**

- Phase 1: GIVE only wins if its vote total strictly exceeds BURN's. An exact tie — or zero participation — resolves to BURN.
- Phase 2: the nonprofit with the highest vote total wins; a tie goes to whichever tied nonprofit appears earliest on the ballot. If no votes are cast at all, the balance rolls over to the next cycle instead of being distributed.

**Vote integrity:**

- Voting power uses checkpointed OBN balances at cycle start (`block.number - 1`) to prevent same-block stake-and-vote manipulation.
- `maxBallotSize = 100` ensures the full 99-pool model can always be represented in a single ballot.
- Phase transitions are controlled by the `voteAdmin` (OperatorSafe), making cycle timing deliberate.

**Execution:** AnnualGovernance calls TheOffering and ExtendOliveBranch directly. No additional multisig approval is required once a vote concludes — outcomes are enforced by contract.

**Upgradability:** AnnualGovernance is a UUPS proxy. More sophisticated voting mechanics (delegation, quorum requirements, time-weighted voting) can be added through Timelock-governed upgrades as the DAO matures.

**Parameters:** `owner` = Timelock; `voteAdmin` = OperatorSafe; `maxBallotSize` = 100; `currentCycleId` starts at 0.

### 3.7 OBNStakingLens (UUPS proxy)

OBNStakingLens is a dedicated read-only analytics contract. It is the canonical read layer for frontends, dashboards, and off-chain analytics tools. Consolidating analytics reads into a separate upgradeable proxy keeps the staking contract's external surface minimal and stable while analytics capabilities can evolve independently.

**Key views:**

- `getGlobalStats()` — Pool count, total TVL, unique stakers, current rewards-per-second
- `getPoolStats(pid)` — Per-pool statistics: charity wallet, staked amount, staker count, accumulator state
- `getUserPoolView(pid, user)` — User-specific staking data: balance, lock, pending rewards, active status
- `getPoolAPR(pid)` — Current APR for the staker share of a pool
- `pendingCharityFor(pid, user)` — Estimated pending nonprofit contribution attributable to a user

**Access control:** `owner` (Timelock) controls upgrades. The Lens reads from the staking proxy as a view-only caller and holds no mutable state of its own.

**Initialization:** `initialize(stakingPools, timelock)` — sets the staking proxy address and Timelock owner.

---

## 4) Token Economics & Long-Term Profitability

### 4.1 Emission math (intuition)

Let the phase APR basis be B (in BPS), global TVL G, and pool TVL P.

**Yearly gross to the pool:** YearlyPoolGross = P × (B / 10,000)

**Stakers receive 88% of that;** the rest routes to the nonprofit charityWallet (10%), ExtendOliveBranch (1%), TheOffering (1%).

**Per-token APR simplifies to** 0.88 × (B / 10,000), **equal across pools** — independent of supply size.

### 4.2 Declining emissions support value

**Sell-pressure decay:** Lower issuance over time reduces structural sell pressure.

**Cause-driven demand:** The protocol creates ongoing alignment between users, nonprofits, and long-term network credibility.

**TVL credibility:** Bootstrap locks create persistent TVL, improving confidence and price discovery.

**Predictability:** With splits and phases on-chain, participants can plan long-term.

**Contribution history:** Proof-of-Contribution adds another form of protocol value: transparent evidence of public-good funding generated through user participation.

### 4.3 Emission split minimalism (1% + 1%)

Users get 88%, direct nonprofit funding accounts for 10%, and the remaining 2% accrues to ExtendOliveBranch and TheOffering — each resolved annually through community governance votes.

Keeping the governance-accumulated streams at 1% each ensures the protocol remains lean and user/charity-centric. Neither stream can be silently redirected; both are governed transparently on-chain through AnnualGovernance.

### 4.4 Annual governance streams (1% + 1%)

Both 1% emission streams are governed by AnnualGovernance, each with a clearly defined purpose.

**ExtendOliveBranch (1% of emissions):** Accumulates OBN continuously throughout each annual cycle. At the end of each cycle, stakers vote in Phase 2 of AnnualGovernance to select which approved nonprofit pool receives the full accumulated balance. This gives the community a transparent, recurring mechanism to direct protocol-level resources toward specific causes.

**TheOffering (1% of emissions):** Accumulates OBN continuously. At the end of each cycle, stakers vote in Phase 1 of AnnualGovernance to choose between two outcomes: BURN the balance (permanently deflationary) or GIVE it to ExtendOliveBranch (additive to that cycle's nonprofit distribution). This vote gives the community ongoing control over supply policy — a decision that becomes more significant as protocol TVL and annual accumulation grow.

The full reward structure:

- The **10% per-action allocation** routes directly and atomically to the selected pool's charityWallet on every claim.
- The **1% ExtendOliveBranch stream** accumulates and is redistributed annually to a governance-selected nonprofit.
- The **1% TheOffering stream** accumulates and is either burned or added to that year's nonprofit distribution.

### 4.5 Burnability (optional sink)

OBN is inflationary via staking, but voluntary burns (e.g., future app fees) can offset issuance—decentralized and market-driven.

---

## 5) Protocol Mechanics & Rationale

### 5.1 Nonprofit distribution

**Per-action model:** On every claim/deposit/withdraw, 10% of the user's pending rewards is minted directly to that pool's charityWallet.

**Atomic execution:** No external calls or global buffers; all splits happen within the user's transaction.

**No allocation contention:** Each pool's charity is independent; no global reallocation function.

**Proof-of-Contribution:** Because charity distribution is tied to user actions and pool selection, the protocol can attribute contribution to specific users and nonprofit pools.

### 5.2 Annual governance streams vs. Charity Genesis Reserve

**Charity Genesis Reserve (10% of initial supply):** One-time genesis allocation held by governance. Primarily earmarked for 1,000,000 OBN bootstrap stakes per nonprofit pool, targeting up to 99 pools.

**ExtendOliveBranch (1% of ongoing emissions):** Accumulates continuously. AnnualGovernance Phase 2 votes select which approved nonprofit receives the full cycle balance. The protocol's annual directed-giving mechanism.

**TheOffering (1% of ongoing emissions):** Accumulates continuously. AnnualGovernance Phase 1 votes choose between burning the balance or donating it to ExtendOliveBranch. The protocol's annual supply-policy mechanism.

This three-way distinction is important:

- The **10% nonprofit reward share** is automatic, per-action, and pool-specific.
- The **10% Charity Genesis Reserve** is a one-time initial supply allocation for bootstrapping.
- The **1% + 1% annual governance streams** are ongoing emissions resolved annually through community votes.

### 5.3 Permanent locks (bootstrap-only; increase-only)

**Policy:** Admin can only increase lockedAmount and never decrease it; locks auto-shrink if the user's balance drops below the stored lock.

**Purpose:** Purely for the bootstrap mechanism. Locks ensure the seeded principal cannot be withdrawn while letting the beneficiary earn yield day one. This preserves TVL integrity and protects against immediate dumping of seeded tokens.

**User stakes are unlocked by default;** users can always withdraw their unlocked balance.

### 5.4 No emission controller

Phases fully specify issuance; there's no external "rate knob." DAO may append future phases contiguously with notice (timelock).

### 5.5 Why cap nonprofit pools at 99?

OBN will intentionally target a maximum of **99 nonprofit pools**.

This cap is a strategic design choice, not a technical limitation. The goal is to prevent impact dilution. If the protocol supports too many nonprofits at once, emissions and attention can become spread too thin. By capping the network at 99 pools, OBN can focus contribution around a curated set of organizations and make funding more visible, meaningful, and measurable.

The 99-pool model also gives OBN a clear public identity:

**99 nonprofit pools. One Proof-of-Contribution network. Every stake becomes proof.**

Once the 99-pool target is reached, governance should prioritize quality, transparency, and pool maintenance rather than endless expansion. New nonprofits may be considered only when a pool is removed, replaced, or migrated according to protocol policy.

---

## 6) Nonprofits: Wallets, Onboarding & Display

### 6.1 One wallet per pool

Each pool maps to a single charityWallet. This keeps routing deterministic and reporting simple.

### 6.2 Address-first listing

We are indexing public Ethereum addresses that reputable organizations already publish and onboarding them onto our platform.

In addition, we are reaching out to organizations through email and phone to let them know about our platform.

Every charity page shows a clear "No Affiliation / Not Endorsed" banner by default unless a direct relationship or formal acknowledgment exists.

### 6.3 The 99 Nonprofit Pool Model

OBN will limit the protocol to a maximum target of 99 nonprofit pools.

This creates a focused contribution network rather than an unlimited directory. The purpose is to support a curated group of nonprofits with enough concentration that the protocol's funding can become meaningful over time.

The 99-pool model supports:

- stronger nonprofit visibility
- more focused protocol reporting
- reduced contribution dilution
- clearer public communication
- easier governance oversight
- better long-term user understanding

OBN is not trying to list every nonprofit in the world. It is trying to build a focused, transparent, on-chain contribution system around a limited group of trusted public-good organizations.

### 6.4 Bootstrap Program

**Objective:** Ensure each newly onboarded charity earns from day one and that pools start with credible TVL.

**Source of funds:** The 10% Charity Genesis Reserve is earmarked to bootstrap up to 99 nonprofits. The intended bootstrap target is 1,000,000 OBN per nonprofit, subject to governance and available reserves.

At 99 pools, a 1,000,000 OBN bootstrap per nonprofit would require 99,000,000 OBN, leaving 1,000,000 OBN from the 100,000,000 OBN Charity Genesis Reserve for governance-approved nonprofit-related uses, reserves, operational flexibility, or future policy decisions.

**Mechanism:**

1. Governance or the authorized executor (the `charityFund` address, set to ExtendOliveBranch) calls `charityFundBootstrap(pid, amount, beneficiary)` or uses `depositForWithLock(pid, amount, beneficiary)` where applicable.
2. The bootstrap OBN is staked and permanently locked for that nonprofit's pool/beneficiary.
3. The lock prevents withdrawal of the seeded principal, eliminating immediate dump risk while the position earns yield continuously.
4. The nonprofit benefits from both the staker-share yield on its locked bootstrap position and the pool's 10% charity allocation routed to the charityWallet.

**Expansion policy after 99:** OBN should not continue expanding indefinitely. Once the protocol reaches the 99-pool target, governance may replace, migrate, or remove pools according to clear standards, but the network should maintain the 99-pool cap unless governance explicitly changes the model.

**Reporting:** Each bootstrap is transparent on-chain and included in periodic public disclosures.

**Protection:** The `_enforceCharitySelfStakePolicy` ensures each charity can only receive one bootstrap position; future stakes must come from the charity itself or external users.

### 6.5 Delisting policy

If standards aren't met, we remove the nonprofit from our frontend and stop promoting that pool.

User stakes and pending rewards should be returned to users before the pool is shutdown and removed from the protocol.

OBN is a routing & staking protocol, not a registered nonprofit or certifier. Users should independently verify organizations and consult tax professionals.

---

## 7) Governance & Upgradability

### 7.1 UUPS proxies (Token & Staking)

Upgrades require `_authorizeUpgrade` (owner).

**Progressive decentralization:**

1. Multisig owner
2. Timelock (with enforced delay)
3. ERC20Votes-based DAO

### 7.2 Hard-coded vs Governed

**Hard-coded or contract-level constraints (requires upgrade to change where applicable):**

- Four-way split: 88% / 10% / 1% / 1%
- 10-year emission schedule (changing every 2 years): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Admin lock semantics (increase-only, auto-shrink)
- Single-minter in OBNToken
- Nonprofit self-stake policy
- Bootstrap migration atomicity guarantees
- Contribution accounting exposed by contract views

**Governed (no upgrade needed unless a specific implementation requires it):**

- Add pools (`addPool(charityWallet)`)
- Maintain the 99-pool curation policy
- Execute bootstrap stakes from the Charity Genesis Reserve or authorized funding source
- Manage AnnualGovernance cycle timing and ballot curation (voteAdmin role)
- Append future phases contiguously (`addPhase`)
- Shutdown or remove pools
- Spending and usage reporting for TheOffering and ExtendOliveBranch
- Standards for nonprofit onboarding, delisting, replacement, and migration

### 7.3 Governance and the 99-pool cap

The 99-pool cap should be treated as a foundational policy commitment of the protocol.

Governance may manage which nonprofits are included, but the default assumption should be that OBN remains capped at 99 nonprofit pools to preserve focused impact. If governance ever proposes expanding beyond 99, that decision should require clear public justification, community review, and a transparent vote.

### 7.4 AnnualGovernance

AnnualGovernance is the on-chain mechanism for OBN's recurring community decisions, providing defined, contract-enforced governance cycles for the protocol's Charity Fund policy.

**Cycle structure:**

Each cycle begins when the voteAdmin opens it. Phase 1 and Phase 2 run sequentially.

- **Phase 1 (Burn or Give):** Stakers vote on TheOffering's accumulated balance. BURN permanently reduces supply. GIVE transfers the balance to ExtendOliveBranch, increasing that cycle's nonprofit distribution.
- **Phase 2 (Nonprofit selection):** Stakers vote to select which approved nonprofit pool receives ExtendOliveBranch's full accumulated balance. Nominees are drawn from the whitelist maintained in ExtendOliveBranch via `setApprovedNonprofit`.

**Tie-breaking:**

- Phase 1: BURN wins by default — GIVE must strictly exceed BURN's vote total to win. A tie (or no votes at all) resolves to BURN.
- Phase 2: the nonprofit with the most votes wins; ties go to whichever tied nonprofit has the lowest ballot index. If no votes are cast, the balance rolls over to the next cycle rather than being distributed.

**Vote integrity:**

- Voting power is derived from checkpointed OBN balances at cycle start, preventing same-block stake-then-vote manipulation.
- The ballot is capped at `maxBallotSize = 100`, ensuring the full 99-pool model always fits.
- Phase transitions are controlled by the voteAdmin so cycles are deliberate and not rushed.

**Execution:**

AnnualGovernance calls `TheOffering.burn()`, `TheOffering.sendToExtend()`, or `ExtendOliveBranch.distributeFromGovernance()` directly. No additional multisig approval is required once a vote concludes — the outcome is enforced by the contract.

**Upgradability:**

AnnualGovernance is a UUPS proxy. The Timelock can upgrade it to support more sophisticated voting mechanics (delegation, quorum requirements, time-weighted power) as the DAO matures.

---

## 8) Security Model

### 8.1 Core principles

- **Checks-Effects-Interactions:** State updates before external calls
- **Reentrancy guards:** nonReentrant on all mutating paths
- **SafeERC20:** Used for all token transfers
- **Precision math:** Math.mulDiv for accurate calculations
- **No unbounded loops:** Per-pool endpoints, bounded updates

### 8.2 Hardening

**Atomic operations:** Bootstrap migration, pool removal, force exit all complete atomically.

**Reward preservation:** Explicit validation that pending rewards are preserved during migration (to 1 wei tolerance).

**Lock overflow prevention:** NewLock ≤ userBalance enforced before setting locked amounts.

**Treasury fallback:** Stranded rewards redirected to treasury instead of lost.

**Emergency controls:** Force exit enables governance to recover users in emergencies.

**Focused pool surface:** A 99-pool cap reduces governance complexity and makes nonprofit monitoring more manageable.

### 8.3 Design trade-offs

Equal APR keeps focus on impact, not APR gaming.

Per-action charity minting is atomic but requires every action to mint (gas trade-off).

Appending phases centralizes some discretion; timelock + DAO voting mitigates.

The 99-pool model limits breadth in favor of depth, focus, and measurable contribution.

AnnualGovernance resolves TheOffering and ExtendOliveBranch balances through transparent, accountable community votes each cycle.

---

## 9) Transparency & Reporting

### 9.1 Events

- Deposit, Withdraw, Claim
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 Views

**OBNStakingLens (canonical analytics read layer):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Proof-of-Contribution reporting

Proof-of-Contribution reporting should become one of OBN's most important transparency layers.

Future dashboards may show:

- total OBN contributed to nonprofits
- total OBN contributed by pool
- total OBN contribution attributable to each user
- lifetime contribution history by wallet
- user contribution across multiple nonprofit pools
- top pools by contribution
- active stakers per pool
- currently staked OBN per pool
- charity emissions over time
- TheOffering accumulation, burn history, and give history by cycle
- ExtendOliveBranch accumulation and nonprofit distribution history by cycle
- AnnualGovernance vote results by cycle

These reports should help users understand not only what they earned, but what their participation helped generate.

### 9.4 Disclosures

OBN should publish periodic public reports covering:

- Charity Genesis Reserve balances
- bootstraps executed
- nonprofit pool status
- pool additions, removals, or migrations
- direct charity distributions
- TheOffering and ExtendOliveBranch balances, accumulation, and usage by cycle
- Treasury balances and usage
- Proof-of-Contribution metrics

---

## 10) User Journey

1. **Acquire OBN** — Users acquire OBN through available liquidity sources.
2. **Pick a nonprofit pool by cause** — APR is equal across pools at a given time, so users choose based on mission rather than yield differences.
3. **Stake** — Users stake with `deposit`, stake for another address with `depositFor`, or use Permit where supported.
4. **Earn rewards** — Users earn the staker portion of emissions.
5. **Generate contribution** — The selected nonprofit receives its protocol-defined share when users interact with the pool.
6. **Build Proof-of-Contribution** — User contribution can be tracked across pools and over time.
7. **Withdraw unlocked principal anytime** — Bootstrap locks do not apply to ordinary user stakes.
8. **Vote on TheOffering** — Once per year, stakers vote whether TheOffering's accumulated balance is burned or sent to ExtendOliveBranch.
9. **Vote on ExtendOliveBranch** — Stakers then vote on which approved nonprofit receives ExtendOliveBranch's full accumulated balance.

OBN is designed so users do not need to choose between earning and giving. Both happen through the same protocol action.

---

## 11) Token Supply & Distribution

**Initial Supply:** 1,000,000,000 OBN (current plan).

**Genesis distribution (on initialize):**

- 40% Liquidity
- 30% Airdrop
- 10% Charity Genesis Reserve — used chiefly for 1,000,000 OBN bootstrap stakes per charity, targeting up to 99 nonprofit pools
- 10% Treasury
- 10% Team (to TeamVesting; ~4-month cliff, ~20-month linear vest)

**Ongoing issuance:** Only via staking emissions; the staking contract is the sole minter.

**Reward split on emissions:**

- 88% stakers
- 10% selected nonprofit pool
- 1% ExtendOliveBranch (annual nonprofit distribution)
- 1% TheOffering (annual burn-or-give vote)

**Voluntary burn:** Available via burn for future sinks.

---

## 12) Roadmap (Indicative)

### 12.1 Germination

- Form the base protocol concept
- Build and test the smart contracts
- Deploy OBNToken and OBNStakingPools to Base
- Launch initial frontend
- Seed liquidity
- Run early airdrop campaigns
- Integrate Farcaster and Base-native user flows
- Begin public nonprofit wallet indexing
- Establish the initial Proof-of-Contribution narrative

### 12.2 Vegetation

- Implement expanded contribution tracking in the frontend
- Build Proof-of-Contribution dashboards
- Improve nonprofit reporting pages
- Continue curating toward the 99-pool model
- Launch AnnualGovernance first cycle once DAO voting is live
- Produce educational media
- Onboard additional nonprofits
- Explore partnerships
- Hire essential contributors where possible
- Obtain third-party security audits
- Complete legal and governance work
- Build and test DAO backend/frontend

### 12.3 Bloom

- Deploy DAO and pass governance to the community
- Transfer upgrade authority through timelock governance
- Transfer AnnualGovernance voteAdmin to DAO-controlled address as governance matures
- Maintain the 99-pool nonprofit network
- Update frontend with DAO features
- Expand contribution reputation and reporting tools
- Maintain and adapt protocol as public-good needs evolve

---

## 13) Appendix — Key Functions

### OBNStakingPools

**User mutations:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (charityFund-only)
- `charityFundBootstrap(pid, amount, beneficiary)` (charityFund-only)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimFor(pid, user)`
- `claimMultiple(pids[])`

**Admin mutations:**

- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (charityFund-only)
- `setVersion(newVersion)` (owner-only)
- `upgradeTo(newImplementation, data)` (owner-only, governance-compatible)

**Views:**

- `pendingRewards(pid, user)` — GROSS pending amount
- `pendingRewardsMultiple(pids[], user)` — Pending amounts for multiple pools plus total
- `getPoolAPR(pid)` — User portion APR
- `getGlobalStats()` — Global TVL, unique stakers, RPS
- `getPoolStats(pid)` — Per-pool statistics
- `getUserPoolView(pid, user)` — User-specific view
- `unlockedBalance(pid, user)` — Available to withdraw
- `stakeElapsed(user)` — Total staking seconds
- `getUserStats(user)` — Aggregated user data
- `poolLength()` — Number of pools
- `charityContributedByUserInPool(pid, user)` — User's charity contributions in a pool
- `totalCharityContributedByUser(user)` — User's total charity contributions across all pools

### OBNToken

**Mutations:**

- `setMinterOnce(minter)` (owner-only, once)
- `mint(to, amount)` (minter-only)
- Standard ERC20: `transfer`, `approve`, `transferFrom`
- `permitAndCall` support (EIP-2612)
- `burn(amount)` — Voluntary burn
- `delegate(delegatee)` — Vote delegation (ERC20Votes)

**Views:**

- Standard ERC20: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**Mutations:**

- `release()` — Release vested tokens to teamWallet
- `updateTeamWallet(newWallet)` (owner-only)
- `rescueERC20(token, amount)` (owner-only, excludes vested token)

**Views:**

- `vestedAmount(timestamp)` — Total vested at time
- `claimableNow()` — Currently claimable
- `timeUntilCliff()` — Cliff countdown
- `timeUntilNextRelease()` — Next release countdown
- `nextReleaseTimestamp()` — Next release time

### TheOffering

**Governance mutations:**

- `burn(amount)` (governance-only) — Burns the full balance after a BURN vote
- `sendToExtend(amount)` (governance-only) — Sends the balance to ExtendOliveBranch after a GIVE vote

**Admin mutations:**

- `setGovernance(newGovernance)` (timelockOwner-only) — Wires or updates the governance address; `address(0)` pauses it
- `emergencySweep(token, to)` (timelockOwner-only)

### ExtendOliveBranch

**Distribution mutations:**

- `distribute(nonprofit, amount)` (timelockOwner or governance) — Whitelist-enforced
- `distributeFromGovernance(nonprofit, amount)` (governance-only) — Whitelist check intentionally omitted; the recipient was already validated and frozen in the ballot at `startAnnualCycle()`

**Admin mutations:**

- `setApprovedNonprofit(nonprofit, approved)` (timelockOwner-only) — Manages the distribution whitelist
- `setGovernance(newGovernance)` (timelockOwner-only)
- `emergencySweep(token, to)` (timelockOwner-only)

**Views:**

- `approvedNonprofit(nonprofit)` — Whitelist status

### AnnualGovernance

**Vote-admin mutations:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (voteAdmin-only) — Builds the ballot, validates the ExtendOliveBranch whitelist, and snapshots voting power

**User mutations:**

- `castOfferingVote(cycleId, burn)` — Phase 1 vote
- `castNonprofitVote(cycleId, nonprofit)` — Phase 2 vote

**Permissionless execution:**

- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — Dispatches to whichever phase is ready; intended for keeper bots and community executors

**Owner (Timelock) admin:**

- `cancelCycle(cycleId)` — Only before Phase 1 has executed
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)`

**Views:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getNonprofitVotes(cycleId, nonprofit)`
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — Voting power at the cycle's snapshot block

### OBNStakingLens

Read-only analytics layer; holds no funds. Recreates display/analytics views removed from StakingPoolsV93 — all write calls remain on OBNStakingPools.

**Views:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — Mirrors AnnualGovernance's voting-power view for frontend convenience

**Admin:**

- `upgradeToAndCall(newImplementation, data)` (owner-only)

---

## 14) Final Word

If we are designing the financial rails for future generations, then we should be willing to ask a better question:

Can those rails help create a better world?

Crypto gave us something that did not exist before: the ability to code behavior into money. A digital asset no longer has to sit still. It can move by rule. It can reward by rule. It can route value by rule. It can become more than something people buy, sell, and speculate on.

That should matter.

Olive Branch Network was built from the belief that programmable money should not be indifferent. If we can design tokens to reward liquidity, secure networks, fund treasuries, and power governance, then we can also design them to support organizations doing verifiable good in the world.

OBN is an attempt to prove that contribution can be built directly into the asset itself.

Users do not need to give up their principal to participate. They do not need to make a separate donation. They do not need to choose between earning and helping. When users stake, they earn. When they claim, nonprofits receive. When the network grows, the contribution layer grows with it.

That is Proof-of-Contribution.

The protocol is intentionally simple at its core: users stake into nonprofit pools, rewards are split by contract, and a portion of emissions is routed toward real-world causes. The 99-pool model keeps the network focused. The hard-coded reward split keeps the system honest. ExtendOliveBranch gives the community a recurring way to direct additional nonprofit funding. TheOffering gives stakers a yearly choice between burning supply or extending more value toward nonprofits.

OBN is not built around extraction. It is built around alignment.

Users are rewarded for participating. Nonprofits receive ongoing support. Governance decides how the annual protocol streams are resolved. Every action leaves a transparent on-chain record.

This is not just a staking protocol.

It is a contribution engine.

It is a public-good layer.

It is an honest attempt to answer a question crypto has avoided for too long:

If we can code money to do almost anything, why not code it to do good?

Every stake becomes proof.

Every claim creates a record.

Every pool represents a cause.

And every year, the community decides how far to extend the olive branch.

---

## Appendix B — Deployed Contracts (Base Mainnet)

| Contract | Type | Address | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | Implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Network:** Base Mainnet (Chain ID: 8453)

**Key Notes:**

- OBNToken and OBNStakingPools use UUPS proxy pattern for governance-controlled upgrades
- TeamVesting and OBNTimeLock are non-upgradeable by design
- TheOffering and ExtendOliveBranch are non-upgradeable by design
- All admin functions on UUPS proxies route through OBNTimeLock (24-hour delay) via the 2-of-3 OPERATOR_SAFE

---

**Version:** 9.3 Proof-of-Contribution  
**Date:** May 2026  
**Last Updated:** June 14, 2026  

**Canonical Repository:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)