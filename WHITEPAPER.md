# Olive Branch Network Whitepaper v9.0

## Purpose

OBN is a staking protocol that turns on-chain participation into continuous funding for real-world charities—without sacrificing compelling yields for users. This paper covers the canonical contract suite, hard-coded guarantees, token economics, governance/upgradeability, security model, and the end-to-end process for onboarding and supporting charities.

## 1) Executive Summary

**Mission:** Make donating the path of least resistance by routing a fixed portion of staking emissions to verified charity wallets—automatically, transparently, and forever on-chain.

**Mechanism:** Users stake OBN in charity-specific pools. Emissions split is hard-coded: 88% stakers, 10% charity (minted per action directly to each pool's charityWallet), 1% Charity Fund, 1% Treasury.

**Design guarantees:**

- Fixed four-way split (88/10/1/1) at the contract level
- Equal APR per token across all pools at a given time (pool APRs normalize by design)
- One charityWallet per pool; no "retire/active" flags on pools
- Admin locks are increase-only and auto-shrink if balance falls; intended only for bootstrap
- Single minter: Only the staking contract can mint OBN after setMinterOnce
- Timestamp-based emission phases with a 10-year declining schedule
- **NEW v9.0:** Nonprofit self-stake protection, pool lifecycle management, atomic bootstrap migration, emergency force-exit controls

**Governance & Upgradability:** UUPS proxies for Token & Staking; ownership migrates to a DAO + timelock. A future upgradeable NFT module will attest to impact and participation.

---

## 2) Contract Suite

### 2.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

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
- 10% Charity Fund — dedicated for charity programs, including pool bootstraps
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

### 2.2 OBNStakingPools (timestamp phases, per-pool accounting, UUPS)

**Hard-coded reward split (BPS):**

- STAKER_BPS = 8_800 → 88% to users
- CHARITY_BPS = 1_000 → 10% to charity wallet
- CHARITY_FUND_BPS = 100 → 1% to Charity Fund
- TREASURY_BPS = 100 → 1% to Treasury

**Emission phases (initialized at deploy):**

- Years 0–2: 10.00% APY
- Years 2–4: 7.50% APY
- Years 4–6: 5.00% APY
- Years 6–8: 2.50% APY
- Years 8–10: 1.25% APY

Governance may append future phases contiguously; prior phases remain immutable.

**Equal APR per pool:** By construction, per-token APR depends only on the active phase, not on which pool you choose.

**Data model:** PoolInfo { address charityWallet; uint256 totalStaked; } (one wallet per pool).

#### 2.2.1 Core User Actions

**Bounded, per-pool endpoints:**
- `deposit(pid, amount)` — Stake OBN in a pool
- `depositFor(pid, amount, beneficiary)` — Stake on behalf of another address
- `depositWithPermit(...)` — Stake with ERC20 Permit (no separate approval)
- `withdraw(pid, amount)` — Withdraw unlocked balance
- `claim(pid)` — Claim pending rewards
- `claimFor(pid, user)` — Claim rewards for another address

**Charity mechanics:**
- 10% of rewards is minted per user action (claim, deposit, withdraw) directly to that pool's charityWallet
- 1% Charity Fund accrues continuously to a dedicated address; can perform bootstrap stakes via `charityFundBootstrap`
- No global TVL buffer; splits happen per-action for atomic execution

#### 2.2.2 NEW v9.0: Pool Lifecycle Management

**Shutdown mechanism:**
- `shutdownPool(pid)` — Blocks NEW deposits; claims and withdrawals continue
- Allows users to exit gracefully without pool removal
- Pool data remains intact for stakers

**Pool removal:**
- `removePool(pid)` — Soft-delete after pool is completely empty (totalStaked == 0)
- No PID reindexing; backward compatible
- **Treasury safety:** If legacy charity accrues before removal, it's flushed to the pool's charityWallet; if wallet is zero, it's redirected to treasury
- Prevents reward loss if users claim after removal

#### 2.2.3 NEW v9.0: Nonprofit Self-Stake Protection

**Policy:** Charities can receive exactly ONE permanent locked bootstrap deposit. All other self-staking is blocked.

**Enforcement:** The `_enforceCharitySelfStakePolicy` function checks:
- Is the beneficiary the pool's charity wallet?
- If yes, is this from charityFund AND locked AND their current balance is zero?
- If all true, allow it (first bootstrap). Otherwise, reject.

**Rationale:** Prevents accidental or malicious self-stakes by nonprofits that could break pool reward dynamics or enable attacks.

#### 2.2.4 NEW v9.0: Atomic Bootstrap Migration

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

#### 2.2.5 NEW v9.0: Emergency Force Exit

**Function:** `forceExitUserToSelf(pid, user, claimRewards)` (owner-only, nonReentrant)

**Behavior:**
- Force-exits a user from a pool, ignoring locks
- Returns principal to the user immediately
- Optionally mints pending rewards to user
- Clears lock, reward debt, and active staker counters

**Use case:** Emergency governance control for pool removal when users need recovery; used after a pool is shutdown.

#### 2.2.6 Charity Wallet Updates

**Function:** `updateCharityWallet(pid, newWallet)` (owner-only)

**Allows:** Updating a pool's charity address (e.g., if compromised or rotating to new address).

**Tracked via:** CharityWalletUpdated event.

#### 2.2.7 Lock Management

**Function:** `setLockedAmount(pid, user, amount)` (charityFund-only)

**Rules:**
- Can only INCREASE or keep same; never decrease
- Cannot exceed user's balance
- Locks auto-shrink if balance drops below lock amount
- Intended only for bootstrap deposits

**Observability:**
- `pendingRewards(pid, user)` — Returns GROSS pending amount
- `unlockedBalance(pid, user)` — Returns balance minus lock
- `getPoolAPR(pid)` — Returns user portion APR (88% of pool APY)
- `getGlobalStats()` — Pool count, total TVL, unique stakers, RPS
- `getPoolStats(pid)` — Charity wallet, total staked, unique stakers, per-share accumulator, last accrual time, all-time stats
- `getUserPoolView(pid, user)` — Staked, locked, unlocked, reward debt, pending, active status
- `stakeElapsed(user)` — Total staking seconds (persists across unstakes)

### 2.3 TeamVesting (linear, cliffed; non-upgradeable)

**Cliff:** ~4 months; **Duration:** ~20 months linear thereafter.

**`release()`:** Streams vested tokens to teamWallet.

**Helpers:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**Safety:** Cannot rescue the vested token; only stray ERC20s.

---

## 3) Token Economics & Long-Term Profitability

### 3.1 Emission math (intuition)

Let the phase APR basis be B (in BPS), global TVL G, and pool TVL P.

**Yearly gross to the pool:** YearlyPoolGross = P × (B / 10,000)

**Stakers receive 88% of that;** the rest routes to charity (10%), Charity Fund (1%), Treasury (1%).

**Per-token APR simplifies to** 0.88 × (B / 10,000), **equal across pools** — independent of supply size.

### 3.2 Declining emissions support value

**Sell-pressure decay:** Lower issuance over time reduces structural sell pressure.

**Cause-driven demand:** The charity buffer/fund accumulates for real organizations, seeding authentic use and alignment.

**TVL credibility:** Bootstrap locks create persistent TVL, improving confidence and price discovery.

**Predictability:** With splits and phases on-chain, participants can plan long-term.

### 3.3 Treasury minimalism (1%)

Users get 88%, charities get 10%, the Charity Fund gets 1%, and the Treasury gets 1%.
Capping Treasury at 1% keeps the protocol lean, reduces rent extraction risk, and keeps yields user/charity-centric.

### 3.4 Burnability (optional sink)

OBN is inflationary via staking, but voluntary burns (e.g., future app fees) can offset issuance—decentralized and market-driven.

---

## 4) Protocol Mechanics & Rationale

### 4.1 Charity distribution

**Per-action model:** On every claim/deposit/withdraw, 10% of the user's pending rewards is minted directly to that pool's charityWallet.

**Atomic execution:** No external calls or global buffers; all splits happen within the user's transaction.

**No allocation contention:** Each pool's charity is independent; no global reallocation function.

### 4.2 Charity Fund (1%) vs. Charity (Genesis Reserve, 10%)

**Charity (Genesis Reserve, 10%):** One-time genesis allocation held by governance for programmatic uses, primarily initial pool bootstraps (§5.5).

**Charity Fund (1% emissions):** Ongoing stream to a governance-controlled address to replenish capacity for future bootstraps and campaigns.

### 4.3 Permanent locks (bootstrap-only; increase-only)

**Policy:** Admin can only increase lockedAmount and never decrease it; locks auto-shrink if the user's balance drops below the stored lock.

**Purpose:** Purely for the bootstrap mechanism. Locks ensure the seeded principal cannot be withdrawn while letting the beneficiary earn yield day one. This preserves TVL integrity and protects against immediate dumping of seeded tokens.

**User stakes are unlocked by default;** users can always withdraw their unlocked balance.

### 4.4 No emission controller

Phases fully specify issuance; there's no external "rate knob." DAO may append future phases contiguously with notice (timelock).

---

## 5) Charities: Wallets, Onboarding & Display

### 5.1 One wallet per pool

Each pool maps to a single charityWallet. This keeps routing deterministic and reporting simple.

### 5.2 Address-first listing

We are indexing public Ethereum addresses that reputable organizations already publish and onboard them onto our platform.

In addition, we are reaching out to organizations through email and phone to let them know about our platform.

Every charity page shows a clear "No Affiliation / Not Endorsed" banner by default.

### 5.3 Bootstrap Program

**Objective:** Ensure each newly onboarded charity earns from day one and that pools start with credible TVL.

**Source of funds:** The 10% Charity (Genesis Reserve) is earmarked to bootstrap up to 100 charities at launch (1,000,000 OBN each = 100,000,000 OBN total).

**Mechanism:**

1. Governance (or the Charity Fund executor) calls `charityFundBootstrap(pid, amount, beneficiary)` or uses `depositForWithLock(pid, amount, beneficiary)` (charityFund-only).
2. The 1,000,000 OBN is staked and permanently locked for that charity's pool/beneficiary.
3. The lock prevents withdrawal of the seeded principal, eliminating immediate dump risk while the position earns yield continuously (staker share + the pool's 10% charity allocation routed to the charityWallet).

**Expansion after the first 100:** As the 1% Charity Fund from emissions accrues, governance can bootstrap additional charities in subsequent waves using the same 1,000,000 OBN per charity target (or a DAO-approved updated target).

**Reporting:** Each bootstrap is transparent on-chain and included in periodic public disclosures.

**Protection:** The `_enforceCharitySelfStakePolicy` ensures each charity can only receive one bootstrap position; future stakes must come from the charity itself or external users.

### 5.4 Delisting policy

If standards aren't met, we remove the nonprofit from our frontend and stop promoting that pool.

Users stake and pending rewards will all be returned to them before the pool is shutdown and removed from the protocol.

OBN is a routing & staking protocol, not a registered nonprofit or certifier. Users should independently verify organizations and consult tax professionals.

---

## 6) Governance & Upgradability

### 6.1 UUPS proxies (Token & Staking)

Upgrades require `_authorizeUpgrade` (owner).

**Progressive decentralization:**

1. Multisig owner
2. Timelock (with enforced delay)
3. ERC20Votes-based DAO

### 6.2 Hard-coded vs Governed

**Hard-coded (requires upgrade to change):**
- Four-way split: 88% / 10% / 1% / 1%
- 10-year emission schedule (changing every 2 years): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Admin lock semantics (increase-only, auto-shrink)
- Single-minter in OBNToken
- Nonprofit self-stake policy
- Bootstrap migration atomicity guarantees

**Governed (no upgrade needed):**
- Add pools (`addPool(charityWallet)`)
- Execute bootstrap stakes from the Charity Fund
- Append future phases contiguously (`addPhase`)
- Shutdown or remove pools (v9.0)
- Spend policies for Treasury & Charity Fund (with transparency reports)

### 6.3 NFT upgradability

**OBN Impact Badges (ERC-721/SBT):** Opt-in attestations for impact (donations, streaks, campaigns).

**Upgradeable metadata** to reflect live contribution stats.

**Privacy-respecting;** opt-in mint and display.

---

## 7) Security Model

### 7.1 Core principles

- **Checks-Effects-Interactions:** State updates before external calls
- **Reentrancy guards:** nonReentrant on all mutating paths
- **SafeERC20:** Used for all token transfers
- **Precision math:** Math.mulDiv for accurate calculations
- **No unbounded loops:** Per-pool endpoints, bounded updates

### 7.2 v9.0 Hardening

**Atomic operations:** Bootstrap migration, pool removal, force exit all complete atomically.

**Reward preservation:** Explicit validation that pending rewards are preserved during migration (to 1 wei tolerance).

**Lock overflow prevention:** NewLock ≤ userBalance enforced before setting locked amounts.

**Treasury fallback:** Stranded rewards redirected to treasury instead of lost.

**Emergency controls:** Force exit enables governance to recover users in emergencies.

### 7.3 Design trade-offs

Equal APR keeps focus on impact, not APR gaming.

Per-action charity minting is atomic but requires every action to mint (gas trade-off).

Appending phases centralizes some discretion; timelock + DAO voting mitigates.

---

## 8) Transparency & Reporting

**Events:**
- Deposit, Withdraw, Claim
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

**Views:**
- getGlobalStats, getPoolStats, getUserPoolView
- pendingRewards, getPoolAPR, pendingCharityFor
- unlockedBalance, stakeElapsed, isGloballyStaked

**Disclosures:** Quarterly public report of Charity (Genesis Reserve) balances, bootstraps executed, and Charity Fund (emissions) flows.

---

## 9) User Journey

1. **Acquire OBN** (DEX liquidity seeded from the 40% Liquidity allocation)
2. **Pick a pool by cause** — APR is equal across pools at a given time
3. **Stake** (`deposit`) or stake for another address (`depositFor`). Optionally use Permit to avoid a separate approval transaction
4. **Earn & do good:** Claims mint OBN to you; charity accrues and mints to the charityWallet
5. **Withdraw** any unlocked principal anytime. (Bootstrap locks do not apply to your self-stakes unless explicitly opted via `charityFundBootstrap`)

---

## 10) Token Supply & Distribution

**Initial Supply:** 1,000,000,000 OBN (current plan).

**Genesis distribution (on initialize):**
- 40% Liquidity
- 30% Airdrop
- 10% Charity (Genesis Reserve) — used chiefly for 1,000,000 OBN bootstrap stakes per charity (first 100), see §5.3
- 10% Treasury
- 10% Team (to TeamVesting; ~4-month cliff, ~20-month linear vest)

**Ongoing issuance:** Only via staking emissions; the staking contract is the sole minter.

**Voluntary burn:** Available via burn for future sinks.

---

## 11) Roadmap (Indicative)

- **DAO & Timelock:** Transfer upgrade authority; ratify Treasury/Charity policies
- **NFT Impact Badges:** Opt-in attestations with upgradeable metadata
- **Expanded reporting:** Per-charity transparency dashboards
- **Integrations:** Wallets, Farcaster actions, nonprofit tooling where appropriate
- **Phase extension (if needed):** Append contiguous phases with DAO approval
- **Further pool lifecycle features:** Advanced governance controls for exceptional circumstances

---

## 12) Appendix — Key Functions

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
- `getPoolAPR(pid)` — User portion APR
- `getGlobalStats()` — Global TVL, unique stakers, RPS
- `getPoolStats(pid)` — Per-pool statistics
- `getUserPoolView(pid, user)` — User-specific view
- `unlockedBalance(pid, user)` — Available to withdraw
- `stakeElapsed(user)` — Total staking seconds
- `getUserStats(user)` — Aggregated user data
- `poolLength()` — Number of pools

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

---

## Final Word

OBN aligns self-interest with public good: compelling user yields, credible charity funding, and a governance path that minimizes rent extraction. With hard-coded safeguards, a lean treasury, pool lifecycle controls for emergencies, and atomic bootstrap migration that protects both donors and charities, OBN is built for longevity—**do well by doing good.**

**v9.0 introduces critical governance controls:** nonprofit protection, pool lifecycle management, and safe bootstrap migration. These features enable the protocol to scale responsibly, protect charity participants, and respond to emergencies while maintaining the integrity of the staking mechanism.

---

## Appendix B — Deployed Contracts (Base Mainnet)

| Contract | Type | Address | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [View](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [View](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **OBNStakingPools (v9.0 Impl)** | Implementation | [0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b](https://basescan.org/address/0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b) | [Verified ✅](https://basescan.org/address/0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b#code) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [View](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [View](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Network:** Base Mainnet (Chain ID: 8453)

**Contract Verification:**
- ✅ OBNStakingPools v9.0 implementation verified on BaseScan (full source code transparent)
- OBNToken and other contracts verification pending

**Key Notes:**
- OBNToken and OBNStakingPools use UUPS proxy pattern for governance-controlled upgrades
- TeamVesting is non-upgradeable (immutable schedule)
- OBN Impact NFT supports future opt-in impact attestations
- All proxy contracts use timelock for governance safety

---

**Version:** 9.0
**Date:** November 2025
**Last Updated:** November 15, 2025

**Canonical Repository:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)
