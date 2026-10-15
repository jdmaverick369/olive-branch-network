// Review only: an in-process Hardhat chain, pinned to a public Base block.
// No live network definitions, wallet keys, or transaction broadcasts.
const base = require('./hardhat.nft-voting.config.cjs');
module.exports = {
  ...base,
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: 'cancun',
      blockGasLimit: 30000000,
      forking: { url: 'https://base-rpc.publicnode.com', blockNumber: 52015686 },
      chains: { 8453: { hardforkHistory: { cancun: 0 } } },
    },
  },
};
