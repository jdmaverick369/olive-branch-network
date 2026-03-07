# Olive Branch Network (OBN)

## Redefining Philanthropy Through DeFi

Traditional charity is broken. Donors give once and hope their money reaches the cause. Nonprofits spend 20-40% of their budgets just asking for more donations. There's no transparency, no sustainability, and no compounding impact.

**OBN changes everything.**

We've built a protocol where supporting nonprofits isn't a sacrifice—it's the default. Every time you stake OBN, 10% of your rewards flow directly to your chosen nonprofit's wallet. No intermediaries. No overhead. No asking. Just permanent, verifiable, on-chain funding that grows as the network grows.

---

## How It Works

**Stake once. Fund forever.**

When you stake OBN in a nonprofit's pool, the protocol continuously mints rewards and splits them:

| Recipient | Share | Purpose |
|-----------|-------|---------|
| You | 88% | Your yield for participating |
| Nonprofit | 10% | Direct funding to their wallet |
| Charity Fund | 1% | Onboards new nonprofits |
| Treasury | 1% | Protocol development |

This isn't a donation—it's a self-sustaining funding mechanism. Your stake generates rewards indefinitely. The nonprofit receives funding indefinitely. Everyone wins.

---

## The Bootstrap Model

Every nonprofit onboarded to OBN receives **1,000,000 OBN permanently staked** in their pool from the Charity Fund. This "bootstrap" gives them:

- Immediate reward generation from day one
- A stake they can never lose (permalocked)
- Compounding returns that grow alongside the protocol

As more users stake in their pool, the nonprofit's share of emissions increases. The more the community supports a cause, the more funding it receives—automatically.

---

## Deflationary Sustainability

OBN uses a 10-year emission schedule that rewards early adopters while ensuring long-term viability:

| Years | APY |
|-------|-----|
| 1-2 | 10% |
| 3-4 | 7.5% |
| 5-6 | 5% |
| 7-8 | 2.5% |
| 9-10 | 1.25% |

No hyperinflation. Just measured, predictable growth that aligns incentives between stakers and nonprofits for the long term.

---

## Why This Matters

**For Donors:** Your capital works for you AND for the causes you care about. No more choosing between growing your portfolio and giving back.

**For Nonprofits:** Predictable, passive income that scales with community support. No fundraising campaigns. No donor fatigue. Just sustainable funding.

**For Crypto:** A use case that actually matters. Proof that DeFi can do more than shuffle money between wallets.

---

## Token Distribution

| Allocation | % | Purpose |
|------------|---|---------|
| Exchange Liquidity | 40% | Market access and trading |
| Airdrop/Community | 30% | Growth, engagement, and security incentives |
| Charity Fund | 10% | Nonprofit bootstraps (permanently locked) |
| Treasury | 10% | Development and operations |
| Team (Vested) | 10% | Aligned incentives with cliff + linear release |

---

## Deployed Contracts (Base Mainnet)

| Contract | Type | Address | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **OBNStakingPools (v9.2 Impl)** | Implementation | [0xdbeFe63a1F0ca12EAeFCDF48f1ABf0ACf14EfB48](https://basescan.org/address/0xdbeFe63a1F0ca12EAeFCDF48f1ABf0ACf14EfB48#code) | [Verified](https://basescan.org/address/0xdbeFe63a1F0ca12EAeFCDF48f1ABf0ACf14EfB48#code) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [View](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **Olive NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

OBNToken and StakingPools use UUPS proxy with 24-hour timelock governance. TeamVesting is non-upgradeable by design.

---

## Links

- **Whitepaper:** [WHITEPAPER.md](WHITEPAPER.md)
- **Base Mainnet Contracts:** See Appendix B of Whitepaper
- **Website:** [olivebranch.network](https://olivebranch.network)

---

## For Developers

```bash
git clone https://github.com/jdmaverick369/olive-branch-network.git
cd olive-branch-network
npm install
npx hardhat compile
npx hardhat test
```

**Requirements:** Node.js v18+, Hardhat

---

*Make giving the path of least resistance.*
