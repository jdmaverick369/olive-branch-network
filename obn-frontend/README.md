# Olive Branch Network frontend reference implementation

This directory contains a sanitized, open-source reference implementation of the Olive Branch Network (OBN) Next.js interface. It is published for transparency, education, security review, and community contribution. The interface demonstrates wallet connections, reads from deployed smart contracts, and staking, nonprofit contribution, governance, portfolio, analytics, and token-swap workflows.

The production frontend is maintained in a separate private repository and deployed independently. This directory is not connected to the production Vercel project and changes here are not automatically deployed. Community users should treat it as reference code, not as an official hosted service or deployment source.

The frontend is not the protocol's security boundary. Contract permissions and backend authorization must protect every privileged operation regardless of whether a route or button is visible here. Contract source and deployment procedures are maintained separately from this repository.

## Network and contracts

The production interface targets **Base mainnet (chain ID `8453`)**. Development can also target **Base Sepolia (chain ID `84532`)** by changing the environment configuration. The configured chain must match the deployed addresses.

The CDP swap API routes, embedded market chart, and current BaseScan links are production-mainnet integrations. A Base Sepolia configuration is suitable for core wallet and contract-flow testing, but those mainnet-specific integrations require separate test handling.

Contract addresses are supplied through `NEXT_PUBLIC_*` environment variables. Canonical production proxy and token addresses currently used by protocol-specific views are also documented in `src/lib/contracts.ts`. Proxy addresses—not implementation addresses—must be used for upgradeable contracts. Verify every address against an official deployment record before operating a community deployment.

## Prerequisites

- Node.js 22 or a compatible current LTS release
- npm 11 (the repository records the expected package-manager version)
- A WalletConnect project ID
- Base RPC access
- Appropriate provider credentials for optional analytics, swaps, notifications, and sponsorship

## Local setup

```bash
git clone https://github.com/jdmaverick369/olive-branch-network.git
cd olive-branch-network/obn-frontend
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, copy the template with:

```powershell
Copy-Item .env.example .env.local
```

Then open <http://localhost:3000>. Do not commit `.env.local` or any credential-bearing environment file.

## Environment configuration

`.env.example` documents all known settings, separates required and optional values, and marks browser-visible variables. Any variable beginning with `NEXT_PUBLIC_` is included in client bundles and **must not contain secrets**.

At minimum, configure the chain, site URL, RPC endpoint, WalletConnect project ID, and deployed token/staking/lens/governance/NFT addresses. Server routes additionally require the provider credentials for the features they serve. The notification broadcast endpoint deliberately returns `503` when `NOTIFICATION_API_KEY` is absent.

`NEXT_PUBLIC_RPC_URL` is intentionally consumed by the browser through Wagmi. Any credential embedded in that URL is public and must be browser-safe, origin-restricted, rate-limited, and monitored at the RPC provider. Use the server-only `RPC_URL` and `BASE_RPC_URL` variables for server routes where possible.

For side-by-side testing against a separate mainnet endpoint, create an ignored `.env.mainnet.local` containing `NEXT_PUBLIC_RPC_URL` and `BASE_RPC_URL`, then run `npm run dev:mainnet`.

## Commands

```bash
npm run dev          # development server
npm run dev:mainnet  # development server on port 3001 using .env.mainnet.local
npm run validate:env # required environment and Base chain/address validation
npm run typecheck    # TypeScript validation
npm run lint         # ESLint
npm run build        # optimized production build
npm run start        # serve the production build
```

There is currently no committed automated test suite. Contributions that change transaction preparation or wallet behavior should include focused tests where practical and must pass type checking, linting, and a production build.

## Building locally

To produce and inspect a local optimized build:

```bash
npm run validate:env
npm run typecheck
npm run build
```

Confirm `NEXT_PUBLIC_CHAIN_ID` and every configured contract address refer to the same network before exercising wallet or transaction flows. A successful local build does not make this directory a production deployment.

## Relationship to the protocol

The frontend is an interface to the protocol; it is not the protocol's security boundary. Canonical contract behavior, permissions, and deployed state are defined by the contracts and governance materials in [`../obn-project/`](../obn-project/), not by client-side controls. Verify deployment addresses against authoritative project records before using this implementation with any network.

This repository does not configure or operate an official frontend deployment. Anyone independently deploying this reference implementation is responsible for environment security, provider restrictions, legal compliance, transaction testing, and clear disclosure that their deployment is independent.

Community deployments are independent interfaces and must not claim to be an official Olive Branch Network deployment without authorization.

## Repository structure

```text
public/              Static images, social cards, and nonprofit logos
scripts/             Local operational helpers
src/app/             Next.js routes, pages, layouts, and server endpoints
src/components/      Shared interface components
src/hooks/           Wallet and protocol React hooks
src/lib/             ABIs, contract metadata, provider helpers, and utilities
```

## Security

Do not report exploitable vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md) for responsible-disclosure instructions. Never treat client-side route or component visibility as authorization.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). By contributing, you agree that your contribution is licensed under this repository's license.

## License

Licensed under the [MIT License](LICENSE).
