// scripts/governance/snapshot_stakers.js
// Gets current stakers from Dune API
// Dune Query: https://dune.com/queries/5888061

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

const DUNE_QUERY_ID = 5888061;
const DUNE_API_KEY = process.env.DUNE_API_KEY;

function fetchDuneData() {
  return new Promise((resolve, reject) => {
    const url = `https://api.dune.com/api/v1/query/${DUNE_QUERY_ID}/results/csv?limit=10000`;

    const options = {
      headers: {
        "X-Dune-API-Key": DUNE_API_KEY,
      },
    };

    https.get(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Dune API error: ${res.statusCode} - ${data}`));
          return;
        }
        resolve(data);
      });
    }).on("error", reject);
  });
}

async function main() {
  console.log("=== AIRDROP STAKER SNAPSHOT ===\n");

  if (!DUNE_API_KEY) {
    console.error("❌ Error: DUNE_API_KEY not set in .env");
    console.error("Please add your Dune API key to .env:");
    console.error("  DUNE_API_KEY=your_api_key_here");
    process.exit(1);
  }

  try {
    console.log("⏳ Fetching staker data from Dune...\n");

    const csvData = await fetchDuneData();
    const lines = csvData.trim().split("\n");

    if (lines.length < 2) {
      console.error("❌ No data returned from Dune");
      process.exit(1);
    }

    // Parse CSV from Dune
    // Columns: rank, user_addr, net_staked, total_deposited, total_withdrawn, pct_of_total, ...
    const stakers = [];
    let totalTVL = 0n;

    // Parse header to find column indices
    const header = lines[0].split(",");
    const addressIdx = header.findIndex(h => h.trim().toLowerCase() === "user_addr");
    const balanceIdx = header.findIndex(h => h.trim().toLowerCase() === "net_staked");

    if (addressIdx === -1 || balanceIdx === -1) {
      console.error("❌ Could not find required columns in Dune CSV");
      console.error("Found columns:", header);
      process.exit(1);
    }

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length <= Math.max(addressIdx, balanceIdx)) continue;

      const address = parts[addressIdx].trim();
      const balance = parts[balanceIdx].trim();

      if (!address || !balance) continue;

      try {
        // Handle scientific notation from Dune (e.g., "1e+07")
        let balanceNum = parseFloat(balance);
        if (isNaN(balanceNum) || balanceNum <= 0) continue;

        // Convert to wei (multiply by 1e18)
        const balanceBN = BigInt(Math.floor(balanceNum * 1e18));

        stakers.push({
          address,
          balance: balanceBN.toString(),
          balanceFormatted: balanceNum,
        });
        totalTVL += balanceBN;
      } catch (e) {
        // skip malformed lines
      }
    }

    // Sort by balance descending
    stakers.sort((a, b) => b.balanceFormatted - a.balanceFormatted);

    console.log("=== RESULTS ===\n");
    console.log(`✅ Active stakers: ${stakers.length}`);
    console.log(`💰 Total TVL: ${(totalTVL / BigInt(10 ** 18)).toString()} OBN\n`);

    // Save to file
    const outDir = path.join(__dirname, "../../snapshots");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = path.join(outDir, `stakers-airdrop-${ts}.json`);

    const output = {
      timestamp: new Date().toISOString(),
      totalStakers: stakers.length,
      totalTVL: totalTVL.toString(),
      totalTVLFormatted: Number(totalTVL) / 1e18,
      stakers: stakers.map((s) => s.address),
      detailed: stakers,
    };

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`💾 Saved: ${outPath}\n`);

    // Print top stakers
    console.log("=== TOP STAKERS ===\n");
    stakers.slice(0, 20).forEach((s, i) => {
      console.log(`${i + 1}. ${s.address}`);
      console.log(`   Balance: ${s.balanceFormatted.toFixed(2)} OBN\n`);
    });

    if (stakers.length > 20) {
      console.log(`... and ${stakers.length - 20} more stakers`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
