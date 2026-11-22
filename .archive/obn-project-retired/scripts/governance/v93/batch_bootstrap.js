// scripts/governance/batch_bootstrap.js
// Phase 7: bootstrap voting checkpoints for all pre-upgrade stakers.
//
// batchBootstrap is permissionless — no Safe or Timelock required.
// Scans all Deposit events from proxy deployment to upgradeBlock,
// then calls batchBootstrap for every staker with no checkpoint yet.
//
// Usage:
//   npx hardhat run scripts/governance/batch_bootstrap.js --network base
//
// Env overrides (optional):
//   FROM_BLOCK  — start of scan range (default: 35150000, just before proxy deploy)
//   CHUNK_SIZE  — getLogs block range per request   (default: 100000)
//   BATCH_SIZE  — addresses per batchBootstrap call (default: 50)
"use strict";
require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const UPGRADE_BLOCK = 47348216;

const FROM_BLOCK = Number(process.env.FROM_BLOCK  ?? 35_150_000);
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE  ?? 10_000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE  ?? 50);

const ABI = [
  "event Deposit(address indexed user, uint256 indexed pid, uint256 amount)",
  "function checkpointCount(address user) view returns (uint256)",
  "function activePoolCount(address user) view returns (uint256)",
  "function batchBootstrap(address[] calldata users) external",
  "function upgradeBlock() view returns (uint256)",
];

async function main() {
  const provider = ethers.provider;
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}`);

  const proxy = new ethers.Contract(STAKING_PROXY, ABI, signer);

  const onchainUpgradeBlock = await proxy.upgradeBlock();
  if (onchainUpgradeBlock === 0n) {
    console.error("HARD STOP — upgradeBlock is 0. migrateV93 has not been called.");
    process.exitCode = 1;
    return;
  }
  console.log(`upgradeBlock confirmed: ${onchainUpgradeBlock}\n`);

  // ── 1. Scan all Deposit events from deployment to upgradeBlock ─────────────
  const totalBlocks = UPGRADE_BLOCK - FROM_BLOCK;
  const totalChunks = Math.ceil(totalBlocks / CHUNK_SIZE);
  console.log(`Scanning Deposit events [${FROM_BLOCK} → ${UPGRADE_BLOCK}]`);
  console.log(`${totalChunks} chunks × ${CHUNK_SIZE} blocks each…\n`);

  const depositTopic = proxy.interface.getEvent("Deposit").topicHash;
  const stakers = new Set();

  for (let from = FROM_BLOCK; from <= UPGRADE_BLOCK; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, UPGRADE_BLOCK);
    const logs = await provider.getLogs({
      address:   STAKING_PROXY,
      topics:    [depositTopic],
      fromBlock: from,
      toBlock:   to,
    });
    for (const log of logs) {
      const parsed = proxy.interface.parseLog(log);
      stakers.add(parsed.args.user.toLowerCase());
    }
    const chunk = Math.ceil((from - FROM_BLOCK) / CHUNK_SIZE) + 1;
    process.stdout.write(`  chunk ${String(chunk).padStart(3)}/${totalChunks} | unique stakers so far: ${stakers.size}\r`);
  }
  console.log(`\n\nTotal unique staker addresses found: ${stakers.size}`);

  // ── 2. Filter to those needing a bootstrap checkpoint ─────────────────────
  // Public Base RPC limits JSON-RPC batches to 10 calls. Each Promise.all
  // of N addresses fires N concurrent eth_calls which ethers batches together.
  // So: batch 10 activePoolCount checks first, then 10 checkpointCount checks
  // only for those with active > 0. This keeps every batch ≤ 10 calls.
  console.log("\nChecking checkpoint status…");
  const addrList = [...stakers];
  const activeAddrs = [];

  for (let i = 0; i < addrList.length; i += 10) {
    const chunk = addrList.slice(i, i + 10);
    const counts = await Promise.all(chunk.map(addr => proxy.activePoolCount(addr)));
    for (let j = 0; j < chunk.length; j++) {
      if (counts[j] > 0n) activeAddrs.push(chunk[j]);
    }
    process.stdout.write(`  pass1 ${Math.min(i + 10, addrList.length)}/${addrList.length} | active: ${activeAddrs.length}\r`);
  }
  console.log(`\n  Active stakers: ${activeAddrs.length}`);

  const toBootstrap = [];
  for (let i = 0; i < activeAddrs.length; i += 10) {
    const chunk = activeAddrs.slice(i, i + 10);
    const counts = await Promise.all(chunk.map(addr => proxy.checkpointCount(addr)));
    for (let j = 0; j < chunk.length; j++) {
      if (counts[j] === 0n) toBootstrap.push(chunk[j]);
    }
    process.stdout.write(`  pass2 ${Math.min(i + 10, activeAddrs.length)}/${activeAddrs.length} | need bootstrap: ${toBootstrap.length}\r`);
  }
  console.log(`\n\nAddresses needing bootstrap: ${toBootstrap.length}`);

  if (toBootstrap.length === 0) {
    console.log("All active stakers already have checkpoints. Nothing to do.");
    return;
  }

  console.log("\nAddresses to bootstrap:");
  toBootstrap.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));

  // ── 3. Call batchBootstrap in chunks ──────────────────────────────────────
  console.log(`\nCalling batchBootstrap in chunks of ${BATCH_SIZE}…`);
  let totalGas = 0n;

  for (let i = 0; i < toBootstrap.length; i += BATCH_SIZE) {
    const chunk = toBootstrap.slice(i, i + BATCH_SIZE);
    const tx = await proxy.batchBootstrap(chunk);
    const receipt = await tx.wait();
    totalGas += receipt.gasUsed;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toBootstrap.length / BATCH_SIZE);
    console.log(`  batch ${batchNum}/${totalBatches}: ${chunk.length} addresses | tx ${receipt.hash} | gas ${receipt.gasUsed}`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Phase 7 complete`);
  console.log(`  Bootstrapped:   ${toBootstrap.length} stakers`);
  console.log(`  Total gas used: ${totalGas}`);
  console.log(`${"═".repeat(60)}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
