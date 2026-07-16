import { ethers } from "ethers";

export const runtime = "nodejs"; // ensure Node runtime

const erc20Abi = [
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

const RPC_URL =
  process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "";
const TOKEN_ADDRESS =
  process.env.TOKEN_ADDRESS || process.env.NEXT_PUBLIC_OBN_TOKEN || "";
const NON_CIRC_ADDRESSES = (process.env.NON_CIRC_ADDRESSES || "")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

if (!RPC_URL) throw new Error("Missing RPC_URL (or NEXT_PUBLIC_RPC_URL)");
if (!TOKEN_ADDRESS) throw new Error("Missing TOKEN_ADDRESS (or NEXT_PUBLIC_OBN_TOKEN)");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const token = new ethers.Contract(TOKEN_ADDRESS, erc20Abi, provider);

async function getTotalSupplyRaw(): Promise<bigint> {
  return token.totalSupply();
}
async function getDecimals(): Promise<number> {
  return Number(await token.decimals());
}

export async function getTotalSupply(): Promise<string> {
  const [raw, dec] = await Promise.all([getTotalSupplyRaw(), getDecimals()]);
  return ethers.formatUnits(raw, dec);
}

export async function getCirculatingSupply(): Promise<string> {
  const [rawTotal, dec] = await Promise.all([getTotalSupplyRaw(), getDecimals()]);

  let nonCircSum = 0n;
  if (NON_CIRC_ADDRESSES.length) {
    const bals = await Promise.all(
      NON_CIRC_ADDRESSES.map((addr) => token.balanceOf(addr))
    );
    nonCircSum = bals.reduce((a, b) => a + b, 0n);
  }

  const circ = rawTotal - nonCircSum;
  return ethers.formatUnits(circ < 0n ? 0n : circ, dec);
}

export function cacheHeaders() {
  return {
    "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
  };
}

export function plainTextCacheHeaders() {
  return {
    ...cacheHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
  };
}
