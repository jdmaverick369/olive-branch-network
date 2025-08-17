// scripts/fix_olive_metadata_images.js
// Usage:
//   node scripts/fix_olive_metadata_images.js
//   METADATA_DIR=./path/to/metadata node scripts/fix_olive_metadata_images.js
//
// Adds a --dry flag to preview changes without writing:
//   node scripts/fix_olive_metadata_images.js --dry

const fs = require("fs");
const path = require("path");

const DRY = process.argv.includes("--dry");
const METADATA_DIR = process.env.METADATA_DIR || path.join(process.cwd(), "metadata");

// ipfs://<cid>/images/...  OR  ipfs://<cid>/image/...   -> ipfs://<cid>/...
const stripImagesSegment = (u) =>
  typeof u === "string" ? u.replace(/^ipfs:\/\/([^/]+)\/images?\//i, "ipfs://$1/") : u;

function fixOneFile(filePath) {
  const orig = fs.readFileSync(filePath, "utf8");
  let json;
  try {
    json = JSON.parse(orig);
  } catch (e) {
    console.warn(`⚠️  Skipping (invalid JSON): ${path.basename(filePath)}`);
    return { changed: false };
  }

  let changed = false;

  // Fix "image"
  const oldImage = json.image;
  const newImage = stripImagesSegment(oldImage);
  if (oldImage !== newImage) {
    json.image = newImage;
    changed = true;
  }

  // Fix properties.files[].uri if present
  if (json.properties && Array.isArray(json.properties.files)) {
    json.properties.files = json.properties.files.map((f) => {
      if (!f || typeof f.uri !== "string") return f;
      const oldUri = f.uri;
      const newUri = stripImagesSegment(oldUri);
      if (oldUri !== newUri) {
        changed = true;
        return { ...f, uri: newUri };
      }
      return f;
    });
  }

  if (changed && !DRY) {
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
  }
  return { changed, oldImage, newImage };
}

function main() {
  if (!fs.existsSync(METADATA_DIR)) {
    console.error(`❌ METADATA_DIR not found: ${METADATA_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(METADATA_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"));

  if (files.length === 0) {
    console.log("No .json files found in:", METADATA_DIR);
    return;
  }

  let changedCount = 0;
  for (const f of files) {
    const p = path.join(METADATA_DIR, f);
    const { changed, oldImage, newImage } = fixOneFile(p);
    if (changed) {
      changedCount++;
      console.log(`${DRY ? "[dry]" : "fixed"}: ${f}`);
      if (oldImage && newImage) console.log(`  ${oldImage}  ->  ${newImage}`);
    }
  }

  console.log(
    `${DRY ? "Previewed" : "Updated"} ${changedCount} file(s) in ${METADATA_DIR}.`
  );
}

main();
