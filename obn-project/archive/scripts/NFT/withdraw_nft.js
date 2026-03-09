require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const addr = process.env.NFT;                 // 0x...
  const to   = process.env.WITHDRAW_TO;         // 0x treasury
  if (!addr || !to) throw new Error("Set NFT and WITHDRAW_TO in env");

  const nft = await ethers.getContractAt("OliveNFT", addr);
  const owner = await nft.owner();
  console.log("Owner:", owner);

  const bal = await ethers.provider.getBalance(addr);
  console.log("Contract balance:", ethers.formatEther(bal), "ETH");
  if (bal === 0n) return console.log("Nothing to withdraw.");

  const tx = await nft.withdraw(to);
  console.log("Withdrawing…", tx.hash);
  await tx.wait();
  console.log("✅ Done.");
}

main().catch((e)=>{ console.error(e); process.exit(1); });
