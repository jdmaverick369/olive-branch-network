// Runs the dev server pointed at real Base mainnet instead of the local
// Anvil fork, on a separate port so it can run side-by-side with `npm run dev`.
// Only overrides the RPC vars — everything else still comes from .env.local.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const envFile = path.join(__dirname, "..", ".env.mainnet.local");

if (!fs.existsSync(envFile)) {
  console.error(`Missing ${envFile} — create it with NEXT_PUBLIC_RPC_URL / BASE_RPC_URL set to real mainnet endpoints.`);
  process.exit(1);
}

for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

process.env.NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || ".next-mainnet";
const port = process.env.PORT || "3001";
console.log(`Starting dev server against real Base mainnet on http://localhost:${port} ...`);

const next = spawn(
  "npx",
  ["next", "dev", "--turbopack", "--port", port],
  { stdio: "inherit", env: process.env, shell: process.platform === "win32" }
);
next.on("exit", (code) => process.exit(code ?? 0));
