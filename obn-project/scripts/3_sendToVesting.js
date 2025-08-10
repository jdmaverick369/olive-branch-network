// scripts/sendToVesting.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const tokenAddr = process.env.OBN_TOKEN_ADDRESS;
  const vestAddr  = process.env.TEAM_VESTING_CONTRACT; // <— TeamVesting contract address
  const amountStr = process.env.OBN_TEAM_MIGRATE_AMOUNT; // optional; if missing, moves full balance
  const decimals  = 18;

  if (!tokenAddr || !vestAddr) {
    throw new Error("Missing OBN_TOKEN_ADDRESS or TEAM_VESTING_CONTRACT in .env");
  }

  // Sign with the TEAM wallet (the one currently holding tokens)
  const teamPK = process.env.TEAM_WALLET_PK;
  if (!teamPK) throw new Error("Missing TEAM_WALLET_PK in .env");
  const teamSigner = new ethers.Wallet(teamPK, ethers.provider);
  console.log("Team signer:", await teamSigner.getAddress());

  // ✅ Fully qualified IERC20 (avoids HH701)
  const token = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    tokenAddr,
    teamSigner
  );

  const teamAddr = await teamSigner.getAddress();
  const bal = await token.balanceOf(teamAddr);

  const amount = amountStr
    ? ethers.parseUnits(amountStr, decimals)
    : bal;

  if (bal < amount) {
    throw new Error(`Team balance ${bal} < amount ${amount}`);
  }

  console.log(`Transferring ${amountStr ? amountStr : ethers.formatUnits(amount, decimals)} OBN → ${vestAddr} ...`);
  const tx = await token.transfer(vestAddr, amount);
  await tx.wait();
  console.log("Done. New team balance:", (await token.balanceOf(teamAddr)).toString());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
