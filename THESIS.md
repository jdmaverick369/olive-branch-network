# Non-Sacrificial Giving: A Protocol Answer to the Decline of Mass Charitable Participation

**Olive Branch Network Thesis**

*Olive Branch Network — Base Mainnet*

*July 2026*

---

## Abstract

Charitable giving in the United States presents a paradox: total dollars donated reach record highs nearly every year, while the number of people who give at all has been falling for a quarter century. The share of American households making any charitable contribution fell from 66.2% in 2000 to 49.6% in 2018, and donor counts have declined every year since 2021 even as total revenue grew. Philanthropy is consolidating into a smaller, wealthier donor class, hollowing out the mass participation on which the civic legitimacy of the nonprofit sector rests.

This thesis argues that the root of the participation collapse is structural, not moral: under every historical form of money — commodity, fiat, and early digital — giving is *sacrificial*. A donation permanently transfers principal from donor to recipient, so the threshold for participation is disposable surplus — a bar that a growing share of households can no longer clear as real income gains concentrate at the top of the distribution. Programmable money removes this constraint for the first time in monetary history. Because a smart contract can separate *ownership of an asset* from *direction of the yield that asset generates*, it becomes possible to design **non-sacrificial giving**: a donor retains their principal permanently while continuously routing a protocol-enforced share of its productivity to independently verifiable public benefit.

The Olive Branch Network (OBN) protocol is presented as a reference implementation of this design. The thesis (i) situates OBN within the long history of monetary technology; (ii) documents, with cited empirical data, the decline in charitable participation that motivates it; (iii) formalizes the protocol's participation–lock feedback loop, in which each additional participant transfers OBN tokens out of the circulating float and into non-custodial contract escrow, contracting effective supply as adoption grows; and (iv) provides a complete technical description of every core smart contract — `OBNToken`, `OBNStakingPools`, `TheOffering`, `ExtendOliveBranch`, `AnnualGovernance`, `OBNTimeLock`, `TeamVesting`, `OliveNFT`, and `OBNStakingLens` — including storage layouts, invariants, access-control structure, and upgrade-safety mechanics, as deployed on Base mainnet.

---

## Table of Contents

