// scripts/checkPoolLength.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const staking = await ethers.getContractAt(
    "StakingPools",
    process.env.STAKING_CONTRACT // from your .env
  );
  const length = await staking.poolLength();
  console.log("✅ poolLength =", length.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
