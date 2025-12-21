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

| Contract | Type | Address | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **OBNStakingPools (v9.0 Impl)** | Implementation | [0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b](https://basescan.org/address/0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b) | [Verified ✅](https://basescan.org/address/0x04a8b485C3eb64A0f8991aDe3532D28E5aB9b96b#code) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [View](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OliveNFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

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

- **OBN/ETH:** [`0x8fce8be03745fa2821cb25f7dfebbfc5573a9beaca433f69a53c998a6fff1e94`](https://app.uniswap.org/explore/pools/base/0x8fce8be03745fa2821cb25f7dfebbfc5573a9beaca433f69a53c998a6fff1e94)
- **OBN/USDC:** [`0xbc13498e05d9ca80a21fbee72dbbcbedda835c4021be85be025a50dd39409cb1`](https://app.uniswap.org/explore/pools/base/0xbc13498e05d9ca80a21fbee72dbbcbedda835c4021be85be025a50dd39409cb1)

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
