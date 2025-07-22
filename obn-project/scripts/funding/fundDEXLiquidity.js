// scripts/fundDEXLiquidity.js
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Funding DEX liquidity from: ${deployer.address}`);

  const token = await ethers.getContractAt("OBNToken", process.env.OBN_TOKEN_PROXY);

  // Total 60% of 1B OBN = 600,000,000 OBN
  const total = ethers.parseUnits("600000000", 18);

  // Split 50/50 between Uniswap and BaseSwap
  const half = total / 2n;

  // 👇 Replace with your actual liquidity wallet addresses
  const UNI_ADDRESS = "0x61949528bDd5983D0a630661c7AF4bdF856e2dFf";   // 🔥 Uniswap liquidity wallet
  const BASE_ADDRESS = "0x50019e0547864E67b56222207Df0123fe199DB27";  // 🔥 BaseSwap liquidity wallet

  console.log(`⏳ Sending ${ethers.formatUnits(half, 18)} OBN to Uniswap wallet: ${UNI_ADDRESS}`);
  await (await token.transfer(UNI_ADDRESS, half)).wait();

  console.log(`⏳ Sending ${ethers.formatUnits(half, 18)} OBN to BaseSwap wallet: ${BASE_ADDRESS}`);
  await (await token.transfer(BASE_ADDRESS, half)).wait();

  console.log("✅ DEX liquidity funding complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
