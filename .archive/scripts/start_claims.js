/**
 * start_claims.js
 * Called by the owner wallet to open the airdrop campaign.
 * Irreversible — once startClaims() is called, claims are live.
 * Use pause() to halt the campaign if needed after this point.
 *
 * Usage:
 *   npx hardhat run scripts/start_claims.js --network base_sepolia   # testnet
 *   npx hardhat run scripts/start_claims.js --network base           # mainnet
 *
 * Required env vars:
 *   PRIVATE_KEY        — owner wallet private key
 *   AIRDROP_CONTRACT   — deployed OBNAirdropClaim address
 */

require("dotenv").config();
const { ethers } = require("hardhat");

const AIRDROP_ABI = [
  "function startClaims() external",
  "function claimsLive() view returns (bool)",
  "function authorizedFunds() view returns (uint256)",
  "function owner() view returns (address)",
  "function funder() view returns (address)",
  "function paused() view returns (bool)",
];

const TOKEN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function mustAddr(val, name) {
  if (!val || !/^0x[a-fA-F0-9]{40}$/.test(val)) {
    throw new Error(`❌ Missing or invalid address for ${name}: "${val}"`);
  }
  return val;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const isMainnet = Number(network.chainId) === 8453;

  console.log(`\n🌐 Network: ${network.name} (chainId ${network.chainId})`);

  // ---- Resolve env ----
  const AIRDROP = mustAddr(process.env.AIRDROP_CONTRACT, "AIRDROP_CONTRACT");
  const TOKEN   = mustAddr(process.env.OBN_TOKEN_CONTRACT, "OBN_TOKEN_CONTRACT");

  const [owner] = await ethers.getSigners();
  console.log(`👤 Owner   : ${owner.address}`);

  const airdrop = new ethers.Contract(AIRDROP, AIRDROP_ABI, owner);
  const token   = new ethers.Contract(TOKEN,   TOKEN_ABI,   owner);

  // ---- Pre-flight checks ----
  console.log("\n🔍 Running pre-flight checks…");

  const contractOwner = await airdrop.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(
      `❌ Signer is not the owner.\n` +
      `   PRIVATE_KEY resolves to : ${owner.address}\n` +
      `   contract.owner()        : ${contractOwner}\n` +
      `   Only the owner can call startClaims().`
    );
  }
  console.log(`   ✅ Signer is contract owner`);

  const alreadyLive = await airdrop.claimsLive();
  if (alreadyLive) {
    throw new Error(`❌ claimsLive is already true — campaign is already open.`);
  }
  console.log(`   ✅ Campaign not yet started`);

  const isPaused = await airdrop.paused();
  if (isPaused) {
    throw new Error(`❌ Contract is paused. Unpause before starting claims.`);
  }
  console.log(`   ✅ Contract is not paused`);

  const authorized = await airdrop.authorizedFunds();
  if (authorized === 0n) {
    throw new Error(`❌ authorizedFunds is 0. Run fund_airdrop.js first.`);
  }

  const decimals = await token.decimals();
  const contractBal = await token.balanceOf(AIRDROP);
  console.log(`   ✅ authorizedFunds : ${ethers.formatUnits(authorized, decimals)} OBN`);
  console.log(`   ✅ Contract balance: ${ethers.formatUnits(contractBal, decimals)} OBN`);

  if (contractBal < authorized) {
    throw new Error(
      `❌ Contract token balance (${ethers.formatUnits(contractBal, decimals)} OBN) ` +
      `is less than authorizedFunds (${ethers.formatUnits(authorized, decimals)} OBN). ` +
      `Something is wrong — do not proceed.`
    );
  }
  console.log(`   ✅ Balance matches authorizedFunds`);

  const funder = await airdrop.funder();
  console.log(`\n📋 Summary:`);
  console.log(`   Contract         : ${AIRDROP}`);
  console.log(`   Owner            : ${owner.address}`);
  console.log(`   Funder           : ${funder}`);
  console.log(`   Authorized funds : ${ethers.formatUnits(authorized, decimals)} OBN`);

  if (isMainnet) {
    console.log("\n⚠️  MAINNET detected.");
    console.log("   This will open claims IRREVERSIBLY. Use pause() to halt after this point.");
    console.log("   You have 10 seconds to cancel (Ctrl+C)…");
    await new Promise((r) => setTimeout(r, 10_000));
  }

  // ---- Call startClaims ----
  process.stdout.write(`\n🚀 Calling startClaims()… `);
  const tx = await airdrop.startClaims();
  await tx.wait();
  console.log(`✅ (tx: ${tx.hash})`);

  // ---- Confirm ----
  const live = await airdrop.claimsLive();
  if (!live) {
    throw new Error(`❌ claimsLive is still false after tx — something went wrong.`);
  }

  const explorerBase = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Claims are now LIVE.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contract  : ${AIRDROP}
Explorer  : ${explorerBase}/address/${AIRDROP}
Funds     : ${ethers.formatUnits(authorized, decimals)} OBN available

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To pause the campaign at any time:
  OBNAirdropClaim.pause()   — halts all claims
  OBNAirdropClaim.unpause() — resumes after investigation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
