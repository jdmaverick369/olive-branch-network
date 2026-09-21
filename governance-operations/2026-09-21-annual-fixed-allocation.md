# Annual governance upgrade: 21 September 2026

The new implementation is deployed and verified. The upgrade operation is confirmed
scheduled on-chain and is eligible for execution on **22 September 2026 at 12:18:19 PM
CDT (17:18:19 UTC)**. Scheduling does not change the proxy implementation; a separate
execution transaction is required after the delay.

## Verified deployment

- Network: Base mainnet, chain ID 8453.
- Proxy: `0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270`.
- Previous implementation: `0x4721Cc867084fD656E2B45A4b0937fE32245A553`.
- New implementation: [`0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3`](https://basescan.org/address/0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3#code).
- Deployment transaction: [`0x4697719ca5c23c8c724b39914fb91bc3490a9340000a52ef1179c8efd637367c`](https://basescan.org/tx/0x4697719ca5c23c8c724b39914fb91bc3490a9340000a52ef1179c8efd637367c).
- Explorer response: `Pass - Verified`, through the official Etherscan V2 API for Base.
- The verified compiler input contains only AnnualGovernance and 12 required dependencies.

## Schedule through the operator Safe

1. Open the operator Safe `0x066e2FABb036deab7DC58bAde428F819AC3542DD` on Base.
2. In Transaction Builder, import [the schedule JSON](2026-09-21-annual-fixed-allocation-schedule.json).
3. Review, collect two owner signatures, and execute the Safe transaction.

The outer transaction calls `scheduleBatch` on Timelock
`0x86396526286769ace21982E798Df5eef2389f51c`, with zero ETH value and a delay of
86,400 seconds. Its single queued call targets the governance proxy and encodes
`upgradeToAndCall(0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3, 0x)`.

The countdown begins when the scheduling transaction confirms, not when the JSON
is imported or signatures are collected. The available deployer is neither a Safe
owner nor a Timelock proposer; it cannot sign or execute this scheduling transaction.
The encoded scheduling transaction passed a read-only simulation from the authorized Safe.

## Preserve these operation identifiers

```text
SALT=0x885547658b66793d2106db4df692694b04462279699ec2b38a56c14e1ced59d7
OP_ID=0xbaa0a9f445e24f4e4e8e98a371609be2307700bfc9bdadd5ab1d425a63aafb9c
```

Do not regenerate the schedule file: that would create a new salt and operation ID.
After scheduling confirms, read `getTimestamp(OP_ID)` from the Timelock for the exact
execution time. Generate the matching execute payload using the existing upgrade
script with `ACTION=execute` and the addresses/identifiers recorded here.

The live baseline comparison, storage validation, ownership, inactive cycle, and
candidate bytecode checks passed. Keep the cycle inactive until the upgrade executes.
Source publication and on-chain scheduling are separate operations.

Machine-readable receipt and status: [deployment record](2026-09-21-annual-fixed-allocation-record.json).
