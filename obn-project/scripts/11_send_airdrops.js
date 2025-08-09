const fs = require("fs");
const csv = require("csv-parser");
const { ethers } = require("hardhat");

// ✅ Load environment variables from .env.airdrop
require("dotenv").config({ path: ".env.airdrop" });

// ✅ Constants from env
const AIRDROPPER_ADDRESS = process.env.AIRDROPPER_ADDRESS;
const BASE_SEPOLIA_URL = process.env.BASE_SEPOLIA_URL;
const AIRDROP_PRIVATE_KEY = process.env.AIRDROP_PRIVATE_KEY;
const CSV_FILE_PATH = "./airdrop_list.csv";
const CHUNK_SIZE = 300;
const DECIMALS = 18;

console.log("🔐 Loaded AIRDROP_PRIVATE_KEY and AIRDROPPER_ADDRESS:", AIRDROPPER_ADDRESS);

// ✅ Helper to load and parse CSV
async function loadCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        if (ethers.isAddress(data.address)) {
          results.push({
            address: data.address.trim(),
            amount: ethers.parseUnits(data.amount.trim(), DECIMALS),
          });
        }
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

async function main() {
  // ✅ Set up provider and signer
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_URL);
  const signer = new ethers.Wallet(AIRDROP_PRIVATE_KEY, provider);

  // ✅ Contract interface
  const abi = [
    "function batchAirdrop(address[] calldata recipients, uint256[] calldata amounts) external",
  ];
  const contract = new ethers.Contract(AIRDROPPER_ADDRESS, abi, signer);

  // ✅ Load recipients and amounts
  const data = await loadCsv(CSV_FILE_PATH);
  console.log(`📦 Total recipients loaded from CSV: ${data.length}`);

  // ✅ Loop through in chunks
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const batch = data.slice(i, i + CHUNK_SIZE);
    const recipients = batch.map((x) => x.address);
    const amounts = batch.map((x) => x.amount);

    console.log(`🚀 Sending batch ${i / CHUNK_SIZE + 1} (${recipients.length} addresses)...`);

    try {
      const tx = await contract.batchAirdrop(recipients, amounts);
      console.log(`⏳ TX sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ TX confirmed in block ${receipt.blockNumber}. Gas used: ${receipt.gasUsed}`);
    } catch (err) {
      console.error(`❌ TX failed for batch ${i / CHUNK_SIZE + 1}`);
      console.error("Recipients:", recipients);
      console.error("Amounts:", amounts.map((a) => a.toString()));
      console.error("Error:", err.message);
      throw err;
    }
  }

  console.log("🎉 All airdrop batches completed.");
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});