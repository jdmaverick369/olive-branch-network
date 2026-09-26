# Olive Branch Network frontend

The production dApp provides staking, reward claims, nonprofit contribution views, and governance on Base.

## Analytics

Network charts use daily finalized on-chain snapshots, with no Dune subscription. The daily GitHub Actions worker commits its checkpoint and chart data for the normal deployment to pick up; nonprofit pool cards continue refreshing directly from the contract. See [analytics setup and metric definitions](scripts/analytics/README.md).

## Staking and reward claims

Stakers can opt in on-chain to sponsored monthly autoclaim for all current and future pools held by their wallet. The worker submits on the 14th of each month, starting at 09:23 UTC with hourly retries through 23:23 UTC. The automation account batches pools with positive claimable user rewards, up to 32 pools per transaction, and pays gas through the configured paymaster. The contract permits one successful automatic claim per pool per UTC calendar month. Rewards follow the same 88% / 10% / 1% / 1% split and go to the same recipients as manual claims. Users can disable consent at any time; deposits, withdrawals, and manual claims remain available. Autoclaim does not transfer principal, compound rewards, or change voting power.

Use the staking proxy `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` for transactions. The verified V9.3.1 implementation is [`0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f`](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code); it is not a replacement wallet approval or deposit address.

The contract interface described here is V9.3.1. Deployment and activation are recorded separately in the [operational release record](docs/v931-release-record.json).

`NEXT_PUBLIC_AUTOCLAIM_ENABLED` controls the opt-in interface, while the worker's separate `AUTOCLAIM_ENABLED` switch controls automated submissions. Operators verify the proxy version, executor, and sponsored claim receipts before enabling these services. Existing connected wallets use the same proxy and staking positions.

See [the autoclaim runbook](docs/v931_autoclaim_runbook.md) and [worker operations](scripts/autoclaim/README.md) for configuration and activation.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
