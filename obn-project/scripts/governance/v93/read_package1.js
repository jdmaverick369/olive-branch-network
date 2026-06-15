// Temporary read script — collects all on-chain values for Package 1
"use strict";
require("dotenv").config();
const { ethers } = require("hardhat");

const ERC1967_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076635130605e9f3e0abe63e22a";

const V93_IMPL          = "0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E";
const EXTENDING_OB_ADDR = "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B";
const OFFERING_ADDR     = "0xc75B2a5C7B8F88327D44C223769cFa19cc93E341";
const ANNUAL_GOV_PROXY  = "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270";
const ANNUAL_GOV_IMPL   = "0x4721Cc867084fD656E2B45A4b0937fE32245A553";
const LENS_PROXY        = "0x2ae4df523040c0245a6F84342E4B06850c5bdb9b";
const LENS_IMPL         = "0x361790d0Be4E3b961f02CF1873c36E927c5ebe5d";
const STAKING_PROXY     = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";

async function call(addr, sig) {
  try {
    const iface = new ethers.Interface([`function ${sig}`]);
    const fn    = sig.split("(")[0];
    const c     = new ethers.Contract(addr, iface, ethers.provider);
    const v     = await c[fn]();
    return Array.isArray(v) ? v.join(",") : v.toString();
  } catch (e) {
    return `REVERTED (${e.shortMessage || e.message?.slice(0, 80)})`;
  }
}

async function slot(addr) {
  // getStorage returns a 32-byte hex string; address is in the lower 20 bytes
  const raw = await ethers.provider.getStorage(addr, BigInt(ERC1967_SLOT));
  // raw is 0x + 64 hex chars; last 40 chars = address
  return "0x" + raw.slice(-40);
}

// Try to call initialize() with no args — bare impl should always revert
async function initCall(addr) {
  const iface = new ethers.Interface(["function initialize() external"]);
  try {
    await ethers.provider.call({ to: addr, data: iface.encodeFunctionData("initialize") });
    return "DID NOT REVERT — CRITICAL";
  } catch {
    return "reverted (locked)";
  }
}

async function main() {
  const provider = ethers.provider;
  const block    = await provider.getBlockNumber();
  console.log(`Block: ${block}\n`);

  const reads = [
    ["V93_IMPL.version()",                         () => call(V93_IMPL,         "version() view returns (string)")],
    ["V93_IMPL.owner()",                           () => call(V93_IMPL,         "owner() view returns (address)")],

    ["EXTENDING_OB_ADDR.obn()",                    () => call(EXTENDING_OB_ADDR, "obn() view returns (address)")],
    ["EXTENDING_OB_ADDR.timelockOwner()",          () => call(EXTENDING_OB_ADDR, "timelockOwner() view returns (address)")],
    ["EXTENDING_OB_ADDR.governance()",             () => call(EXTENDING_OB_ADDR, "governance() view returns (address)")],

    ["OFFERING_ADDR.obn()",                        () => call(OFFERING_ADDR,    "obn() view returns (address)")],
    ["OFFERING_ADDR.extendOliveBranch()",          () => call(OFFERING_ADDR,    "extendOliveBranch() view returns (address)")],
    ["OFFERING_ADDR.timelockOwner()",              () => call(OFFERING_ADDR,    "timelockOwner() view returns (address)")],
    ["OFFERING_ADDR.governance()",                 () => call(OFFERING_ADDR,    "governance() view returns (address)")],

    ["ANNUAL_GOV_PROXY.obn()",                     () => call(ANNUAL_GOV_PROXY, "obn() view returns (address)")],
    ["ANNUAL_GOV_PROXY.owner()",                   () => call(ANNUAL_GOV_PROXY, "owner() view returns (address)")],
    ["ANNUAL_GOV_PROXY.stakingPools()",            () => call(ANNUAL_GOV_PROXY, "stakingPools() view returns (address)")],
    ["ANNUAL_GOV_PROXY.theOffering()",             () => call(ANNUAL_GOV_PROXY, "theOffering() view returns (address)")],
    ["ANNUAL_GOV_PROXY.extendOliveBranch()",       () => call(ANNUAL_GOV_PROXY, "extendOliveBranch() view returns (address)")],
    ["ANNUAL_GOV_PROXY.voteAdmin()",               () => call(ANNUAL_GOV_PROXY, "voteAdmin() view returns (address)")],
    ["ANNUAL_GOV_PROXY.currentCycleId()",          () => call(ANNUAL_GOV_PROXY, "currentCycleId() view returns (uint256)")],
    ["ANNUAL_GOV_PROXY.maxBallotSize()",           () => call(ANNUAL_GOV_PROXY, "maxBallotSize() view returns (uint256)")],
    ["ANNUAL_GOV_PROXY ERC1967 slot",              () => slot(ANNUAL_GOV_PROXY)],
    ["ANNUAL_GOV_IMPL.initialize() result",        () => initCall(ANNUAL_GOV_IMPL)],

    ["LENS_PROXY.owner()",                         () => call(LENS_PROXY,       "owner() view returns (address)")],
    ["LENS_PROXY.stakingPools()",                  () => call(LENS_PROXY,       "stakingPools() view returns (address)")],
    ["LENS_PROXY ERC1967 slot",                    () => slot(LENS_PROXY)],
    ["LENS_PROXY.getGlobalStats()",                () => call(LENS_PROXY,       "getGlobalStats() view returns (uint256,uint256,uint256,uint256)")],
    ["LENS_IMPL.initialize() result",              () => initCall(LENS_IMPL)],

    ["STAKING_PROXY.version()",                    () => call(STAKING_PROXY,    "version() view returns (string)")],
    ["STAKING_PROXY.owner()",                      () => call(STAKING_PROXY,    "owner() view returns (address)")],
  ];

  for (const [label, fn] of reads) {
    const v = await fn();
    console.log(`  ${label.padEnd(45)} = ${v}`);
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
