# 🌱 Olive Branch Network (OBN)

**OBN** is a staking protocol that turns on-chain participation into continuous funding for real-world charities—while keeping yields competitive for long-term holders. 

Stake **OBN** into a pool tied to a charity wallet and earn rewards **every second**. A fixed share of emissions is routed to charities **on-chain, transparently, and by design**.

---

## ✨ Key Features

- **Multi-Pool Staking (one wallet per pool)**  
  Each pool maps to **exactly one** `charityWallet`. Routing is deterministic and easy to audit.

- **Automatic, Hard-Coded Reward Splits (BPS)**  
  Emissions are split **every accrual** with constants baked into the staking contract:
  - **88%** → Stakers  
  - **10%** → Charity (buffered globally, allocated to pools by TVL share)  
  - **1%** → Charity Fund (for programmatic support + bootstraps)  
  - **1%** → Treasury (lean operations)

- **TVL-Coupled Emissions (not supply-based)**  
  Rewards per second scale with **staked TVL** under the active phase rate—**not** with total/circulating supply. If TVL is 0, issuance effectively pauses.

- **Equal APR Across Pools**  
  By construction, per-token APR depends only on the **current phase**, so users choose **causes**, not APR games.

- **Deflationary-Trending Emission Schedule (10 years)**

| Years | Phase Rate (annualized) |
|------:|-------------------------:|
| 1–2   | 10.00%                   |
| 3–4   | 7.50%                    |
| 5–6   | 5.00%                    |
| 7–8   | 2.50%                    |
| 9–10  | 1.25%                    |

- **Bootstrap Program (Day-One Yield for Charities)**  
  From the **10% Charity (Genesis Reserve)**, the first **100 charities** onboarded each receive **1,000,000 OBN** **staked and permanently locked** to their pool. The **1% Charity Fund** (from emissions) replenishes and enables future bootstrap waves.

- **Permanent Locks (Bootstrap-Only)**  
  Admin can **only increase** a user’s `lockedAmount` (never decrease). Locks **auto-shrink** if the user’s balance falls below the stored lock. Purpose: **ensure bootstrap stakes can’t be withdrawn/dumped** while generating rewards from day one.

- **Upgradeable via UUPS + OpenZeppelin**  
  Token and staking contracts are **UUPS upgradeable** and designed to transition to a **DAO + timelock** for safe governance. Team vesting is a simple, non-upgradeable contract.

- **Transparent Tracking**  
  Emissions, charity allocations, and user claims are on-chain with rich view methods for dashboards.

---

## 📊 Initial Token Distribution (Genesis)

> Planned initial supply: **1,000,000,000 OBN**

| Allocation              | % of Supply | Notes                                                                 |
|-------------------------|-------------|-----------------------------------------------------------------------|
| Exchange Liquidity      | **50%**     | Seeds DEX liquidity                                                   |
| Airdrop                 | **20%**     | Community missions + growth                                           |
| Charity (Genesis Reserve)| **10%**    | Funds the **1,000,000 OBN × 100 charities** bootstrap program         |
| Treasury                | **10%**     | Lean ops (audits, infra, grants)                                      |
| Team (Vested)           | **10%**     | ~4-month cliff, ~20-month linear vest                                 |

**Ongoing issuance:** only via staking emissions; the **staking contract is the sole minter** (set **once** with `setMinterOnce`).

---

## 🏗️ Smart Contracts (current)

| Contract                | Description |
|-------------------------|-------------|
| **OBNToken.sol**        | ERC-20 + Permit + Votes + Burnable (UUPS). One-time genesis distribution; **single minter** model (staking contract). |
| **OBNStakingPools.sol** | Multi-pool staking with **TVL-coupled**, phase-based emissions and **hard-coded** splits (88/10/1/1). Charity buffer + per-pool allocation; Charity Fund bootstrap; permanent locks (bootstrap-only). |
| **TeamVesting.sol**     | Simple linear vesting with a 4-month cliff and ~20-month stream; helper views for UX. |

> **Not used:** There is **no separate EmissionController** or Airdropper contract in this implementation. Emission phases live inside **OBNStakingPools**, and airdrops are handled off-chain or via standard scripts.

---

## 🧭 Charities: Wallets, Onboarding & Display

- **One wallet per pool** — each pool has a single `charityWallet`.
- **Address-first listing** — we index **public Ethereum addresses** that organizations publish and can sign them up ourselves.  
  Each charity page shows **“No Affiliation / Not Endorsed”** by default.  
  We **do not** use logos or brand assets **without explicit permission**.
- **Optional consented display** — with consent, we can show branding and richer profiles; otherwise routing remains address-only.
- **Delisting** — if standards aren’t met, we remove the charity from our **frontend** and stop promotion. **On-chain funds remain untouched.**
- **Bootstrap Program** — first **100 charities** receive **1,000,000 OBN** staked + **permanently locked** to earn from day one. Subsequent waves funded by the **1% Charity Fund** as it accrues.

---

## 🔐 Hard-Coded Guarantees (current implementation)

- Reward splits: **88% stakers / 10% charity / 1% charity fund / 1% treasury**.
- **TVL-coupled** emission math; **equal APR across pools** per phase.
- **Single minter** model on the token (staking contract), set **once**.
- **Permanent locks** are **increase-only** (bootstrap-only) and auto-shrink if balances drop.
- **No pool retire/active flag**; operations are per-pool and bounded (gas-safe).
- **DAO path:** UUPS upgrades gated by owner → multisig → **timelock + ERC20Votes DAO**.

---

## 🧪 Getting Started (Developers)

### Prerequisites
- Node.js v18+
- pnpm or npm
- Hardhat
- A wallet (e.g., MetaMask)

### Install
```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
npm install
