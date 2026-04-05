/**
 * fund_airdrop.js
 * Called by the funder wallet (OBN_AIRDROP_ADDRESS) after the airdrop contract is deployed.
 * Approves the airdrop contract to spend OBN, then calls fund(amount).
 *
 * This script uses AIRDROP_FUNDER_PK as the signer — NOT the deployer PRIVATE_KEY.
 * The funder address must match the immutable `funder` set at deployment.
 *
 * Usage:
 *   npx hardhat run scripts/fund_airdrop.js --network base_sepolia   # testnet
 *   npx hardhat run scripts/fund_airdrop.js --network base           # mainnet
 *
 * Required env vars:
 *   AIRDROP_FUNDER_PK        — private key of 0xA699c2885cC72398430a8a75c80406C2b6A7B096
 *   AIRDROP_CONTRACT         — deployed OBNAirdropClaim address (set after deploy_airdrop.js)
 *   OBN_TOKEN_CONTRACT       — OBN ERC-20 address
 *   AIRDROP_FUND_AMOUNT      — amount in human OBN units (e.g. 50000000 for 50M OBN)
 */

require("dotenv").config();
const { ethers } = require("hardhat");

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const AIRDROP_ABI = [
  "function fund(uint256 amount) external",
  "function funder() view returns (address)",
  "function authorizedFunds() view returns (uint256)",
  "function claimsLive() view returns (bool)",
];

function mustAddr(val, name) {
  if (!val || !/^0x[a-fA-F0-9]{40}$/.test(val)) {
    throw new Error(`❌ Missing or invalid address for ${name}: "${val}"`);
  }
  return val;
}

function mustPK(val, name) {
  if (!val || val.trim() === "") throw new Error(`❌ ${name} is not set in .env`);
  return val.trim().startsWith("0x") ? val.trim() : `0x${val.trim()}`;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const isMainnet = Number(network.chainId) === 8453;

  console.log(`\n🌐 Network: ${network.name} (chainId ${network.chainId})`);

  // ---- Resolve env ----
  const FUNDER_PK       = mustPK(process.env.AIRDROP_FUNDER_PK,    "AIRDROP_FUNDER_PK");
  const AIRDROP         = mustAddr(process.env.AIRDROP_CONTRACT,     "AIRDROP_CONTRACT");
  const TOKEN           = mustAddr(process.env.OBN_TOKEN_CONTRACT,   "OBN_TOKEN_CONTRACT");
  const AMOUNT_HUMAN    = process.env.AIRDROP_FUND_AMOUNT;
  if (!AMOUNT_HUMAN || isNaN(Number(AMOUNT_HUMAN))) {
    throw new Error("❌ AIRDROP_FUND_AMOUNT is not set or not a number");
  }

  // ---- Build funder signer ----
  const provider = ethers.provider;
  const funderWallet = new ethers.Wallet(FUNDER_PK, provider);
  console.log(`👤 Funder  : ${funderWallet.address}`);

  const token   = new ethers.Contract(TOKEN,   TOKEN_ABI,   funderWallet);
  const airdrop = new ethers.Contract(AIRDROP, AIRDROP_ABI, funderWallet);

  // ---- Verify funder matches contract ----
  const contractFunder = await airdrop.funder();
  if (contractFunder.toLowerCase() !== funderWallet.address.toLowerCase()) {
    throw new Error(
      `❌ Address mismatch.\n` +
      `   AIRDROP_FUNDER_PK resolves to : ${funderWallet.address}\n` +
      `   contract.funder()             : ${contractFunder}\n` +
      `   These must match.`
    );
  }
  console.log(`✅ Funder address matches contract.funder()`);

  // ---- Resolve amount ----
  const decimals = await token.decimals();
  const amountWei = ethers.parseUnits(AMOUNT_HUMAN, decimals);
  console.log(`\n💰 Fund amount : ${AMOUNT_HUMAN} OBN`);
  console.log(`   In wei       : ${amountWei.toString()}`);

  // ---- Check OBN balance ----
  const balance = await token.balanceOf(funderWallet.address);
  console.log(`   Wallet balance : ${ethers.formatUnits(balance, decimals)} OBN`);
  if (balance < amountWei) {
    throw new Error(
      `❌ Insufficient OBN balance.\n` +
      `   Have: ${ethers.formatUnits(balance, decimals)} OBN\n` +
      `   Need: ${AMOUNT_HUMAN} OBN`
    );
  }

  // ---- Check campaign not already live ----
  const live = await airdrop.claimsLive();
  if (live) {
    console.warn("⚠️  claimsLive is already true — you are topping up an active campaign.");
  }

  if (isMainnet) {
    console.log("\n⚠️  MAINNET detected. You have 10 seconds to cancel (Ctrl+C)…");
    await new Promise((r) => setTimeout(r, 10_000));
  }

  // ---- Step 1: approve ----
  const currentAllowance = await token.allowance(funderWallet.address, AIRDROP);
  if (currentAllowance < amountWei) {
    process.stdout.write(`\n📝 Approving ${AMOUNT_HUMAN} OBN to airdrop contract… `);
    const approveTx = await token.approve(AIRDROP, amountWei);
    await approveTx.wait();
    console.log(`✅ (tx: ${approveTx.hash})`);
  } else {
    console.log(`\n✅ Allowance already sufficient (${ethers.formatUnits(currentAllowance, decimals)} OBN). Skipping approve.`);
  }

  // ---- Step 2: fund ----
  process.stdout.write(`💸 Calling fund(${amountWei})… `);
  const fundTx = await airdrop.fund(amountWei);
  await fundTx.wait();
  console.log(`✅ (tx: ${fundTx.hash})`);

  // ---- Confirm ----
  const authorized = await airdrop.authorizedFunds();
  console.log(`\n✅ authorizedFunds is now: ${ethers.formatUnits(authorized, decimals)} OBN`);

  const explorerBase = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Airdrop contract funded successfully.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contract  : ${AIRDROP}
Explorer  : ${explorerBase}/address/${AIRDROP}
Funded    : ${AMOUNT_HUMAN} OBN
Remaining : ${ethers.formatUnits(authorized, decimals)} OBN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEP:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When ready to open claims, the OWNER wallet must call:
  OBNAirdropClaim.startClaims()

Contract : ${AIRDROP}
Owner    : ${process.env.OWNER_ADDRESS ?? "(set OWNER_ADDRESS in .env)"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
