// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const {
  BASE_SEPOLIA_URL,
  BASE_MAINNET_URL,
  PRIVATE_KEY = "",
  BASESCAN_API_KEY = "",
} = process.env;

const accounts = PRIVATE_KEY
  ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
  : [];

module.exports = {
  solidity: {
    // Multiple compilers allowed; the first that satisfies a file's pragma is used.
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 500 },
          viaIR: true,
          metadata: { bytecodeHash: "ipfs" },
          evmVersion: "cancun",
        },
      },
      {
        version: "0.8.22",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.21",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.20",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    ],
    // Force IR pipeline on the heaviest files even if another compiler version is picked
    overrides: {
      "contracts/StakingPools.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 500 }, viaIR: true },
      },
      "contracts/OliveNFT.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 500 }, viaIR: true },
      },
    },
  },

  networks: {
    base_sepolia: {
      url: BASE_SEPOLIA_URL,
      chainId: 84532,
      accounts,
    },
    base: {
      url: BASE_MAINNET_URL,
      chainId: 8453,
      accounts,
    },
  },

  etherscan: {
    // Basescan verification
    apiKey: {
      base: BASESCAN_API_KEY,
      "base-sepolia": BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },

  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
};
