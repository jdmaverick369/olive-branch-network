const { ethers } = require("hardhat");

async function main() {
  const NAME  = process.env.NAME  || "OliveNFT";
  const SYMBOL = process.env.SYMBOL || "OLIVE";
  // Use a real placeholder if you have one
  const UNREVEALED_URI =
    process.env.UNREVEALED_URI ||
    "ipfs://bafybeia5lcarelrrme4o5id6ocmzg7zxtrsna4chusyt5h7ow42uwpn5vq/Olive1.json";

  const OliveNFT = await ethers.getContractFactory("OliveNFT");
  const nft = await OliveNFT.deploy(NAME, SYMBOL, UNREVEALED_URI);
  await nft.waitForDeployment();

  console.log("OliveNFT deployed to:", nft.target);
  console.log("\nVerify (Basescan):");
  console.log(
    `npx hardhat verify --network base_sepolia ${nft.target} "${NAME}" "${SYMBOL}" "${UNREVEALED_URI}"`
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
