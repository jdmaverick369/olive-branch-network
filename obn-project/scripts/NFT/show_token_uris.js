const { ethers } = require("hardhat");
function ipfsToGateway(u){ return u.replace(/^ipfs:\/\//, "https://gateway.lighthouse.storage/ipfs/"); }

async function main(){
  const addr = process.env.NFT || process.env.NEXT_PUBLIC_OLIVE_NFT || "0xYourDeployedAddress";
  console.log("Reading contract:", addr);
  const nft = await ethers.getContractAt("OliveNFT", addr);

  const supply = Number((await nft.totalSupply()).toString());
  const revealed = await nft.revealed();
  console.log("totalSupply:", supply, "revealed:", revealed);

  const max = Math.min(supply, Number(process.env.LIMIT || 5));
  for (let i = 1; i <= max; i++){
    const tt = revealed ? await nft.tokenType(i) : 0;
    const uri = await nft.tokenURI(i);
    console.log(`#${i} type=${tt} uri=${uri}`);
    console.log("   gateway:", ipfsToGateway(uri));
  }
}
main().catch(e=>{ console.error(e); process.exit(1); });
