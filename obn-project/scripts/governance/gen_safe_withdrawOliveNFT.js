// scripts/governance/gen_safe_withdrawOliveNFT.js
// Generates Safe JSONs to withdraw OliveNFT mint proceeds through the Timelock.
//
// OliveNFT.withdraw(to) sends the contract's ENTIRE ETH balance at execution time —
// anything minted between schedule and execute is included. The destination is a call
// argument, not stored state; it is baked into the scheduled calldata and cannot change
// without a new schedule. Defaults to the official Treasury Safe.
//
// Usage:
//   node scripts/governance/gen_safe_withdrawOliveNFT.js --action schedule [--to 0xDEST]
//   SALT=0x... OP_ID=0x... node scripts/governance/gen_safe_withdrawOliveNFT.js --action execute [--to 0xDEST]
"use strict";
const { ethers } = require("ethers");
const minimist   = require("minimist");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");

// Kept here rather than in addresses.js, whose bytes are pinned by the Assembly release manifests.
const OLIVE_NFT     = process.env.OLIVE_NFT_ADDR || "0xB66F67444b09f509D72d832567C2df84Edeb80F8";
const TREASURY_SAFE = process.env.TREASURY_SAFE  || "0x95F77e2d554a03d7C6d83e6cdeB8Bff7D8E81353";

const ABI = [
  "function withdraw(address to) external",
  "function owner() view returns (address)",
];

function mustAddr(a, name) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing → ${a}`);
  return ethers.getAddress(a.toLowerCase());
}

async function main() {
  const argv   = minimist(process.argv.slice(2), { string: ["to"] });
  const action = argv.action;
  if (action !== "schedule" && action !== "execute")
    throw new Error('❌ --action must be "schedule" or "execute"');

  const to = mustAddr(argv.to || TREASURY_SAFE, "--to");

  const rpcUrl   = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const nft      = new ethers.Contract(OLIVE_NFT, ABI, provider);

  // The Timelock must own OliveNFT, otherwise executeBatch reverts on onlyOwner.
  const owner = await nft.owner();
  if (owner.toLowerCase() !== addrs.TIMELOCK.toLowerCase())
    throw new Error(`❌ OliveNFT owner is ${owner}, not the Timelock ${addrs.TIMELOCK}.`);

  // Address.sendValue forwards all gas, but a contract with no payable receive still reverts.
  // Require the destination to be a deployed contract (Safe) so a typo can't land on a fresh EOA.
  const code = await provider.getCode(to);
  if (code === "0x")
    throw new Error(`❌ ${to} has no code — expected a Safe. Refusing to send proceeds to an EOA.`);

  const balance = await provider.getBalance(OLIVE_NFT);

  const calldata = new ethers.Interface(ABI).encodeFunctionData("withdraw", [to]);
  const label    = "withdrawOliveNFT";

  console.log(`\nOliveNFT:     ${OLIVE_NFT} (owner = Timelock ✅)`);
  console.log(`Destination:  ${to}${to === ethers.getAddress(TREASURY_SAFE.toLowerCase()) ? " (Treasury Safe)" : ""}`);
  console.log(`Balance now:  ${ethers.formatEther(balance)} ETH (entire balance at execute time is sent)`);

  if (action === "schedule") {
    scheduleOne({ target: OLIVE_NFT, calldata, label });
  } else {
    executeOne({ target: OLIVE_NFT, calldata, label });
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
