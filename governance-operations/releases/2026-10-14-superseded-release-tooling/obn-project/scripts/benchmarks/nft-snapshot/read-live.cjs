const fs = require('fs');
const path = require('path');
const { JsonRpcProvider, Contract, keccak256 } = require('ethers');
const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../../.env')));
const address = '0xB66F67444b09f509D72d832567C2df84Edeb80F8';
async function main() {
  const provider = new JsonRpcProvider(env.BASE_MAINNET_URL || 'https://mainnet.base.org', 8453, { staticNetwork: true });
  try {
    const block = await provider.getBlock('latest');
    const nft = new Contract(address, ['function totalSupply() view returns(uint256)', 'function MAX_SUPPLY() view returns(uint256)', 'function tokenByIndex(uint256) view returns(uint256)', 'function ownerOf(uint256) view returns(address)'], provider);
    const supply = Number(await nft.totalSupply({ blockTag: block.number }));
    const owners = [];
    for (let i = 0; i < supply; i += 25) {
      owners.push(...await Promise.all(Array.from({ length: Math.min(25, supply - i) }, async (_, j) => {
        const id = await nft.tokenByIndex(i + j, { blockTag: block.number });
        return { tokenId: String(id), owner: await nft.ownerOf(id, { blockTag: block.number }) };
      })));
    }
    const code = await provider.getCode(address, block.number);
    const result = { checkedAt: new Date().toISOString(), chainId: 8453, address, block: block.number, blockHash: block.hash, blockTimestamp: block.timestamp, blockGasLimit: String(block.gasLimit), supply, uniqueHolders: new Set(owners.map(x => x.owner.toLowerCase())).size, maxSupply: String(await nft.MAX_SUPPLY({ blockTag: block.number })), codeHash: keccak256(code), owners };
    fs.writeFileSync(path.join(__dirname, 'live-snapshot.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ...result, owners: undefined, solc: require('solc').version() }));
  } finally { provider.destroy(); }
}
main().catch(e => { console.error('Live read failed:', e.code || e.name); process.exitCode = 1; });
