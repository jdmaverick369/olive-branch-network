// scripts/governance/addresses.js
// Single source of truth for OBN mainnet contract addresses used by governance scripts.
// All scripts read from here. Override any address via the corresponding env var in .env.
"use strict";
require("dotenv").config();

const MAINNET = {
  STAKING_PROXY:  "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2",
  OBN_TOKEN:      "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685",
  TIMELOCK:       "0x86396526286769ace21982E798Df5eef2389f51c",
  EXTENDING_OB:   "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  OPERATOR_SAFE:  "0x066e2FABb036deab7DC58bAde428F819AC3542DD",
  TEAM_VESTING:   "0x9428Edd912224778d84D762ebCDA52e1c829aB8d",
};

module.exports = {
  STAKING_PROXY:  process.env.OBN_STAKING_CONTRACT || MAINNET.STAKING_PROXY,
  OBN_TOKEN:      process.env.OBN_TOKEN_CONTRACT   || MAINNET.OBN_TOKEN,
  TIMELOCK:       process.env.TIMELOCK_ADDR        || MAINNET.TIMELOCK,
  EXTENDING_OB:   process.env.EXTENDING_OB_ADDR   || MAINNET.EXTENDING_OB,
  OPERATOR_SAFE:  process.env.OPERATOR_SAFE        || MAINNET.OPERATOR_SAFE,
  TEAM_VESTING:   process.env.TEAM_VESTING_ADDR    || MAINNET.TEAM_VESTING,
  TIMELOCK_DELAY: Number(process.env.TIMELOCK_DELAY ?? 86400),
  CHAIN_ID:       "8453",
};
