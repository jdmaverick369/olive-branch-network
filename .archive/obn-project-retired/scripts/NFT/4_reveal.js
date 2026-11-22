// scripts/NFT/reveal_or_update_base.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const addr =
    process.env.NFT ||
    process.env.NEXT_PUBLIC_OLIVE_NFT ||
    (() => { throw new Error("Set NEXT_PUBLIC_OLIVE_NFT or NFT to your OliveNFT address"); })();

  // Always pass the new base explicitly; no default to old CID.
  // Example: ipfs://bafybeih2bdntvwe2fdgcxmdy2aycmjgcxlymkvlga53yrolwa7zigwheca/Olive
  const base = process.env.METADATA_BASE;
  if (!base) throw new Error("Set METADATA_BASE, e.g. ipfs://<NEW_CID>/Olive");

  const nft = await ethers.getContractAt("OliveNFT", addr);

  // Seed: from env or file (testing default)
  let seed = process.env.COMMIT_SEED_HEX;
  if (!seed) {
    const seedFile = process.env.SEED_FILE || path.join(__dirname, "..", "reveal-seed.txt");
    if (fs.existsSync(seedFile)) {
      seed = fs.readFileSync(seedFile, "utf8").trim();
    }
  }
  if (!seed) {
    // For PRODUCTION you should set COMMIT_SEED_HEX and keep it secret.
    // For testing we can generate one:
    seed = ethers.hexlify(ethers.randomBytes(32));
    console.log("Generated TEST seed:", seed);
  }

  console.log("Contract:", addr);
  console.log("Target baseURI:", base);

  const committed = await nft.metadataSeedCommit();
  const revealed = await nft.revealed();

  if (committed === ethers.ZeroHash && !revealed) {
    console.log("Committing seed hash…");
    await (await nft.commitMetadataSeed(ethers.keccak256(seed))).wait();
  } else {
    console.log("Commit already present.");
  }

  if (!revealed) {
    console.log("Revealing…");
    await (await nft.revealMetadata(seed, base)).wait();
    console.log("✓ Revealed");
  } else {
    console.log("Already revealed → updating baseURI only…");
    await (await nft.setBaseURI(base)).wait();
    console.log("✓ baseURI updated");
  }

  // Quick sanity print
  const supply = Number((await nft.totalSupply()).toString());
  const max = Math.min(supply, Number(process.env.LIMIT || 5));
  function toHttp(u) { return u.replace(/^ipfs:\/\//, "https://gateway.lighthouse.storage/ipfs/"); }

  for (let i = 1; i <= max; i++) {
    const uri = await nft.tokenURI(i);
    console.log(`#${i} -> ${uri} -> ${toHttp(uri)}`);
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
