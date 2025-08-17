const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  const addr = process.env.NFT || "0xYourDeployedAddress";
  const nft = await ethers.getContractAt("OliveNFT", addr);

  const seedHex = (process.env.SEED_HEX || ethers.hexlify(ethers.randomBytes(32))).toLowerCase();
  const commit = ethers.keccak256(seedHex);

  console.log("Commit hash:", commit);
  await (await nft.commitMetadataSeed(commit)).wait();
  console.log("✓ committed");

  const out = process.env.SEED_FILE || path.join(__dirname, "..", "reveal-seed.txt");
  fs.writeFileSync(out, seedHex);
  console.log("Saved seed to:", out, "\nContract:", addr);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
