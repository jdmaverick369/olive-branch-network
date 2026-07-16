const required = [
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_OBN_TOKEN",
  "NEXT_PUBLIC_STAKING_CONTRACT",
  "NEXT_PUBLIC_LENS_CONTRACT",
  "NEXT_PUBLIC_GOVERNANCE_CONTRACT",
  "NEXT_PUBLIC_OLIVE_NFT",
  "NEXT_PUBLIC_WC_PROJECT_ID",
  "NEXT_PUBLIC_SITE_URL",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env.local and replace its placeholder values.");
  process.exit(1);
}

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
if (chainId !== 8453 && chainId !== 84532) {
  console.error("NEXT_PUBLIC_CHAIN_ID must be Base mainnet (8453) or Base Sepolia (84532).");
  process.exit(1);
}

for (const name of [
  "NEXT_PUBLIC_OBN_TOKEN",
  "NEXT_PUBLIC_STAKING_CONTRACT",
  "NEXT_PUBLIC_LENS_CONTRACT",
  "NEXT_PUBLIC_GOVERNANCE_CONTRACT",
  "NEXT_PUBLIC_OLIVE_NFT",
]) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(process.env[name] ?? "")) {
    console.error(`${name} must be a 20-byte EVM address.`);
    process.exit(1);
  }
}

try {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
  if (site.protocol !== "https:" && site.hostname !== "localhost" && site.hostname !== "127.0.0.1") {
    throw new Error("insecure protocol");
  }
} catch {
  console.error("NEXT_PUBLIC_SITE_URL must be a valid HTTPS URL (HTTP is allowed only for localhost).");
  process.exit(1);
}

try {
  const rpc = new URL(process.env.NEXT_PUBLIC_RPC_URL);
  if (rpc.protocol !== "https:" && rpc.hostname !== "localhost" && rpc.hostname !== "127.0.0.1") {
    throw new Error("insecure protocol");
  }
} catch {
  console.error("NEXT_PUBLIC_RPC_URL must be a valid HTTPS URL (HTTP is allowed only for localhost).");
  process.exit(1);
}
