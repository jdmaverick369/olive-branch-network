const { ethers } = require("hardhat");
async function main(){
  const addr = process.env.NFT || "0xYourDeployedAddress";
  const nft = await ethers.getContractAt("OliveNFT", addr);
  const price = ethers.parseEther("0.005");
  const before = Number((await nft.totalSupply()).toString());
  await (await nft.mint({ value: price })).wait();
  const after = Number((await nft.totalSupply()).toString());
  console.log(`✓ minted tokenId ${before + 1} (totalSupply now ${after})`);
}
main().catch(e=>{ console.error(e); process.exit(1); });
