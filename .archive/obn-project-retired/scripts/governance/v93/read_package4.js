// scripts/governance/read_package4.js
// Post-upgrade verification reads for Package 4.
// Run immediately after executeBatch confirms on-chain.
// Usage: npx hardhat run scripts/governance/read_package4.js --network base
"use strict";
require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_PROXY     = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const V93_IMPL          = "0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E";
const TIMELOCK          = "0x86396526286769ace21982E798Df5eef2389f51c";
const OPERATOR_SAFE     = "0x066e2FABb036deab7DC58bAde428F819AC3542DD";
const OFFERING_ADDR     = "0xc75B2a5C7B8F88327D44C223769cFa19cc93E341";
const EXTENDING_OB_ADDR = "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B";
const ANNUAL_GOV_PROXY  = "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270";

// Old addresses that must NOT appear post-upgrade
const OLD_TREASURY     = "0xA699c2885cC72398430a8a75c80406C2b6A7B096";
const OLD_CHARITY_FUND = "0x398fE423a8b4FD9B40CADF8bc72448C95474455F";

// ERC-1967 implementation slot
const ERC1967_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const PROXY_ABI = [
  "function version() view returns (string)",
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function charityFund() view returns (address)",
  "function charityFundOperator() view returns (address)",
  "function upgradeBlock() view returns (uint256)",
  "function globalTotalStaked() view returns (uint256)",
  "function poolLength() view returns (uint256)",
];

// slot 0x1c packs: [7 padding][uint32 upgradeBlock][bool _migrationExecuted][address charityFundOperator]
// _migrationExecuted is at byte index 11 from the left (chars 24-25 in the 64-char hex body)
const MIGRATION_FLAG_SLOT = 28n; // 0x1c

const TIMELOCK_ABI = [
  "function isOperationDone(bytes32) view returns (bool)",
];

const OP_ID = "0xfed7625b7bfd06132dc67b14ba1503c43a1e26c083882a13aa6be63c83edceb4";

function addrEq(a, b) { return a.toLowerCase() === b.toLowerCase(); }
function check(label, got, expected) {
  const pass = addrEq(got, expected);
  console.log(`  ${label.padEnd(42)} = ${got}  ${pass ? "✓" : "✗ MISMATCH — expected " + expected}`);
  return pass;
}
function checkNot(label, got, bad) {
  const pass = !addrEq(got, bad);
  console.log(`  ${label.padEnd(42)} = ${got}  ${pass ? "✓ (not old addr)" : "✗ STILL POINTS TO OLD ADDRESS"}`);
  return pass;
}

async function main() {
  const provider = ethers.provider;
  const block    = await provider.getBlockNumber();
  console.log(`Block: ${block}\n`);

  const proxy = new ethers.Contract(STAKING_PROXY, PROXY_ABI, provider);
  const tl    = new ethers.Contract(TIMELOCK, TIMELOCK_ABI, provider);

  let failures = 0;

  console.log("─ Version & ownership ───────────────────────────────────");
  const version = await proxy.version();
  const pass_ver = version === "9.3";
  console.log(`  version()                                  = "${version}"  ${pass_ver ? "✓" : "✗ expected 9.3"}`);
  if (!pass_ver) failures++;

  const owner = await proxy.owner();
  if (!check("owner()", owner, TIMELOCK)) failures++;

  console.log("\n─ Migration pointers ────────────────────────────────────");
  const treasury = await proxy.treasury();
  if (!check("treasury()", treasury, OFFERING_ADDR)) failures++;
  if (!checkNot("treasury() != OLD_TREASURY", treasury, OLD_TREASURY)) failures++;

  const charityFund = await proxy.charityFund();
  if (!check("charityFund()", charityFund, EXTENDING_OB_ADDR)) failures++;
  if (!checkNot("charityFund() != OLD_CHARITY_FUND", charityFund, OLD_CHARITY_FUND)) failures++;

  const operator = await proxy.charityFundOperator();
  if (!check("charityFundOperator()", operator, OPERATOR_SAFE)) failures++;

  console.log("\n─ Upgrade metadata ──────────────────────────────────────");
  const upgradeBlock = await proxy.upgradeBlock();
  console.log(`  upgradeBlock()                             = ${upgradeBlock}`);

  const rawMigSlot = await provider.getStorage(STAKING_PROXY, MIGRATION_FLAG_SLOT);
  const migByte = rawMigSlot.slice(24, 26); // byte 11 from left in 32-byte slot
  const pass_mig = migByte === "01";
  console.log(`  _migrationExecuted (slot 0x1c byte 11)     = 0x${migByte}  ${pass_mig ? "✓ (true)" : "✗ expected 0x01"}`);
  if (!pass_mig) failures++;

  console.log("\n─ ERC-1967 implementation slot ──────────────────────────");
  const rawSlot = await provider.getStorage(STAKING_PROXY, BigInt(ERC1967_SLOT));
  const implFromSlot = "0x" + rawSlot.slice(-40);
  const pass_impl = addrEq(implFromSlot, V93_IMPL);
  console.log(`  ERC1967 slot                               = ${implFromSlot}  ${pass_impl ? "✓" : "✗ expected " + V93_IMPL}`);
  if (!pass_impl) failures++;

  console.log("\n─ Staking state (must match pre-upgrade snapshot) ───────");
  const staked = await proxy.globalTotalStaked();
  console.log(`  globalTotalStaked()                        = ${staked}`);
  console.log(`  (record this value — compare against pre-execution read)`);
  const pass_staked = staked > 0n;
  if (!pass_staked) { console.log(`  ✗ ZERO — storage wipe`); failures++; }
  else console.log(`  ✓ non-zero`);

  const poolLength = await proxy.poolLength();
  console.log(`  poolLength()                               = ${poolLength}`);
  const pass_pools = Number(poolLength) === 11;
  if (!pass_pools) { console.log(`  ✗ expected 11`); failures++; }
  else console.log(`  ✓ matches`);

  console.log("\n─ Timelock operation status ─────────────────────────────");
  const done = await tl.isOperationDone(OP_ID);
  const pass_done = done === true;
  console.log(`  isOperationDone(opId)                      = ${done}  ${pass_done ? "✓" : "✗ expected true"}`);
  if (!pass_done) failures++;

  console.log("\n" + "═".repeat(60));
  if (failures === 0) {
    console.log("  PACKAGE 4 READS — ALL PASS ✓");
  } else {
    console.log(`  PACKAGE 4 READS — ${failures} FAILURE(S) ✗`);
  }
  console.log("═".repeat(60));
  console.log("\nRecord upgradeBlock and globalTotalStaked for Package 4 submission.");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
