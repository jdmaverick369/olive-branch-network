# Contributing

Thank you for helping improve the Olive Branch Network frontend.

## Before opening a change

- Use an issue to discuss substantial behavior or protocol-facing changes.
- Never include secrets, private RPC credentials, personal data, or production environment files.
- Keep changes focused and avoid unrelated redesigns or dependency upgrades.
- Treat deployed smart-contract behavior as authoritative; UI restrictions are not authorization.

## Development workflow

1. Fork the repository and create a focused branch.
2. Run `npm ci` and copy `.env.example` to `.env.local`.
3. Make the smallest change that addresses the issue.
4. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
5. Test wallet and transaction changes on Base Sepolia before testing mainnet.
6. Open a pull request using the repository template.

Commit messages and pull-request descriptions should explain the user-visible effect, security implications, network tested, and manual validation performed. Do not include vulnerability details in a public issue or pull request; follow `SECURITY.md` instead.