1. [Introduction](#chapter-1--introduction)
2. [A History of Money: From Commodity to Programmability](#chapter-2--a-history-of-money-from-commodity-to-programmability)
3. [The Empirical Decline of Charitable Participation](#chapter-3--the-empirical-decline-of-charitable-participation)
4. [The Participation–Lock Mechanism: Token-Flow Economics of OBN](#chapter-4--the-participationlock-mechanism-token-flow-economics-of-obn)
5. [The Core Contracts: A Complete Technical Description](#chapter-5--the-core-contracts-a-complete-technical-description)
6. [Security Architecture and Institutional Design](#chapter-6--security-architecture-and-institutional-design)
7. [Limitations, Threats to Validity, and Future Work](#chapter-7--limitations-threats-to-validity-and-future-work)
8. [Conclusion](#chapter-8--conclusion)
9. [References](#references)

---

## Chapter 1 — Introduction

### 1.1 Problem statement

Two long-run trends frame this work. First, the *breadth* of charitable giving is collapsing: the fraction of U.S. households that donate anything at all fell by nearly seventeen percentage points between 2000 and 2018 (Indiana University Lilly Family School of Philanthropy, 2021), and the post-2020 data show the decline accelerating rather than stabilizing (Fundraising Effectiveness Project, 2025). Second, the *depth* of giving is consolidating: total dollars reach record highs — $592.50 billion in 2024 (Giving USA, 2025) — because larger gifts from fewer, wealthier donors substitute for the millions of small donors who have exited.

The standard explanations — declining religiosity, wage stagnation, generational distrust of institutions — describe the phenomenon but do not resolve it, because they all reduce to the same structural constraint: **giving, as historically constituted, is the permanent alienation of principal.** A household participates in philanthropy only when it clears the threshold "I have enough surplus to afford the loss." As real disposable surplus concentrated at the top of the income distribution, participation concentrated with it.

### 1.2 Thesis statement

This thesis defends three claims:

1. **Historical claim.** Every prior monetary technology — from Lydian electrum to Federal Reserve liabilities to first-generation cryptocurrencies used as mere bearer instruments — makes the alienation of principal the *only* primitive available for giving. Programmable money is the first monetary form in which *ownership* and *yield-direction* are separable at the level of the money itself, rather than through trusted intermediaries (endowments, trusts, donor-advised funds) accessible mainly to the wealthy.

2. **Empirical claim.** Mass charitable participation is in secular decline, and the decline is concentrated precisely in the small-donor cohort for whom the sacrifice threshold binds most tightly. This claim is supported by peer-collected panel data (Philanthropy Panel Study), sector-wide transaction data (Fundraising Effectiveness Project), and macro estimates (Giving USA), reviewed in Chapter 3.

3. **Mechanism claim.** A protocol that (a) lets participants stake a token without surrendering it, (b) routes a fixed share of protocol emissions to verified nonprofits, and (c) locks staked principal in non-custodial escrow, produces a participation–supply feedback: each marginal participant removes tokens from the circulating float, so that — holding demand and emission policy constant — broader participation mechanically tightens effective supply. Chapter 4 formalizes this and states its assumptions honestly, including the countervailing force of reward emissions.

### 1.3 Contributions

- A synthesis of monetary history oriented around a single axis: *what the money itself can enforce* (Chapter 2).
- A consolidated, cited empirical record of the U.S. charitable-participation decline, 2000–2025 (Chapter 3).
- A formal token-flow model of the OBN staking economy, including the circulating-float identity, the emission/lock balance condition, and the governance-controlled burn sink (Chapter 4).
- The first complete written specification of the OBN core contract suite as deployed on Base and validated in a mainnet-fork test environment, covering every state variable, function, event, invariant, and upgrade path (Chapter 5), together with its security and institutional architecture (Chapter 6).

### 1.4 The protocol in one paragraph

Olive Branch Network is an ERC-20 token (`OBN`) on Base with a staking system of per-nonprofit pools. A participant deposits OBN into the pool of a nonprofit they wish to support. The deposit is never spent, transferred to the nonprofit, or put at risk of loss to the protocol; it can be withdrawn at any time (except for explicitly locked bootstrap positions). While staked, the protocol mints time-based emissions against the stake and splits every realized reward four ways at claim time: **88% to the staker, 10% to the pool's nonprofit, 1% to the commons vault (`TheOffering`), and 1% to the distribution vault (`ExtendOliveBranch`).** The commons vault's fate — burn or give — is decided annually by a two-phase, stake-weighted vote (`AnnualGovernance`), whose second phase directs the distribution vault's accumulated balance to a community-chosen nonprofit. The design realizes the Charter's Article I: *"to make it possible for a person to preserve ownership of their assets while continuously directing a portion of the value those assets generate toward independently accountable public benefit"* (OBN Charter, Art. I).

---

## Chapter 2 — A History of Money: From Commodity to Programmability

The purpose of this chapter is not antiquarian. Each stage in the history of money is read against one question: *what can the money itself enforce, and what must be delegated to trusted institutions?* The answer determines what forms of giving are possible at each stage.

### 2.1 Before coinage: gift, debt, and the barter myth

The folk theory of monetary origins — inconvenient barter yielding spontaneously to a medium of exchange — descends from Adam Smith (1776) and was formalized by Menger (1892), who modeled money as the emergent convergence on the most *saleable* commodity, and by Jevons (1875), who named the frictions it solves the "double coincidence of wants." Modern search-theoretic models (Kiyotaki & Wright, 1989) preserve this logic, and Kocherlakota (1998) distilled its deepest implication: money is technologically equivalent to a societal *memory* of who has contributed what — "money is memory."

Yet the anthropological record does not support pure barter economies as money's predecessor. Humphrey (1985) concluded that "no example of a barter economy, pure and simple, has ever been described, let alone the emergence from it of money." Graeber (2011) marshaled the ethnographic and Mesopotamian evidence that *credit and obligation precede coin by millennia*: temple and palace bookkeeping in Sumer (c. 3000 BCE) denominated debts in silver and barley long before anyone circulated silver as cash. The credit theory of money (Mitchell-Innes, 1913) and the state theory (Knapp, 1905/1924) — money as transferable debt, and money as that which the state accepts in payment of taxes — capture this older layer.

Two observations matter for what follows. First, the earliest "money" was already an *accounting technology* — a ledger — and its physical tokens were secondary. Second, in gift-and-obligation economies, giving was constitutive of social membership rather than a discretionary act of surplus disposal (Mauss, 1925). The reduction of giving to voluntary surplus-transfer is an artifact of later monetary forms, not a human constant.

### 2.2 Coinage: money as sovereign bearer instrument (c. 640 BCE – 1000 CE)

Standardized coinage appears in Lydia in the seventh century BCE — electrum pieces stamped by the state — and spreads with startling speed through the Greek poleis, Persia, India (punch-marked *karshapana*), and Warring-States China (Davies, 2002; Schaps, 2004). The coin's innovation is *verification at a glance*: the sovereign stamp collapses the assay problem, making value transferable between strangers without trust or record.

But note what the technology enforces and what it cannot. A coin enforces *bearer finality*: whoever holds it, owns it, absolutely. It cannot encode conditions, streams, splits, or reversions. Consequently the only giving primitive coinage supports is the outright transfer of the coin — pure sacrifice of principal. Anything more sophisticated (temple endowments, the Roman *alimenta*, the Islamic *waqf*, the medieval chantry) required wrapping money in a *legal institution* administered by trusted humans. Yield-directed giving existed — a waqf is precisely an asset whose income is perpetually directed to public benefit while the corpus is inalienable (Kuran, 2001) — but it was available only to those wealthy enough to constitute an institution around their assets.

### 2.3 Paper, banking, and the credit superstructure (1000–1971)

Song-dynasty China issued the first state paper money (*jiaozi*, formalized 1024 CE), discovering both convertible note issue and, within two centuries, inflationary over-issue (Von Glahn, 1996). In Europe, the sequence ran through bills of exchange, goldsmith receipts, the Bank of England (1694), and the nineteenth-century gold standard — a monetary order in which the money supply was disciplined by convertibility but the actual circulating medium was overwhelmingly bank *credit* (Ferguson, 2008; Eichengreen, 1996). The Bretton Woods system (1944) preserved a gold anchor at one remove; its suspension by the United States on 15 August 1971 (the "Nixon shock") completed the transition to pure fiat: money as an unbacked liability of the state, valued by decree, tax-acceptance, and network expectation — Knapp's chartalism realized in full (Eichengreen, 1996).

For giving, the fiat-banking era changed scale but not structure. Charitable deduction regimes (in the U.S., since 1917) subsidized sacrifice; the foundation, the charitable remainder trust, and the donor-advised fund industrialized the waqf pattern — *ownership retained or sheltered, yield directed* — but each requires legal formation, minimums, and advisors. The structural asymmetry persisted: **the wealthy give from yield; everyone else gives from principal.** Chapter 3 documents the predictable result.

### 2.4 Digital settlement and electronic fiat (1971–2008)

Between the Nixon shock and 2008, money dematerialized operationally — Fedwire, SWIFT (1973), card networks, and internet payments made most money bank-database entries — without changing its logic. Electronic fiat is still an IOU whose rules are enforced by regulated intermediaries. Chaum (1983) showed cryptography could create digital bearer cash, but his DigiCash centralized issuance and failed commercially; Dai's "b-money" (1998) and Szabo's "bit gold" (conceived in the late 1990s, published 2005) sketched decentralized issuance without solving double-spending.

### 2.5 Bitcoin: scarcity without a sovereign (2008)

Nakamoto (2008) solved the double-spend problem without a trusted party by combining a proof-of-work consensus over a public ledger with a fixed issuance schedule. Bitcoin's contribution to monetary history is precise: **digital scarcity and final settlement enforced by protocol rather than by institution.** For the first time, the *rules of the money* — its supply curve above all — were properties of the money itself.

Yet Bitcoin's script deliberately restricts expressiveness. As money, it remains close to the coin: a bearer instrument with a hard supply. Giving in Bitcoin is still alienation of principal.

### 2.6 Ethereum and programmable money (2015– )

Buterin (2014) generalized the blockchain into a Turing-complete state machine. With Ethereum — and EVM chains such as Base, where OBN deploys — money becomes *programmable*: arbitrary logic executes with the same finality as payment itself. The ERC-20 standard (Vogelsteller & Buterin, 2015) made tokenized value a composable primitive; ERC-4626, staking systems, and on-chain governance (e.g., Compound's Governor pattern) demonstrated that **custody, yield, voting, and disbursement can all be protocol properties.**

This is the hinge of the historical argument. The waqf/endowment pattern — corpus inalienable, usufruct directed to public benefit — required a trusted institution for a thousand years and was therefore a rich person's instrument. A smart contract implements the same pattern for any holder of any size, with:

- **non-custodial escrow** (the "endowment corpus" is held by immutable code, not a trustee);
- **continuous, revocable designation** (the participant may redirect or withdraw at any time — the Charter's Article III separability);
- **protocol-enforced splits** (the 88/10/1/1 division in OBN is arithmetic in `_mintSlices`, not a trustee's discretion);
- **verifiable recording** (every contribution is an on-chain event, satisfying Charter Article VI).

The history of money is, on this reading, a history of progressively internalizing into the money itself functions once delegated to institutions: verification (coinage), record (banking), scarcity (Bitcoin), and finally *fiduciary structure* (programmable money). OBN is an application of the final stage to the oldest monetary function of all — the gift.

---

## Chapter 3 — The Empirical Decline of Charitable Participation

This chapter establishes the second premise with published data: **the number of people who give is falling, persistently and across every major data source, even as total dollars rise.**

### 3.1 The long-run participation decline (Philanthropy Panel Study, 2000–2018)

The most rigorous longitudinal evidence comes from the Indiana University Lilly Family School of Philanthropy's *Philanthropy Panel Study*, a nationally representative panel of more than 9,000 U.S. households whose giving is tracked biennially.

- In **2000, 66.2% of U.S. households** made a charitable contribution.
- By **2018, only 49.6%** did — the first time on record that fewer than half of American households gave, and a drop of almost 17 percentage points (Lilly Family School of Philanthropy, 2021).
- Religious giving fell from **46% of households (2000–2004) to 29% (2018)**; secular giving fell from a 55–57% plateau (2000–2008) to **42% in 2018** (Lilly Family School of Philanthropy, 2021).
- Follow-up analysis found the decline **accelerated during the first year of the COVID-19 pandemic** (Lilly Family School of Philanthropy, *The Giving Environment*, 2022; NonProfit PRO, 2022), and that participation dropped across all racial and ethnic groups (The NonProfit Times, 2023).

The school's *Giving Environment* report attributes the decline partly to falling and stagnating incomes among middle- and lower-income households and to shifting norms around religious affiliation (Lilly Family School of Philanthropy, 2022) — both of which are expressions of the sacrifice threshold: households give when they can afford to lose the money, and fewer can.

### 3.2 Donor counts keep falling after 2018 (Fundraising Effectiveness Project, 2021–2025)

The Fundraising Effectiveness Project (FEP), which aggregates actual gift-transaction data across thousands of nonprofits, extends the record past the panel studies and shows the decline is ongoing:

- Donor counts have declined **every year since 2021** (AFP/FEP, 2026).
- From 2023 to 2024, the number of donors fell **4.5% year over year**, with the decline *accelerating* relative to prior years (FEP Q4 2024 report; GlobeNewswire, 2025).
- In **2025, donor counts fell another estimated 3.6%**, even as total charitable dollars grew 5.0% — the strongest revenue growth in five years, achieved with fewer givers (AFP/FEP, 2026).
- The attrition is concentrated at the small end: donors giving **$1–$100 — who constitute over half of all donors — declined 8.8% in 2024 and 11.1% year-over-year in Q1 2025** (FEP; NonProfit PRO, 2025).
- Overall donor retention hovers around **43%**, and new-donor retention is far lower, meaning most first-time givers never give again (FEP, 2025–2026).

The FEP's own framing is exactly the consolidation thesis: revenue gains are "concentrated in larger gifts," with "ongoing declines in total donor counts" (AFP, 2025).

### 3.3 Dollars up, donors down (Giving USA, 2024–2025)

Giving USA, the longest-running macro estimate of U.S. philanthropy, completes the paradox:

- Total giving reached **$592.50 billion in 2024**, a record in current dollars, up 6.3% nominally and 3.3% inflation-adjusted (Giving USA 2025).
- Total giving rose again to an estimated **$617.2 billion in 2025** (Giving USA 2026; Give.org, 2026).
- But **individual giving's share of the total fell from roughly 80% in 1986–1990 to 66% in 2024 and 64% in 2025**, as foundations, bequests, and corporations — vehicles of accumulated wealth — take up the slack (Giving USA 2026; Give.org, 2026; Stelter, 2026).

### 3.4 Synthesis: the sacrifice threshold

Across three independent methodologies — household panel (PPS), transaction aggregation (FEP), and macro estimation (Giving USA) — the same picture emerges:

| Indicator | Then | Now | Direction |
|---|---|---|---|
| Households giving anything (PPS) | 66.2% (2000) | 49.6% (2018) | ↓ 16.6 pts |
| Households giving to religion (PPS) | 46% (2000–04) | 29% (2018) | ↓ 17 pts |
| Donor count, year-over-year (FEP) | — | −4.5% (2024), −3.6% (2025) | ↓ accelerating |
| Small donors $1–$100 (FEP) | 50–57% of all donors | −8.8% to −11.1% YoY | ↓ sharpest cohort |
| Individuals' share of total giving (Giving USA) | ~80% (1986–90) | 64% (2025) | ↓ 16 pts |
| Total dollars (Giving USA) | — | $592.5B (2024), $617.2B (2025) | ↑ record highs |

The sector is being recapitalized from the top while its participatory base erodes. This is precisely what one predicts if giving requires surplus and surplus has concentrated. The nonprofit sector's *funding* problem is being solved by the wealthy; its *participation* problem — the civic, democratic, legitimating function of millions of small gifts — is not being solved at all, because no instrument exists that lets a non-wealthy household give continuously without loss.

Chapter 4 describes such an instrument.

---

## Chapter 4 — The Participation–Lock Mechanism: Token-Flow Economics of OBN

This chapter formalizes the protocol's economic core: **participation locks supply.** Every claim is grounded in specific contract code described fully in Chapter 5; here we treat the system as a token-flow machine.

### 4.1 The five genesis allocations

`OBNToken.initialize` mints the entire initial supply exactly once, in fixed proportions (OBNToken.sol):

| Allocation | Share | Purpose |
|---|---|---|
| Liquidity | 40% | DEX liquidity so the token can be acquired |
| Airdrop | 30% | Seeding broad initial distribution |
| Charity fund | 10% | Bootstrapping nonprofit pool positions (permanently locked — §4.4) |
| Treasury | 10% | Protocol operations (a one-time genesis allocation; no emission stream flows to it) |
| Team vesting | 10% | Time-locked in `TeamVesting` (4-month cliff, 20-month linear) |

No further minting is possible except by the single, set-once minter — the staking contract — so *all* post-genesis supply growth is staking emissions.

### 4.2 The circulating-float identity

Define at time *t*:

- **S(t)** — total supply: genesis supply plus cumulative emissions minus cumulative burns.
- **K(t)** — tokens held by the staking contract: the sum of all `userAmount` balances (principal only; rewards are minted directly to recipients, never pooled).
- **V(t)** — tokens still locked in `TeamVesting`.
- **G(t)** — tokens accumulated in the two governance vaults (`TheOffering` and `ExtendOliveBranch`) awaiting the annual cycle.
- **B(t)** — cumulative tokens burned (via `TheOffering.burn` and any voluntary `ERC20Burnable.burn`).

Then the **circulating float** — supply actually available to trade — is:

> **F(t) = S(t) − K(t) − V(t) − G(t)**   with   **S(t) = S₀ + E(t) − B(t)**

where E(t) is cumulative gross emissions. The mechanism claim is a statement about ∂F/∂(participation): **every deposit moves tokens from F into K one-for-one** (`_depositCore` executes `safeTransferFrom(msg.sender, address(this), amount)`), and the tokens remain in K until that specific participant chooses to withdraw. The protocol never lends, rehypothecates, or spends K; there is no slashing and no protocol claim on principal. K is inert escrow.

### 4.3 Emission policy: decaying and participation-proportional

Emissions are *not* a fixed faucet. `_sumRewardAcrossPhases` accrues rewards per pool as `poolStake × bps × Δt / (10000 × 365 days)` — i.e., an **annualized percentage of what is actually staked**, on a declining schedule:

| Years since deployment | Annual emission rate (on staked balance) |
|---|---|
| 0–2 | 10.00% |
| 2–4 | 7.50% |
| 4–6 | 5.00% |
| 6–8 | 2.50% |
| 8–10 | 1.25% |
| 10+ | 3.00% fallback (`FALLBACK_EMISSION_BPS`), until governance amends via `addPhase` |

Two consequences follow. First, **emissions scale with K, not with S**: tokens that sit unstaked generate nothing. Second, because rewards are minted only on *claim events* (deposit, withdraw, claim), unclaimed rewards are merely an accounting entry (`accRewardPerShare × balance − rewardDebt`) — they do not exist as tokens until realized.

### 4.4 The four-way split and its sinks

At every realization, `_mintSlices` divides the gross pending reward:

- **88% → the staker.** The participant's yield. Newly minted, enters F (or is restaked).
- **10% → the pool's nonprofit wallet.** The gift. Continuous, protocol-enforced, proportional to the participant's stake and time. This is the *Contribution* of Charter Article VII, and it costs the staker no principal — only a share of yield that would not exist without the protocol.
- **1% → `TheOffering`** (the commons vault). Accumulates all year; each annual governance cycle votes to **burn** it (deflationary sink, reduces S) or **give** it (transfers to `ExtendOliveBranch`).
- **1% → `ExtendOliveBranch`** (the distribution vault). Accumulates all year; each annual governance cycle's Phase 2 vote directs the entire balance to one community-chosen, whitelisted nonprofit (or rolls it over if no one votes).

Note that **no emission stream flows to a treasury**: the two residual slices both feed governance-controlled vaults. Until their annual disposition, both streams sit in vault escrow (G in §4.2) — outside the tradeable float.

Additionally, the 10% charity-fund genesis allocation is deployed through `charityFundBootstrap`/`depositForWithLock`, which stakes tokens *on behalf of each nonprofit's own wallet* with `lockedAmount` set equal to the deposit — a **permanent lock** (locks can only be increased, never decreased). Bootstrap positions therefore contribute to K forever, guarantee every pool a baseline reward stream to its nonprofit, and can never be dumped.

### 4.5 The participation–lock feedback loop

Assemble the pieces. Let *n* be the number of active participants and *k̄* the average stake. Then K = n·k̄ (plus bootstrap locks), and:

1. **Adoption tightens float.** Each new participant converts float tokens into escrowed principal: ΔF = −Δstake. With demand held constant, a shrinking tradeable float raises the market-clearing price — the standard supply–demand result, and the on-chain analogue of the "float shrink" long observed in proof-of-stake economies where high staking ratios reduce liquid supply.
2. **Yield rewards patience, and 88% of yield can compound.** Stakers who restake their 88% share move newly minted tokens straight back into K, further tightening F.
3. **The gift stream funds real-world legitimacy.** The 10% nonprofit stream gives external institutions a durable reason to promote participation, which recruits more participants — the only marketing channel that is itself a charitable act.
4. **Governance can convert the commons into pure deflation.** A BURN outcome in Phase 1 destroys the accumulated commons stream, reducing S outright. Note the default is deliberately deflationary: *zero participation → BURN* (GIVE must *strictly* exceed BURN).
5. **Voting power requires staying staked.** Governance weight is a checkpointed snapshot of staked balance (`getPastVotingPower` over `Checkpoints.Trace208`), so influence over the annual burn/give and nonprofit selection accrues only to those whose tokens remain in K at the snapshot block. Governance participation is thus a *third* independent motive to keep tokens locked, alongside yield and giving.

The loop: **more participants → more tokens locked → smaller float and larger cumulative burn option → improved price support → higher yield value and higher gift value per token → stronger recruitment → more participants.**

### 4.6 Honest accounting: the emission counterweight

A doctoral treatment must state the opposing force. Emissions are inflationary: at the initial 10% rate, S grows in proportion to K. Whether net float *shrinks* depends on the realized flows. Differentiating the float identity, the emission flow entering the float is:

> **dF/dt ≈ e·K·[0.88·(1−r) + 0.10 + 0.02·(1−β)·δ] − dK/dt**

where *e* is the current emission rate, *r* the fraction of staker rewards restaked, *β* the fraction of the vault streams ultimately burned in Phase 1, and *δ* ≤ 1 a lag factor reflecting that the two 1% vault streams enter the float only after the annual cycle distributes them (burned amounts never enter at all; rollovers defer entry further). Float contracts (dF/dt < 0) whenever **net new staking outpaces the un-restaked portion of emissions**. Structural features push in that direction — the emission schedule decays 10% → 1.25% while adoption is intended to grow; nonprofit recipients are mission-driven sellers but their inflow is only 10% of emissions; the burn default removes the commons permanently; bootstrap locks never exit — but the condition is empirical, not guaranteed. The claim defended here is therefore precisely bounded: *the protocol is engineered so that participation growth mechanically contracts float and creates conditions that support the token price, ceteris paribus; it does not and cannot guarantee price appreciation, which also depends on exogenous demand.*

### 4.7 Non-sacrificial giving, restated

The economic design resolves the Chapter 3 problem directly. The participation threshold is no longer "surplus I can afford to lose" but "capital I am willing to park." The household that could never donate $500 can stake $500, keep it, withdraw it in an emergency, and meanwhile continuously direct 10% of the yield its stake generates — real, protocol-enforced, publicly recorded contributions — to a verified nonprofit. Giving becomes an *asset-allocation decision* rather than a *consumption sacrifice*. That is the design's answer to the participation collapse: not exhorting people to give more, but removing the structural reason they stopped.

---

## Chapter 5 — The Core Contracts: A Complete Technical Description

All contracts target Solidity ^0.8.28, build on OpenZeppelin v5, and are deployed on Base. Upgradeable contracts use the UUPS pattern (`_authorizeUpgrade` gated to the owner, which is the `OBNTimeLock`). This chapter describes every contract in the suite: purpose, storage, functions, events, invariants, and interactions.

### 5.1 `OBNToken` — the monetary base (OBNToken.sol)

**Inheritance.** `Initializable`, `IOBNMintable`, `ERC20Upgradeable`, `ERC20PermitUpgradeable` (EIP-2612 gasless approvals), `ERC20VotesUpgradeable` (checkpointed delegation), `ERC20BurnableUpgradeable`, `OwnableUpgradeable`, `UUPSUpgradeable`.

**Identity.** Name "Olive Branch Network", symbol "OBN".

**Storage.** A single custom variable — `address public minter` — plus a `uint256[100] __gap` reserving upgrade headroom.

**Initialization.** `initialize(initialOwner, initialSupply, liquidityAddress, airdropAddress, charityAddress, treasuryAddress, teamVestingAddress)` runs once (initializer modifier; the constructor calls `_disableInitializers()` so the implementation itself can never be initialized). After zero-address and nonzero-supply checks it mints the full distribution: 30% airdrop, 40% liquidity, 10% charity, 10% treasury, 10% team vesting (§4.1).

**Minter mechanics.** `setMinterOnce(addr)` — owner-only, requires `minter == address(0)`: the minter can be set **exactly once** for the lifetime of the implementation (only a full UUPS upgrade could change it). `mint(to, amount)` requires `msg.sender == minter`. In deployment the minter is the `OBNStakingPools` proxy; therefore *all future supply is staking emissions*. `isMinter(addr)` is a convenience view.

**Overrides.** OZ v5 routes all balance changes through `_update`, so a single override reconciles `ERC20Upgradeable` and `ERC20VotesUpgradeable` (vote checkpoints track transfers automatically). `nonces()` is overridden to reconcile `ERC20PermitUpgradeable` with `NoncesUpgradeable`.

**Security properties.** No pausability, no blacklist, no transfer tax: the token is maximally neutral. Burning is available to any holder via `ERC20Burnable` — the hook `TheOffering` uses to destroy the commons.

### 5.2 `OBNStakingPools` — the engine (StakingPoolsV93.sol; version string "9.3")

The staking contract is the largest and most consequential contract in the system: it is the sole OBN minter, the custodian of all staked principal (K in §4.2), and the voting-power oracle for governance. It runs behind a UUPS proxy at a stable address.

#### 5.2.1 Constants — the immutable split

```solidity
STAKER_BPS = 8800; CHARITY_BPS = 1000; CHARITY_FUND_BPS = 100; TREASURY_BPS = 100;
TOTAL_BPS = 10000; FALLBACK_EMISSION_BPS = 300;
```

The 88/10/1/1 split is `constant` — compiled into the bytecode, unchangeable without a full implementation upgrade through the timelock. The two 100-bps slices are minted to the addresses held in the `treasury` and `charityFund` storage variables; **in the deployed configuration those variables hold `TheOffering` (0xc75B…E341) and `ExtendOliveBranch` (0xE1Bb…6d8B) respectively** — the identifiers are historical, and the operative recipients of both 1% streams are the two governance vaults (§5.3, §5.4). `FALLBACK_EMISSION_BPS` is the 3% perpetual floor applied after the defined phase schedule is exhausted (§4.3).

#### 5.2.2 Storage layout

Slot-ordered and upgrade-critical (the contract documents its slot map; the trailing gap is `uint256[93]`):

- **Config:** `stakingToken` (the OBN token as `IOBNMintable`), `treasury` (→ TheOffering), `charityFund` (→ ExtendOliveBranch), `version` (string, "9.3").
- **Emission schedule:** `Phase[] phases`, each `{start, end, bps}` in timestamps.
- **Pools:** `PoolInfo[] poolInfo`, each `{charityWallet, totalStaked}` — one pool per nonprofit.
- **User accounting:** `userAmount[pid][user]`, `userRewardDebt[pid][user]` — the accumulator/reward-debt pattern (§5.2.3).
- **Accumulators:** `accRewardPerShare[pid]` (scaled 1e12), `lastRewardTime[pid]`.
- **Global:** `globalTotalStaked`.
- **Locks:** `lockedAmount[pid][user]` — the permanent-lock ledger (§4.4).
- **Statistics:** `totalClaimedByUser`, `totalDepositedByUser`, `totalWithdrawnByUser`, per-pool deposit/withdraw/charity-minted totals, `uniqueStakersByPool`, `uniqueStakersGlobal`, `activePoolCount[user]`, `stakedSince[user]`, `cumulativeStakeSeconds[user]` (persists across full unstakes — a permanent tenure record).
- **Lifecycle:** `poolRemoved[pid]` (deposits disabled), `poolFullyRemoved[pid]` (struck from governance ballots — set only by `removePool`, never by `shutdownPool`).
- **Contribution tracking:** `charityContributedByUserInPool[pid][user]` and `totalCharityContributedByUser[user]` — each participant's lifetime attributable giving, the on-chain *Record* of Charter Article VI.
- **Governance plumbing (slots 28–30):** `charityFundOperator` + `_migrationExecuted` + `upgradeBlock` (packed into one slot), `totalStakedByUser[user]` (running cross-pool total), and `_stakeCheckpoints[user]` (`Checkpoints.Trace208` — the voting-power history). `poolFullyRemoved`, listed under Lifecycle above, occupies slot 31.

#### 5.2.3 The accounting model

OBN uses the accumulator/reward-debt scheme with a decisive variation: **the accumulator tracks GROSS rewards.** On any pool touch, `_accruePool` computes the gross emission since `lastRewardTime` via `_sumRewardAcrossPhases` — which walks the phase schedule segment by segment, handling phase boundaries exactly with `Math.mulDiv(poolStake, bps × duration, 10000 × 365 days)`, and applies the 3% fallback rate to any interval beyond the last defined phase — and folds it into `accRewardPerShare[pid] += grossReward × 1e12 / totalStaked`. A user's pending gross is then:

> `pending = userAmount × accRewardPerShare / 1e12 − userRewardDebt`

The split into 88/10/1/1 happens only at realization inside `_mintSlices`, which follows strict checks-effects-interactions: all statistics are updated *before* the four external `mint` calls. Nothing is minted for a pool with zero stake (the accrual early-returns and just advances the clock), and rewards never sit in the contract — they go straight from mint to final recipient. A public `sumRewardAcrossPhases` wrapper exposes the phase-walk for the read-only Lens (§5.9).

#### 5.2.4 User-facing functions

- **`deposit(pid, amount)`** — stake into a pool. Requires a valid, non-shutdown pool. Effects: accrue pool; register unique staker (per-pool and global, with `stakedSince` starting the tenure clock at 0→1 pools); increase `userAmount`, `poolInfo.totalStaked`, `globalTotalStaked`, deposit stats; reset reward debt; push a `(block.number, totalStakedByUser)` checkpoint; then `safeTransferFrom` the principal in and `_mintSlices` any pending reward. Depositing *realizes* pending rewards as a side effect.
- **`depositFor(pid, amount, beneficiary)`** — third-party funding of another address's stake (payroll-style giving, gifts of participation).
- **`depositWithPermit(...)`** — single-transaction approve+stake via EIP-2612.
- **`withdraw(pid, amount)`** — exit. Enforces `amount ≤ userAmount − lockedAmount` (the *unlocked* balance); updates all balances, checkpoints, and hooks (`_afterWithdrawBalanceHooks` clamps locks to the new balance, clears active-staker flags at zero, and on the last pool exit banks the session into `cumulativeStakeSeconds` and decrements `uniqueStakersGlobal`); transfers principal back; realizes pending rewards through the same 88/10/1/1 split. **No cooldown, no penalty, no fee** — Article III separability demands frictionless exit.
- **`claim(pid)` / `claimFor(pid, user)` / `claimMultiple(pids)`** — realize rewards without touching principal. `claimFor` is permissionless but can only send rewards to their rightful owner (it mints *to `user`*, not to the caller); this enables keeper-automated compounding for nonprofits.
- **View suite:** `pendingRewards`, `getPoolInfo`, `getUserStakeValue`, `unlockedBalance`, `poolLength`, `isGloballyStaked`, `stakeElapsed`, `currentRewardsPerSecond` (heavier analytics live in the Lens — §5.9).

#### 5.2.5 Charity-fund bootstrap and the self-stake freeze

`charityFundBootstrap(pid, amount, beneficiary)` / `depositForWithLock(...)` — callable only by `charityFund` or the `charityFundOperator` (an operations Safe), only for the pool's own charity wallet, and routed through `_enforceCharitySelfStakePolicy`, which permits **exactly one** locked bootstrap deposit per pool charity: the charity wallet must have a zero balance, the caller must be authorized, and the deposit must be locked. All other self-staking by a pool's nonprofit is rejected ("charity self-stake disabled"). Rationale: a nonprofit staking into its own pool would route the 10% charity slice back to itself, compounding into a governance-weight flywheel; the freeze confines nonprofit positions to the one transparent, permanently locked bootstrap.

`setLockedAmount(pid, user, amount)` — charityFund or operator (the operator restricted to pool-charity addresses) may **only increase** locks, never decrease, and never above the user's balance. Locks are one-way by construction.

#### 5.2.6 Administrative functions (all behind the timelock-owned `onlyOwner`)

- **`addPool(charityWallet)`** — create a pool for a nonprofit; initializes its accrual clock.
- **`shutdownPool(pid)`** — blocks *new* deposits; claims and withdrawals continue so users can always exit. Shutdown pools remain governance-ballot-eligible.
- **`removePool(pid)`** — only when `totalStaked == 0`; flushes legacy charity accruals, sets `poolFullyRemoved` (striking the nonprofit from future ballots), and re-points the pool's charity wallet at the `treasury` address (TheOffering) so any residual mints can never strand at address(0).
- **`updateCharityWallet(pid, newWallet)`** — rotate a compromised or migrated nonprofit wallet.
- **`migrateBootstrap(pid, old, new)`** — move an entire bootstrap position (balance, reward debt, lock) between nonprofit addresses atomically, threading voting-power checkpoints through both sides, with an on-chain proof that pending rewards are preserved to within 1 wei (`pendingAfter ≥ pendingBefore && pendingAfter ≤ pendingBefore + 1`).
- **`addPhase(start, end, bps)`** — append emission phases; must be contiguous with the last. This is also governance's lever over the 3% fallback rate.
- **`forceExitUserToSelf(pid, user, claimRewards)`** — emergency: return a user's entire principal *to the user themselves* (never to the admin), optionally realizing rewards, ignoring locks. The admin cannot confiscate; it can only force-return.
- **`sweep(token, amount)`** — recover stray ERC-20s to the `treasury` address, **explicitly excluding the staking token** ("Cannot sweep staking token") so admin can never touch K.
- **`migrateV93(newTreasury, newCharityFund, newOperator)`** — the one-time wiring function, executed atomically with the implementation deployment via `upgradeToAndCall` through the timelock. It set `treasury` → TheOffering, `charityFund` → ExtendOliveBranch, and `charityFundOperator` → the operations Safe; recorded `upgradeBlock` as the genesis anchor for voting-power checkpoints; and permanently disabled itself (`_migrationExecuted`).
- **`upgradeTo(newImpl, data)` / `setVersion`** — UUPS upgrade path compatible with timelock scheduling.

#### 5.2.7 Checkpointed voting power

Staked balances are *snapshot-queryable* so governance can weight votes at a fixed past block rather than trusting current balances (which would invite flash-stake attacks):

- Every deposit, withdrawal, and bootstrap migration pushes `(block.number, totalStakedByUser)` into a per-user `Checkpoints.Trace208`.
- **Genesis bootstrap:** stakers whose positions predate the checkpoint system have no history entries. Three complementary paths initialize them at `upgradeBlock`: `_initializeCheckpointIfNeeded` (automatic, on the user's next interaction, before any balance change); `bootstrapCheckpoint(user)` (permissionless — anyone can initialize anyone); and `batchBootstrap(users[])` (permissionless bulk ceremony). `AnnualGovernance` also lazily bootstraps voters on their first vote attempt (§5.5).
- **`getPastVotingPower(user, blockNumber)`** — binary-search lookup (`upperLookup`) of the user's staked total at any past block; **`checkpointCount(user)`** exposes initialization status.
- Voting power is thus **1 staked OBN = 1 vote, at the snapshot block** — unstaked tokens carry no governance weight, reinforcing the participation–lock loop (§4.5).

### 5.3 `TheOffering` — the commons vault (TheOffering.sol)

A deliberately minimal, **non-upgradeable** vault receiving a 1% share of all OBN staking emissions throughout the year. No ETH handling; two roles only:

- `timelockOwner` (immutable, set at construction) — may `setGovernance(addr)` (address(0) pauses governance) and `emergencySweep(token, to)` (full-balance ERC-20 recovery, the pre-distribution override).
- `governance` (the `AnnualGovernance` proxy) — may call exactly two functions, both post-vote: **`burn(amount)`** (invokes OBN's `ERC20Burnable.burn`, destroying supply) or **`sendToExtend(amount)`** (SafeERC20 transfer to `ExtendOliveBranch`).

Deployment order matters and is documented in-contract: `ExtendOliveBranch` first (its address is an immutable here), governance wired later. The contract holds the year's accumulated commons and does nothing else — an attack surface of two guarded functions.

### 5.4 `ExtendOliveBranch` — the distribution vault (ExtendOliveBranch.sol)

The second non-upgradeable vault, receiving its own 1% share of all staking emissions plus any GIVE-outcome transfers from `TheOffering`. Storage: immutable `obn` and `timelockOwner`; mutable `governance`; `mapping(address => bool) approvedNonprofit` — the **whitelist** implementing Charter Article IV (recipient legitimacy must be independently verified, not self-declared).

Two distribution paths, deliberately asymmetric:

- **`distribute(nonprofit, amount)`** — timelockOwner or governance; *whitelist enforced*. Manual/pre-governance/emergency channel.
- **`distributeFromGovernance(nonprofit, amount)`** — governance only; **whitelist intentionally omitted**, with the rationale documented in-contract: the recipient was validated against the whitelist when the ballot was frozen at `startAnnualCycle()`, and *a completed community vote must not be invalidatable by a post-hoc whitelist revocation* (vote finality over admin discretion). The timelock retains `emergencySweep` as the pre-distribution override if a recipient is compromised before execution.

Admin: `setApprovedNonprofit(addr, bool)`, `setGovernance(addr)`, `emergencySweep(token, to)` — all timelock-only.

### 5.5 `AnnualGovernance` — the two-phase annual cycle (AnnualGovernance.sol)

UUPS-upgradeable, owned by the timelock. Implements Charter Article V: value claimed by no individual designation is governed collectively by the participants who generated it.

**The cycle state machine.** `CycleState ∈ {INACTIVE, PHASE1_OPEN, PHASE1_READY, PHASE2_OPEN, PHASE2_READY, COMPLETED, CANCELLED}`, derived (never stored) by `getCycleState` from timestamps and execution flags — eliminating state-desynchronization bugs.

**Cycle storage.** `mapping(uint256 => Cycle) _cycles` where `Cycle` packs timing (`snapshotBlock` uint48, `phase1End`/`phase2Duration`/`phase2End` uint64), Phase 1 tallies (`burnVotes`, `giveVotes`, `phase1Outcome`), the Phase 2 ballot (`address[] ballot` + `onBallot` mapping for O(1) membership + `nonprofitVotes`), double-vote guards (`votedPhase1`, `votedPhase2`), and execution flags. The struct layout is documented as frozen — nested mappings' slot derivations are position-keyed, so reordering would silently corrupt live cycles. Linear storage slots 0–7 are explicitly commented (OZ v5's ERC-7201 namespaced storage keeps parent contracts out of linear slots), with a 50-slot gap.

**Roles.** `owner` (timelock): cancel cycles, set `voteAdmin`, set `maxBallotSize`, authorize upgrades. `voteAdmin` (a Gnosis Safe): the single function `startAnnualCycle`. Vote casting and execution are **permissionless**.

**`startAnnualCycle(phase1Duration, phase2Duration)`.** Requires both durations ≥ 1 day and the previous cycle COMPLETED/CANCELLED. Builds the ballot from every pool with `poolFullyRemoved == false` (active *and* shutdown pools — a nonprofit being closed to new deposits doesn't strip its constituency of a vote), deduplicates charity wallets (O(n²), bounded by the owner-configurable `maxBallotSize`, designed for ≤ 100), rejects empty ballots, and **requires every ballot address to be whitelisted in `ExtendOliveBranch`** — a cycle that could not be executed is never allowed to start. The snapshot is taken at `block.number − 1` so stake deposited in the same block as cycle start can never count — closing the flash-stake window completely when combined with checkpointed lookups.

**Voting.** `castOfferingVote(cycleId, burn)` during PHASE1_OPEN; `castNonprofitVote(cycleId, nonprofit)` during PHASE2_OPEN (must be on ballot). Both: one vote per address per phase; automatic lazy bootstrap of un-checkpointed stakers via `try stakingPools.bootstrapCheckpoint(msg.sender) {} catch {}` (idempotent, failure-safe); power = `getPastVotingPower(voter, snapshotBlock)`, required > 0. Both phases share the single cycle-start snapshot.

**Execution — permissionless, credibly neutral.**

- `executePhase1(cycleId)` after `phase1End`: outcome is **GIVE only if `giveVotes > burnVotes` strictly; ties and zero participation default to BURN** — the protocol's default posture is deflation, and moving the commons to a spendable state requires an affirmative majority. Calls `theOffering.burn(bal)` or `theOffering.sendToExtend(bal)` with the *full* balance. Sets `phase2End = now + phase2Duration` — Phase 2 always gets its full window no matter how late Phase 1 executes.
- `executePhase2(cycleId)` after `phase2End`: linear scan of the ballot; **most votes wins; ties go to the lowest ballot index** (deterministic); **zero participation → rollover** (funds remain for next year — never distributed without a mandate). Winner receives the *entire* `ExtendOliveBranch` balance via `distributeFromGovernance`.
- `executeCurrentCycle()` — keeper-friendly dispatcher that detects READY states on `currentCycleId`.

**Safety rails.** `cancelCycle` is owner-only and available *only until Phase 1 executes* — once `TheOffering` has acted, the cycle must run to completion (no takebacks after irreversible effects). `_authorizeUpgrade` **reverts if a cycle is mid-flight** (must be COMPLETED/CANCELLED/INACTIVE), stacking an on-chain guard atop the timelock's 24-hour delay. Views (`getCycleSummary`, `getBallot`, `getNonprofitVotes`, `hasVotedPhase1/2`, `getVotingPowerForCycle`) expose the full cycle state for frontends and auditors.

### 5.6 `OBNTimeLock` — the constitutional delay (OBNTimeLock.sol)

A bare subclass of OpenZeppelin's `TimelockController(minDelay, proposers, executors, admin)`, deployed with a 24-hour minimum delay. It owns every upgradeable contract (token, staking, governance, lens) and holds the `timelockOwner` role in both vaults. Its brevity is the point: all complexity lives in the battle-tested OZ implementation, and every privileged action in the system — upgrades, pool administration, whitelist changes, governance wiring, emergency sweeps — must be publicly scheduled and survive a full day of scrutiny before execution. The timelock converts "admin keys" into "advance public notice."

### 5.7 `TeamVesting` — aligned insiders (TeamVesting.sol)

Non-upgradeable `Ownable` vault for the 10% team allocation. Immutables: `token`, `start`. Constants: `CLIFF = 4 × 30 days`, `DURATION = 20 × 30 days` post-cliff. `vestedAmount()` computes linear vesting over `(balance + released)` so the math is robust to top-ups; `release()` (permissionless) follows CEI (effects, event, then transfer) and pays the `teamWallet`. UI helpers (`claimableNow`, `timeUntilCliff`, `timeUntilNextRelease`, `nextReleaseTimestamp`) expose a friendly daily-tick model over the continuous linear schedule. `updateTeamWallet` is owner-only; `rescueERC20` explicitly excludes the vested token. Insiders therefore cannot access any team tokens for four months and reach full vesting only at month 24 — aligning the team with the multi-year emission schedule rather than launch-window price action.

### 5.8 `OliveNFT` — the cultural artifact (OliveNFT.sol)

An ERC-721Enumerable collection, economically firewalled from the protocol (holds no OBN, grants no yield or votes). `MAX_SUPPLY = 20,000` and `MINT_PRICE = 0.005 ether` are constants. Mechanics of note:

- **One-at-a-time per wallet** (`enforceOnePerAddress`, toggleable): `mint()` mints exactly one token, reverting with `AlreadyHolding()` if the wallet already holds one — an anti-whale, breadth-first distribution posture that mirrors the protocol's participation ethic.
- **Commit–reveal fairness:** the owner commits `keccak256(seed)` before sale (`commitMetadataSeed`), and can reveal only the exact preimage (`revealMetadata`), making trait assignment provably pre-committed without on-chain randomness or manipulable block variables.
- **Feistel scatter:** metadata types (N buckets whose counts must sum to exactly 20,000; freezable via `freezeTypeCounts`) map to token IDs through a 4-round, 16-bit Feistel permutation seeded by the revealed seed, with cycle-walking (`_scatterIndex` re-applies the permutation until the image lands below `MAX_SUPPLY` — guaranteed to terminate since permutation cycles are finite). This scatters rarity uniformly across mint order, so sequential minters cannot snipe rare bands.
- `tokenURI` returns a placeholder pre-reveal; post-reveal, `baseURI + typeIndex + ".json"`. Stray ETH is rejected by reverting `receive`/`fallback`; `withdraw` uses `Address.sendValue` with the event emitted before the external call.

### 5.9 `OBNStakingLens` — the read-only analytics plane (OBNStakingLens.sol)

A UUPS-upgradeable, timelock-owned **pure view** contract holding no funds and possessing no privileges: its single storage slot points at the staking *proxy* (address stable across upgrades). It provides the full analytics suite for frontends — `getUserStats`, `getUserPoolView`, `getPoolStats`, `listPoolsBasic`, `pendingRewards[Multiple]`, `getPoolAPR`, `getGlobalStats`, `currentRewardsPerSecond`, `pendingCharityFor` — by recomputing live accumulator projections through the staking contract's public `sumRewardAcrossPhases` wrapper, and adds `getVotingPower(user, snapshotBlock)` for governance frontends. The architectural principle is separation of planes: *write paths and custody stay minimal and slow-changing in the engine; read/UX iteration happens in a contract that can be upgraded freely because it can steal nothing.*

### 5.10 Interaction topology

```
                    ┌────────────── OBNTimeLock (24h) ── owns/admins ──┐
                    │                    │                             │
                    ▼                    ▼                             ▼
   OBNToken ◄─mint()─ OBNStakingPools ◄─reads─ OBNStakingLens      AnnualGovernance
      │                  │ 88%→staker                                   │
      │ burn()           │ 10%→pool nonprofit         votes weighted by │ getPastVotingPower
      │                  │  1%→TheOffering ─────► burn OR sendToExtend ◄┘ (Phase 1)
      ▼                  │  1%→ExtendOliveBranch           │
   (supply −)            └─ principal escrow (K)           ▼
                                              ExtendOliveBranch ─distributeFromGovernance→ winning nonprofit (Phase 2)
```

---

## Chapter 6 — Security Architecture and Institutional Design

### 6.1 Code-level defenses

- **Checks-effects-interactions everywhere it matters:** `_mintSlices` updates all statistics before minting; `TeamVesting.release` updates `released` before transferring; `OliveNFT.withdraw` emits before sending.
- **Reentrancy guards** on every state-mutating user path in staking and NFT minting.
- **SafeERC20** for all token movement; `Math.mulDiv` for all proportional arithmetic (full-width intermediate products, no overflow/precision cliffs).
- **Custody minimization:** rewards are minted directly to final recipients; the staking contract holds only principal, and the admin `sweep` explicitly cannot touch the staking token.
- **One-way ratchets:** the token minter is set-once; locks only increase; `migrateV93` self-disables; type counts freeze; commit–reveal is single-shot.
- **Snapshot-before-start voting** (block − 1) plus checkpointed balances eliminate flash-stake governance attacks; one-address-one-vote-per-phase with recorded events.
- **Upgrade discipline:** UUPS with `_disableInitializers()` in every constructor; documented storage maps and gap accounting; an on-chain prohibition on upgrading governance mid-cycle.

### 6.2 Institutional defenses

The Charter functions as the system's constitution, and the contracts implement its articles almost clause-by-clause: consent and revocability (no-penalty `withdraw`), separability of ownership and yield-direction (staking itself), recipient accountability (the whitelist and ballot validation), commons governance (the two-phase cycle with deflationary defaults), and verifiability (the event and statistics surface, including per-user lifetime contribution tracking). Authority is deliberately fragmented: the timelock can administer but not confiscate (`forceExitUserToSelf` pays the *user*); the vote admin can start cycles but not decide them; governance can move the commons but only along two pre-authorized paths; and once Phase 1 executes, no one — not even the timelock — can cancel the people's vote.

---

## Chapter 7 — Limitations, Threats to Validity, and Future Work

1. **The price-support claim is conditional.** As derived in §4.6, float contraction requires net staking inflow to outpace un-restaked emissions. Exogenous demand shocks, liquidity-pool depth, and nonprofit sell-pressure on the 10% stream all lie outside protocol control. This thesis claims a *mechanism*, not a return.
2. **Emission-funded giving inherits token-price risk.** The nonprofit stream's real value depends on the OBN market. A prolonged price decline shrinks the gift stream even as nominal emissions continue. Diversification of nonprofit treasuries is an off-chain necessity the protocol cannot enforce.
3. **Plutocratic weighting.** 1-token-1-vote governance weights the wealthy, mitigated but not eliminated by the participation requirement and per-address vote recording. Quadratic or tenure-weighted voting (the `cumulativeStakeSeconds` primitive already exists on-chain) is natural future work.
4. **Whitelist centralization.** Nonprofit verification currently flows through the timelock owner. The Charter's Article IV demands *independent* verifiability; a decentralized attestation registry (cf. the project's canonical public-benefit registry CDRs) is the intended successor.
5. **Empirical generalization.** The participation data are U.S.-centric; the sacrifice-threshold theory should be tested against giving-participation panels in other economies, and ultimately against OBN's own on-chain cohort data — the protocol is, among other things, a natural experiment in whether removing principal-loss raises participation.
6. **Regulatory posture.** The analysis in Chapter 4 is economic, not a securities-law opinion; token distribution and marketing must be evaluated under applicable law independently of this thesis.

---

## Chapter 8 — Conclusion

Money has always been an enforcement technology; the question in every era is which promises it can enforce without a trusted institution standing behind them. Coinage enforced bearer value, banking enforced ledgers, Bitcoin enforced scarcity — and programmable money enforces *fiduciary structure*, collapsing the thousand-year-old endowment pattern into a permissionless primitive any household can hold.

That collapse arrives at the precise historical moment it is needed. The data are unambiguous: American giving participation fell from two-thirds of households to under half in a generation, donor counts decline every year while record dollars concentrate in ever-fewer hands, and the small donor — the civic backbone of the sector — is the fastest-vanishing cohort. The cause defended here is structural: giving has always demanded the sacrifice of principal, and the population able to afford that sacrifice has narrowed.

Olive Branch Network answers with a mechanism rather than an exhortation. A participant stakes and keeps their capital; the protocol mints declining, participation-proportional emissions and irrevocably splits every realized reward 88/10/1/1 among staker, chosen nonprofit, and the two governance vaults; the commons burns by default unless the community affirmatively votes it into a gift; and every additional participant tightens the circulating float by moving principal into inert escrow — so the act of joining is simultaneously an act of giving and an act of supply contraction. The contracts specified in Chapter 5 implement this with a security architecture whose theme is the *one-way ratchet*: minters set once, locks that only grow, votes that cannot be cancelled after execution, and an admin that can return funds to users but never take them.

The deepest claim of this thesis is the simplest: generosity should not require sacrifice, and for the first time in the history of money, it doesn't have to.

---

## References

### Monetary history and theory

- Buterin, V. (2014). *Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform.* Ethereum whitepaper.
- Chaum, D. (1983). "Blind Signatures for Untraceable Payments." *Advances in Cryptology: Proceedings of Crypto 82.*
- Davies, G. (2002). *A History of Money: From Ancient Times to the Present Day.* University of Wales Press.
- Eichengreen, B. (1996). *Globalizing Capital: A History of the International Monetary System.* Princeton University Press.
- Ferguson, N. (2008). *The Ascent of Money: A Financial History of the World.* Penguin.
- Graeber, D. (2011). *Debt: The First 5,000 Years.* Melville House.
- Humphrey, C. (1985). "Barter and Economic Disintegration." *Man*, 20(1), 48–72.
- Jevons, W. S. (1875). *Money and the Mechanism of Exchange.* D. Appleton & Co.
- Kiyotaki, N., & Wright, R. (1989). "On Money as a Medium of Exchange." *Journal of Political Economy*, 97(4), 927–954.
- Knapp, G. F. (1924 [1905]). *The State Theory of Money.* Macmillan.
- Kocherlakota, N. (1998). "Money is Memory." *Journal of Economic Theory*, 81(2), 232–251.
- Kuran, T. (2001). "The Provision of Public Goods under Islamic Law: Origins, Impact, and Limitations of the Waqf System." *Law & Society Review*, 35(4), 841–898.
- Mauss, M. (1925). *The Gift: Forms and Functions of Exchange in Archaic Societies.*
- Menger, C. (1892). "On the Origin of Money." *Economic Journal*, 2(6), 239–255.
- Mitchell-Innes, A. (1913). "What is Money?" *Banking Law Journal*, May 1913.
- Nakamoto, S. (2008). *Bitcoin: A Peer-to-Peer Electronic Cash System.*
- Schaps, D. (2004). *The Invention of Coinage and the Monetization of Ancient Greece.* University of Michigan Press.
- Smith, A. (1776). *An Inquiry into the Nature and Causes of the Wealth of Nations.*
- Vogelsteller, F., & Buterin, V. (2015). *EIP-20: Token Standard.*
- Von Glahn, R. (1996). *Fountain of Fortune: Money and Monetary Policy in China, 1000–1700.* University of California Press.

### Charitable-participation data (online sources)

- Indiana University Lilly Family School of Philanthropy (2021). ["Latest data shows new low in share of Americans who donated to charity."](https://philanthropy.indianapolis.iu.edu/news-events/news/_news/2021/latest-data-shows-new-low-in-share-of-americans-who-donated-to-charity.html)
- Indiana University Lilly Family School of Philanthropy (2022). [*The Giving Environment: Understanding How Donors…*](https://scholarworks.indianapolis.iu.edu/server/api/core/bitstreams/9631fc6a-945b-4d25-b6dd-06bd0bcf233e/content)
- Newsweek (2021). ["Number of Americans Giving to Charities Declined to 49.6 Percent, Study Shows."](https://www.newsweek.com/number-americans-giving-charities-declines-42-percent-study-shows-1613539)
- NonProfit PRO (2022). ["Study: Drop in Share of Americans Who Give to Charity Accelerated in First Year of Pandemic."](https://www.nonprofitpro.com/article/study-drop-in-share-of-americans-who-give-to-charity-accelerated-in-first-year-of-pandemic/)
- The NonProfit Times (2023). ["Philanthropy Rates Dropped Across Racial, Ethnic Groups: Report."](https://thenonprofittimes.com/npt_articles/philanthropy-rates-dropped-across-racial-ethnic-groups-report/)
- The Chronicle of Philanthropy. ["In Search of … America's Missing Donors."](https://www.philanthropy.com/news/in-search-of-americas-missing-donors/)
- Stanford Social Innovation Review. ["Collapse of Grassroots Giving Threatens Social Innovation."](https://ssir.org/articles/entry/grassroots-giving-collapse-social-innovation-threat)
- Philanthropy Roundtable. ["What to Make of New Insights into Pre-Pandemic Giving."](https://www.philanthropyroundtable.org/what-to-make-of-new-insights-into-pre-pandemic-giving/)
- Giving USA (2025). ["U.S. charitable giving grew to $592.50 billion in 2024, lifted by stock market gains."](https://givingusa.org/giving-usa-2025-u-s-charitable-giving-grew-to-592-50-billion-in-2024-lifted-by-stock-market-gains/)
- Give.org / BBB Wise Giving Alliance (2026). ["As America Nears 250, Giving USA 2026 Highlights Changing Giving Trends."](https://give.org/news/giving-usa-2026-charitable-giving-trends)
- NonProfit PRO (2026). ["Bequests Lift Giving USA 2026 Total Past $600B."](https://www.nonprofitpro.com/article/giving-usa-2026-bequests-do-the-heavy-lifting-as-total-giving-tops-600b/)
- Candid (2025). ["Key takeaways from Giving USA on 2025 philanthropy trends."](https://candid.org/blogs/philanthropy-trends-giving-usa/)
- Stelter (2026). ["Beyond the Record High: What Giving USA 2026 Numbers Reveal."](https://blog.stelter.com/2026/06/23/beyond-the-record-high-what-giving-usa-2026-numbers-reveal-and-what-comes-next/)
- Association of Fundraising Professionals / Fundraising Effectiveness Project (2025). ["FEP Data for Q1 2025 Shows Increases in Dollars Raised, but Declining Numbers of Donors."](https://afpglobal.org/news/fundraising-effectiveness-project-data-q1-2025-shows-increases-dollars-raised-declining)
- GlobeNewswire (2025). ["FEP Data for Q4 2024 highlights the growing role of high-dollar donors."](https://www.globenewswire.com/news-release/2025/04/25/3068473/0/en/Fundraising-Effectiveness-Project-Data-for-Q4-2024-highlights-the-growing-role-of-high-dollar-donors-in-driving-fundraising-performance-across-the-sector.html)
- Association of Fundraising Professionals / FEP (2026). ["FEP Reports Strongest Revenue Growth in Five Years, Even as Fewer Donors Give."](https://afpglobal.org/news/fundraising-effectiveness-project-reports-strongest-revenue-growth-five-years-even-fewer)
- NonProfit PRO (2025). ["FEP Q3 Report: Nonprofits Continue to Rely on Fewer Donors."](https://www.nonprofitpro.com/article/nonprofits-continue-to-rely-on-fewer-donors-to-fund-their-missions-per-latest-fep-data/)
- Nonprofit Quarterly. ["Donor Base Continues to Decline, FEP Report Says."](https://nonprofitquarterly.org/donor-base-continues-to-decline-fep-report-says/)
- National Philanthropic Trust. ["Charitable Giving Statistics."](https://www.nptrust.org/philanthropic-resources/charitable-giving-statistics/)

### Protocol sources

- OBN Whitepaper — [WHITEPAPER.md](WHITEPAPER.md)
- Core contracts — [`obn-project/contracts/`](obn-project/contracts/): `OBNToken.sol`, `StakingPoolsV93.sol`, `TheOffering.sol`, `ExtendOliveBranch.sol`, `AnnualGovernance.sol`, `OBNTimeLock.sol`, `TeamVesting.sol`, `OliveNFT.sol`, `OBNStakingLens.sol`
- OBN Charter v0.1 and *The Philosophy of Olive Branch Network* — protocol governance documents

---

*Prepared from the OBN protocol codebase and its Base mainnet deployment records, July 2026. Contract behavior verified against the deployed configuration (staking proxy 0x2C4B…7cD2, chain ID 8453).*
