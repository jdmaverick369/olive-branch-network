// Quick script to check the latest minted NFT and its metadata
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  // Get contract address from args or env
  const NFT_ADDRESS = process.env.NFT_ADDRESS || process.env.NFT || "0xB66F67444b09f509D72d832567C2df84Edeb80F8";

  console.log("=== Checking Latest OliveNFT ===\n");
  console.log("Contract:", NFT_ADDRESS);
  console.log();

  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const nft = new ethers.Contract(NFT_ADDRESS, [
    "function totalSupply() view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function tokenType(uint256) view returns (uint256)",
    "function tokenURI(uint256) view returns (string)",
    "function revealed() view returns (bool)"
  ], provider);

  // Get total supply to find the latest token
  const totalSupply = await nft.totalSupply();
  console.log("Total Supply:", totalSupply.toString());

  if (totalSupply === 0n) {
    console.log("No NFTs have been minted yet.");
    return;
  }

  // Get the latest token ID (assuming sequential minting)
  const latestTokenId = totalSupply; // or use tokenByIndex if needed
  console.log("Latest Token ID:", latestTokenId.toString());
  console.log();

  try {
    // Get owner
    const owner = await nft.ownerOf(latestTokenId);
    console.log("Owner:", owner);

    // Get token type (which metadata file it uses)
    const tokenType = await nft.tokenType(latestTokenId);
    console.log("Token Type (Olive number):", tokenType.toString());

    // Get full tokenURI
    const tokenURI = await nft.tokenURI(latestTokenId);
    console.log("Token URI:", tokenURI);
    console.log();

    // Parse out the Olive number from URI
    const match = tokenURI.match(/Olive(\d+)\.json/);
    if (match) {
      console.log(`This NFT uses metadata: Olive${match[1]}.json`);
      console.log(`IPFS Gateway URL: ${tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')}`);
    } else {
      const simpleMatch = tokenURI.match(/(\d+)\.json/);
      if (simpleMatch) {
        console.log(`This NFT uses metadata: ${simpleMatch[1]}.json`);
        console.log(`IPFS Gateway URL: ${tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')}`);
      }
    }

    // Check if revealed
    const revealed = await nft.revealed();
    console.log("Revealed:", revealed);

  } catch (error) {
    console.error("Error fetching NFT data:");
    console.error(error.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
