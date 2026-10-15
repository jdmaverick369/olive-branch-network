// Local-only validation: deliberately excludes every live network and mainnet fork.
const config = require('./hardhat.config.js');
module.exports = { ...config, networks: { hardhat: { hardfork: 'cancun', blockGasLimit: 30000000 } } };
