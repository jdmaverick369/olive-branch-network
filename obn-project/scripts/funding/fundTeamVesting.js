// scripts/fundTeamVesting.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding Team Vesting from:", deployer.address);

  const token = await ethers.getContractAt("OBNToken", process.env.OBN_TOKEN_PROXY);
  const teamVestingAddr = process.env.TEAM_VESTING_ADDRESS;

  if (!teamVestingAddr) throw new Error("❌ TEAM_VESTING_ADDRESS not set in .env!");

  const amount = ethers.parseUnits("100000000", 18); // 100M OBN
  console.log(`⏳ Sending ${ethers.formatUnits(amount, 18)} OBN to Team Vesting: ${teamVestingAddr}`);

  const tx = await token.transfer(teamVestingAddr, amount);
  await tx.wait();

  console.log("✅ Team Vesting funding complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
