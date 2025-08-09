# 🌱 Olive Branch Network (OBN)

**OBN** is a next-generation staking protocol built to create sustainable, on-chain funding for real-world charities while rewarding long-term holders.  
Every stake you make not only grows your holdings but also supports a nonprofit organization you choose — automatically, transparently, and without intermediaries.

---

## ✨ Key Features

- **Multi-Pool Staking** – Each pool represents a specific nonprofit organization
- **Automatic Reward Splits** – Rewards are split every second:  
  - **80–84%** to stakers  
  - **15%** to the selected charity pool  
  - **1–5%** to the network treasury  
- **Deflationary Emission Schedule** – Incentivizes long-term holding and protocol sustainability:  

| Years | Global APY |
|-------|------------|
| 1–2   | 10%        |
| 3–4   | 7.5%       |
| 5–6   | 5%         |
| 7–8   | 2.5%       |
| 9–10  | 1.25%      |

- **Initial Charity Boost** – The first **200 charities** onboarded each receive **500,000 OBN staked** from the charity fund to start generating rewards on day one  
- **Upgradeable Smart Contracts** – Built using UUPS proxies and OpenZeppelin standards  
- **Transparent Tracking** – All stakes, rewards, and distributions visible on-chain  

---

## 📊 Initial Token Distribution

| Allocation         | % of Supply | Notes |
|--------------------|-------------|-------|
| Airdrop Missions   | 40%         | Distributed via community missions and campaigns |
| Exchange Liquidity | 30%         | Initial market liquidity across key DEXs |
| Charity Fund       | 10%         | Used to bootstrap the first 200 charity pools |
| Treasury           | 10%         | Supports development, marketing, and operations |
| Team (Vested)      | 10%         | Locked and released gradually over time |

---

## 🏗️ Smart Contracts

| Contract                    | Description |
|-----------------------------|-------------|
| **OBNToken.sol**            | ERC20 token with governance (ERC20Votes), controlled minting, and initial supply distribution |
| **OBNStakingPools.sol**     | Multi-pool staking, emissions, and reward distribution logic |
| **EmissionController.sol**  | Controls the global APY schedule and adjusts emissions according to protocol rules |
| **Airdropper.sol**          | Batch token distribution system for airdrops |
| **TeamVesting.sol**         | Time-based token release for the team allocation |

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


