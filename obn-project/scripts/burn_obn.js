// scripts/obn/burn_obn.js
require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  const tokenAddr = process.env.OBN_TOKEN_CONTRACT;
  if (!tokenAddr) throw new Error("Missing OBN_TOKEN_CONTRACT in .env");

  // EXACT amount you asked to burn
  const amountStr = "561287.349924";

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
  console.log(`Tx hash: ${tx.hash}`);
  const rcpt = await tx.wait();
  console.log(`✅ Burned ${amountStr} OBN in block ${rcpt.blockNumber}`);

  const newBal = await token.balanceOf(burner);
  const totalSupply = await token.totalSupply();
  console.log(`New balance:     ${ethers.formatUnits(newBal, decimals)} OBN`);
  console.log(`New totalSupply: ${ethers.formatUnits(totalSupply, decimals)} OBN`);

  // Create burn record
  const timestamp = new Date().toISOString();
  const record = {
    timestamp,
    network: hre.network.name,
    token: tokenAddr,
    burner: burner,
    amount: amountStr,
    amountWei: amount.toString(),
    txHash: rcpt.hash,
    blockNumber: rcpt.blockNumber,
    balanceAfter: ethers.formatUnits(newBal, decimals),
    totalSupplyAfter: ethers.formatUnits(totalSupply, decimals),
  };

  // Save to burns directory
  const burnsDir = path.join(__dirname, "../burns");
  if (!fs.existsSync(burnsDir)) fs.mkdirSync(burnsDir, { recursive: true });

  const filename = `burn-${timestamp.replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(burnsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(record, null, 2));
  console.log(`\n📝 Burn record saved: ${filepath}`);
  console.log(`\n🔗 View on BaseScan: https://basescan.org/tx/${rcpt.hash}`);
}

main().catch((e) => { console.error(e); process.exit(1); });