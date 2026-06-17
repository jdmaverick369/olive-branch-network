// scripts/9_approve_airdropper.js
// Loads .env first, then .env.airdrop (which can override/add keys)
require("dotenv").config();
require("dotenv").config({ path: ".env.airdrop" });

const { ethers } = require("hardhat");

async function main() {
  const {
    BASE_MAINNET_URL,
    AIRDROP_PRIVATE_KEY,
    OBN_TOKEN_CONTRACT,
    AIRDROPPER_ADDRESS,
    AIRDROP_APPROVE_AMOUNT, // optional override (human units), default 400,000,000
  } = process.env;

  if (!BASE_MAINNET_URL) throw new Error("Missing BASE_MAINNET_URL in env.");
  if (!AIRDROP_PRIVATE_KEY) throw new Error("Missing AIRDROP_PRIVATE_KEY in env.");
  if (!OBN_TOKEN_CONTRACT) throw new Error("Missing OBN_TOKEN_CONTRACT in env.");
  if (!AIRDROPPER_ADDRESS) throw new Error("Missing AIRDROPPER_ADDRESS in env.");

  if (!ethers.isAddress(OBN_TOKEN_CONTRACT)) throw new Error("OBN_TOKEN_CONTRACT is not a valid address.");
  if (!ethers.isAddress(AIRDROPPER_ADDRESS)) throw new Error("AIRDROPPER_ADDRESS is not a valid address.");

  const provider = new ethers.JsonRpcProvider(BASE_MAINNET_URL);
  const wallet = new ethers.Wallet(AIRDROP_PRIVATE_KEY, provider);

  // Allow override via env, else default to 400,000,000 OBN (18 decimals)
  const humanAmount = (AIRDROP_APPROVE_AMOUNT ?? "400000000").trim();
  const amount = ethers.parseUnits(humanAmount, 18);

  const token = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    OBN_TOKEN_CONTRACT,
    wallet
  );

  console.log(`🔗 Network RPC: ${BASE_MAINNET_URL.includes("alchemy") ? "Alchemy (Base mainnet)" : BASE_MAINNET_URL}`);
  console.log(`🧾 Token: ${OBN_TOKEN_CONTRACT}`);
  console.log(`📬 Airdropper: ${AIRDROPPER_ADDRESS}`);
  console.log(`📝 Approving: ${ethers.formatUnits(amount, 18)} OBN`);

  const tx = await token.approve(AIRDROPPER_ADDRESS, amount);
  console.log("⏳ Approving… TX:", tx.hash);
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error("Approve failed (status 0).");

  console.log(
    `✅ Approved ${ethers.formatUnits(amount, 18)} OBN for airdropper at ${AIRDROPPER_ADDRESS} in block ${rc.blockNumber}`
  );
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
