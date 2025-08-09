// scripts/deploy_obn_token.js
const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying OBNToken with account:", deployer.address);

  // --- Inputs ---
  const initialOwner = deployer.address;
  const initialSupply = ethers.parseUnits("1000000000", 18); // 1,000,000,000 OBN

  // --- Env addresses ---
  const liquidityAddress   = process.env.OBN_LIQUIDITY_ADDRESS;
  const airdropAddress     = process.env.OBN_AIRDROP_ADDRESS;
  const charityAddress     = process.env.OBN_CHARITY_FUND_ADDRESS; // NEW
  const treasuryAddress    = process.env.OBN_TREASURY_ADDRESS;
  const teamVestingAddress = process.env.OBN_TEAM_VESTING_ADDRESS;

  // --- Presence checks ---
  if (!liquidityAddress || !airdropAddress || !charityAddress || !treasuryAddress || !teamVestingAddress) {
    throw new Error("Missing one or more .env vars: OBN_LIQUIDITY_ADDRESS, OBN_AIRDROP_ADDRESS, OBN_CHARITY_FUND_ADDRESS, OBN_TREASURY_ADDRESS, OBN_TEAM_VESTING_ADDRESS");
  }

  // --- Address validation ---
  const addrs = {
    liquidityAddress,
    airdropAddress,
    charityAddress,
    treasuryAddress,
    teamVestingAddress,
  };
  for (const [label, addr] of Object.entries(addrs)) {
    if (!ethers.isAddress(addr) || addr === ethers.ZeroAddress) {
      throw new Error(`Invalid ${label}: ${addr}`);
    }
  }

  // --- Allocation preview (40/30/10/10/10) ---
  const hundred = 100n;
  const airdropAmt   = (initialSupply * 40n) / hundred;
  const liquidityAmt = (initialSupply * 30n) / hundred;
  const charityAmt   = (initialSupply * 10n) / hundred;
  const treasuryAmt  = (initialSupply * 10n) / hundred;
  const teamAmt      = (initialSupply * 10n) / hundred;

  console.log("🧮 Initial distribution (OBN):");
  console.log("  Airdrop:   ", ethers.formatUnits(airdropAmt, 18));
  console.log("  Liquidity: ", ethers.formatUnits(liquidityAmt, 18));
  console.log("  Charity:   ", ethers.formatUnits(charityAmt, 18));
  console.log("  Treasury:  ", ethers.formatUnits(treasuryAmt, 18));
  console.log("  Team:      ", ethers.formatUnits(teamAmt, 18));
  console.log("📦 Targets:");
  console.log("  Liquidity:    ", liquidityAddress);
  console.log("  Airdrop:      ", airdropAddress);
  console.log("  Charity Fund: ", charityAddress);
  console.log("  Treasury:     ", treasuryAddress);
  console.log("  Team Vesting: ", teamVestingAddress);

  // --- Deploy proxy ---
  const OBNToken = await ethers.getContractFactory("OBNToken");
  const proxy = await upgrades.deployProxy(
    OBNToken,
    [
      initialOwner,
      initialSupply,
      liquidityAddress,
      airdropAddress,
      charityAddress,     // NEW param order
      treasuryAddress,
      teamVestingAddress,
    ],
    { initializer: "initialize" }
  );

  const addr = await proxy.getAddress();
  console.log("✅ OBNToken (proxy) deployed at:", addr);

  // Optional: wait 1 confirmation for stability
  const tx = proxy.deploymentTransaction?.();
  if (tx) await tx.wait(1);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exitCode = 1;
});
