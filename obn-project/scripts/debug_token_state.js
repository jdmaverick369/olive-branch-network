require("dotenv").config(); // Load .env
require("dotenv").config({ path: ".env.airdrop" }); // Load .env.airdrop second

const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_URL);

  const wallet = new ethers.Wallet(process.env.AIRDROP_PRIVATE_KEY, provider);

  const token = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    process.env.OBN_TOKEN_ADDRESS,
    wallet
  );

  const balance = await token.balanceOf(wallet.address);
  const allowance = await token.allowance(wallet.address, process.env.AIRDROPPER_ADDRESS);

  console.log(`🔍 Checking balance for airdrop wallet: ${wallet.address}`);
  console.log(`💰 OBN Balance: ${ethers.formatUnits(balance, 18)}`);
  console.log(`✅ Allowance to AIRDROPPER_ADDRESS (${process.env.AIRDROPPER_ADDRESS}): ${ethers.formatUnits(allowance, 18)}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});