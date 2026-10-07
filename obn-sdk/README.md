# obn-sdk

Integration data for the Olive Branch Network protocol on Base mainnet (chain ID 8453): contract addresses, ABIs and the nonprofit pool registry. Use it to build wallets, analytics, dashboards or other tools on top of OBN without depending on the OBN application.

| File | Contents |
|---|---|
| [`deployments/base-mainnet.json`](deployments/base-mainnet.json) | Contract addresses, current proxy implementations, and the source file each ABI was built from |
| [`deployments/base-mainnet.pools.json`](deployments/base-mainnet.pools.json) | Nonprofit pools: pool ID, name, payout wallet, status, category and wallet-verification link |
| [`abis/`](abis/) | Full ABI for each contract, one JSON array per file |
| [`registry/pool-metadata.json`](registry/pool-metadata.json) | Hand-maintained pool facts (short name, category, links) merged into the pool file |

Always send transactions to the proxy `address`. A proxy's `implementation` only identifies the code it runs.

## Example (viem)

```ts
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import deployments from "./obn-sdk/deployments/base-mainnet.json";
import stakingAbi from "./obn-sdk/abis/OBNStakingPools.json";

const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });
const poolCount = await client.readContract({
  address: deployments.contracts.OBNStakingPools.address as `0x${string}`,
  abi: stakingAbi,
  functionName: "poolLength",
});
```

## How it is generated

`node obn-sdk/scripts/generate.cjs` (after `npx hardhat compile` in `obn-project/`) reads each proxy's ERC-1967 implementation slot and the deployed code from Base mainnet. It then picks the compiled `obn-project` artifact that matches:

- `verifiedBy: "bytecode"`: the deployed runtime code equals the artifact's, ignoring the trailing metadata hash and immutable values.
- `verifiedBy: "selectors"`: the contract was compiled with settings that no longer reproduce its exact bytecode, so the generator checked that every function in the ABI is present in the deployed code.

Pool wallets and status are read from the staking contract and must match `obn-project/scripts/governance/nonprofits.js`, or generation fails. Re-run the generator after every protocol upgrade. Set `BASE_RPC_URL` to use your own node instead of the public endpoint.

## License

MIT, under the repository's root [LICENSE](../LICENSE). Nonprofit names and Olive Branch Network names, logos and branding are not licensed by it; see the main [README](../README.md#licensing).
