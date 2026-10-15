// Local-only release rehearsal. No live network or wallet-account configuration.
const base = require('./hardhat.nft-voting.config.cjs');
const block = Number(process.env.ASSEMBLY_REHEARSAL_BLOCK);
if (!Number.isSafeInteger(block) || block < 1) throw Error('Pinned ASSEMBLY_REHEARSAL_BLOCK required');
if (!process.env.BASE_MAINNET_URL) throw Error('Read-only fork RPC required');
module.exports = { ...base, networks: { hardhat: {
  chainId: 31337, hardfork: 'cancun', blockGasLimit: 30000000,
  forking: { url: process.env.BASE_MAINNET_URL, blockNumber: block },
  chains: { 8453: { hardforkHistory: { cancun: 0 } } },
} } };
