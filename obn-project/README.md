# Olive Branch Network (OBN)

## Redefining Philanthropy Through DeFi

Traditional philanthropy is often inefficient, opaque, and difficult to sustain. Donors make contributions with limited visibility into impact, while nonprofits spend valuable time and resources fundraising instead of focusing fully on their mission.

**Olive Branch Network offers a different model.**

OBN is a decentralized giving protocol that embeds charitable funding directly into staking. Users stake OBN to earn rewards, while a portion of those rewards is automatically routed onchain to the nonprofit they choose to support. This creates a system where giving is transparent, verifiable, and built into the core mechanics of the network.

As participation grows, charitable impact can grow alongside it. The result is a more sustainable model for philanthropy—one that aligns incentives, expands access to giving, and uses DeFi to create measurable social good.

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
