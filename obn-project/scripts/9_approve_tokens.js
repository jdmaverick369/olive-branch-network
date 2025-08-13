require("dotenv").config(); // Load .env
require("dotenv").config({ path: ".env.airdrop" }); // Load .env.airdrop second

const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_URL);
  const wallet = new ethers.Wallet(process.env.AIRDROP_PRIVATE_KEY, provider);

  const token = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    process.env.OBN_TOKEN_CONTRACT,
    wallet
  );

  const amount = ethers.parseUnits("400000000", 18); // Approve full balance

  const tx = await token.approve(process.env.AIRDROPPER_ADDRESS, amount);
  console.log("⏳ Approving...");
  await tx.wait();

  console.log(`✅ Approved ${ethers.formatUnits(amount, 18)} OBN for airdropper at ${process.env.AIRDROPPER_ADDRESS}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
