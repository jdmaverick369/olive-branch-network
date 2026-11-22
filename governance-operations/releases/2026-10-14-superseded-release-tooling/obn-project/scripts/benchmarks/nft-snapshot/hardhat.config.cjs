require('@nomicfoundation/hardhat-ethers');
module.exports = {
  solidity: '0.8.28',
  networks: { hardhat: { hardfork: 'cancun', blockGasLimit: 1000000000, initialBaseFeePerGas: 0 } },
};
