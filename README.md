# 🌱 Olive Branch Network (OBN)

**OBN** is a next-generation staking protocol built to create sustainable, on-chain funding for real-world charities while rewarding long-term holders.  
Every stake you make not only grows your holdings but also supports a nonprofit organization you choose — automatically, transparently, and without intermediaries.

---

## ✨ Key Features

- **Multi-Pool Staking** – Each pool represents a specific nonprofit organization
- **Automatic Reward Splits** – Rewards are split every second:  
  - **88%** to stakers  
  - **10%** to the selected charity pool  
  - **1%** to the network treasury
  - **1%** to the charity fund
  
- **Deflationary Emission Schedule** – Incentivizes long-term holding and protocol sustainability:  

| Years | Global APY |
|-------|------------|
| 1–2   | 10%        |
| 3–4   | 7.5%       |
| 5–6   | 5%         |
| 7–8   | 2.5%       |
| 9–10  | 1.25%      |

- **Charity Bootstrap Permalock** – Allocated from the charity fund to onboard nonprofits. Nonprofits receive 1,000,000 OBN permanently staked, giving them instant rewards from day one while removing tokens from circulation.  
- **Upgradeable Smart Contracts** – Built using UUPS proxies and OpenZeppelin standards  
- **Transparent Tracking** – All stakes, rewards, and distributions visible on-chain  

---

## 📊 Initial Token Distribution

| Allocation         | % of Supply | Notes |
|--------------------|-------------|-------|
| Exchange Liquidity | 40%         | Initial market liquidity across key DEXs |
| Airdrop/Bug Bounty | 30%         | Allocated to community growth through missions, campaigns, and security incentives |
| Charity Fund       | 10%         | Used to bootstrap nonprofits and remove OBN permanently from circulation |
| Treasury           | 10%         | Supports development, marketing, and operations |
| Team (Vested)      | 10%         | Locked and released gradually over time |

---

## 🏗️ Smart Contracts

| Contract                    | Description |
|-----------------------------|-------------|
| **OBNToken.sol**            | ERC20 token with governance (ERC20Votes), controlled minting, and initial supply distribution |
| **StakingPools.sol**        | Multi-pool staking, emissions, and reward distribution logic |
| **TeamVesting.sol**         | Time-based token release for the team allocation |
| **OliveNFT.sol**               | Collectable NFT that personalizes the staking dashboard |

---

## ✅ Official OBN Addresses (Base)

| Purpose | Address |
|--------|---------|
| **Treasury** | `0x5C8a0aCfAD4528714076068f71a5ff2Ee06c3718` |
| **Charity Fund** | `0x398fe423a8b4fd9b40cadf8bc72448c95474455f` |
| **Team Wallet** | `0xf765637e2c162219bc188391c0869c7bD35d8816` |
| **Airdrop / Earn / Bug Bounty** | `0xA699c2885cC72398430a8a75c80406C2b6A7B096` |

---

## 🌊 Official Uniswap Pools (Base)

- **OBN/ETH:** `https://app.uniswap.org/explore/pools/base/0x8fce8be03745fa2821cb25f7dfebbfc5573a9beaca433f69a53c998a6fff1e94`
- **OBN/USDC:** `https://app.uniswap.org/explore/pools/base/0xbc13498e05d9ca80a21fbee72dbbcbedda835c4021be85be025a50dd39409cb1`

---

## 🚀 Getting Started (Developers)

### Prerequisites
- Node.js v18+
- Hardhat
- MetaMask or compatible wallet

### Install
```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
npm install
