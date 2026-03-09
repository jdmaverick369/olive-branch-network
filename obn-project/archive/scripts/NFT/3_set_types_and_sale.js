const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  const addr = process.env.NFT || "0xYourDeployedAddress";
  const nft = await ethers.getContractAt("OliveNFT", addr);

  const MAX = Number((await nft.MAX_SUPPLY()).toString());

  const countsPath = process.env.COUNTS_PATH || path.join(__dirname, "..", "counts50.json");
  let counts;

  if (fs.existsSync(countsPath)) {
    counts = JSON.parse(fs.readFileSync(countsPath, "utf8"));
  } else {
    const N = 50, base = Math.floor(MAX / N), rem = MAX - base * N;
    counts = Array(N).fill(base);
    for (let i = 0; i < rem; i++) counts[i] += 1;
    console.log(`No counts file found; using equal distribution base=${base}, +1 to first ${rem}`);
  }

  if (!Array.isArray(counts) || counts.length !== 50) throw new Error("counts must have 50 ints");
  const sum = counts.reduce((a,b)=>a+b,0);
  if (sum !== MAX) throw new Error(`counts must sum to ${MAX}; got ${sum}`);

  console.log(`Setting 50 type counts (sum=${sum})...`);
  await (await nft.setTypeCounts(counts)).wait();
  console.log("✓ setTypeCounts");

  if ((process.env.FREEZE || "").toLowerCase() === "true") {
    await (await nft.freezeTypeCounts()).wait();
    console.log("✓ freezeTypeCounts");
  }

  if ((process.env.OPEN_SALE ?? "true").toLowerCase() !== "false") {
    await (await nft.setSaleActive(true)).wait();
    console.log("✓ sale active");
  } else {
    console.log("↷ skipped sale active (OPEN_SALE=false)");
  }

  console.log("Done. Contract:", addr);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
