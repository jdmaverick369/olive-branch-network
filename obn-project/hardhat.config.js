require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const { BASE_SEPOLIA_URL, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    base_sepolia: {
      url: BASE_SEPOLIA_URL,
      accounts: [PRIVATE_KEY],
    },
  },
};