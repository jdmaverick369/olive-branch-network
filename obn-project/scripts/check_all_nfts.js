// Check all minted NFTs and their metadata URIs
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const NFT_ADDRESS = process.env.NFT || "0xB66F67444b09f509D72d832567C2df84Edeb80F8";

  console.log("=== Checking All OliveNFTs ===\n");
  console.log("Contract:", NFT_ADDRESS);
  console.log();

  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const nft = new ethers.Contract(NFT_ADDRESS, [
    "function totalSupply() view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function tokenType(uint256) view returns (uint256)",
    "function tokenURI(uint256) view returns (string)",
  ], provider);

  const totalSupply = await nft.totalSupply();
  console.log("Total Supply:", totalSupply.toString());
  console.log();

  for (let i = 1; i <= totalSupply; i++) {
    try {
      const owner = await nft.ownerOf(i);
      const tokenType = await nft.tokenType(i);
      const tokenURI = await nft.tokenURI(i);

      console.log(`Token #${i}:`);
      console.log(`  Owner: ${owner}`);
      console.log(`  Type: Olive${tokenType}`);
      console.log(`  URI: ${tokenURI}`);
      console.log();
    } catch (error) {
      console.log(`Token #${i}: Error - ${error.message}`);
      console.log();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
