# 🌱 Olive Branch Network (OBN)

**OBN** is a next‑generation staking protocol designed to fund real‑world charities while rewarding participants.  
Every stake you make not only grows your holdings but also supports a nonprofit organization you choose — automatically and transparently on‑chain.

---

## ✨ Features

✅ **Multi‑Pool Staking** – Each pool represents a specific nonprofit

✅ **Automatic Splits** – Rewards are split every second:  
- **80–84%** to stakers  
- **15%** to the selected charity  
- **1–5%** to the network treasury  

✅ **Predictable Emission Schedule** – Global APY reduces over time:  

| Years | APY  |
|-------|------|
| 1–2   | 10%  |
| 3–4   | 7.5% |
| 5–6   | 5%   |
| 7–8   | 2.5% |
| 9–10  | 1.25% |

✅ **Upgradeable Contracts** – Built with UUPS and OpenZeppelin standards

✅ **Transparent Stats** – View your stake, pending rewards, and pool info anytime

---

## 🏗️ Smart Contracts

| Contract | Description | Path |
|----------|-------------|------|
| `OBNToken.sol` | ERC20 token with governance (ERC20Votes) and controlled minting | `contracts/OBNToken.sol` |
| `OBNStakingPools.sol` | Staking pools, emissions, and reward distribution | `contracts/OBNStakingPools.sol` |

All contracts are written in **Solidity 0.8.x** and use **OpenZeppelin upgradeable libraries**.

---

## 🚀 Getting Started (Developers)

### Prerequisites
- Node.js v18+
- Hardhat
- MetaMask or similar wallet

### Install
```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
npm install

