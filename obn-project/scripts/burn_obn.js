// scripts/obn/burn_obn.js
require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const tokenAddr = process.env.OBN_TOKEN_CONTRACT;
  if (!tokenAddr) throw new Error("Missing OBN_TOKEN_CONTRACT in .env");

  // EXACT amount you asked to burn
  const amountStr = "0.39657534";

  const [signer] = await ethers.getSigners();
  const burner = await signer.getAddress();

  console.log(`Network: ${hre.network.name}`);
  console.log(`Token:   ${tokenAddr}`);
  console.log(`Burner:  ${burner}`);

  const token = await ethers.getContractAt("OBNToken", tokenAddr, signer);

  const decimals = await token.decimals();       // should be 18
  const amount = ethers.parseUnits(amountStr, decimals);

  const bal = await token.balanceOf(burner);
  console.log(`Current balance: ${ethers.formatUnits(bal, decimals)} OBN`);
  if (bal < amount) throw new Error("Insufficient OBN balance to burn");

  const tx = await token.burn(amount);
  console.log(`Tx sent: ${tx.hash}`);
  const rcpt = await tx.wait();
  console.log(`✅ Burned ${amountStr} OBN in tx ${rcpt.hash}`);

  const newBal = await token.balanceOf(burner);
  const totalSupply = await token.totalSupply();
  console.log(`New balance:     ${ethers.formatUnits(newBal, decimals)} OBN`);
  console.log(`New totalSupply: ${ethers.formatUnits(totalSupply, decimals)} OBN`);
}

main().catch((e) => { console.error(e); process.exit(1); });