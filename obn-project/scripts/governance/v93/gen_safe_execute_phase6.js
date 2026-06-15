// scripts/governance/gen_safe_execute_phase6.js
// Generates a Safe Transaction Builder JSON for Timelock.executeBatch (Phase 6 upgrade).
// Run: node scripts/governance/gen_safe_execute_phase6.js
"use strict";
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const TIMELOCK      = "0x86396526286769ace21982E798Df5eef2389f51c";
const OPERATOR_SAFE = "0x066e2FABb036deab7DC58bAde428F819AC3542DD";
const CHAIN_ID      = "8453";

const TARGETS = ["0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2"];
const VALUES  = [BigInt(0)];
const PAYLOADS = [
  "0x4f1ef2860000000000000000000000008ae630a14254fd9632c505fbdeb7f104f0b9844e0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006405c6ae59000000000000000000000000c75b2a5c7b8f88327d44c223769cfa19cc93e341000000000000000000000000e1bbfaf0552acc183579a3d172e002adf0c66d8b000000000000000000000000066e2fabb036deab7dc58bade428f819ac3542dd00000000000000000000000000000000000000000000000000000000",
];

const PREDECESSOR = "0x0000000000000000000000000000000000000000000000000000000000000000";
const SALT        = "0x29563d3dc1a8d84b10b40a4ae9d398f79ba31af8d5b4d69ea0a605607528b661";
const OP_ID       = "0xfed7625b7bfd06132dc67b14ba1503c43a1e26c083882a13aa6be63c83edceb4";

const TIMELOCK_ABI = [
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) external payable",
];

const iface = new ethers.Interface(TIMELOCK_ABI);
const data  = iface.encodeFunctionData("executeBatch", [
  TARGETS,
  VALUES,
  PAYLOADS,
  PREDECESSOR,
  SALT,
]);

const selector = data.slice(0, 10);
console.log(`executeBatch selector: ${selector}`);
// Expected: 0xe38335e5

// Verify opId
const computedOpId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
  ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
  [TARGETS, VALUES, PAYLOADS, PREDECESSOR, SALT]
));
console.log(`opId match: ${computedOpId.toLowerCase() === OP_ID.toLowerCase() ? "YES ✓" : "NO ✗ — DO NOT PROCEED"}`);

const safeJson = {
  version: "1.0",
  chainId: CHAIN_ID,
  createdAt: Date.now(),
  meta: {
    name: "OBN v9.3 Phase 6 EXECUTE — Staking upgrade (upgradeToAndCall)",
    description: `Timelock.executeBatch: upgradeToAndCall(V93_IMPL, migrateV93(...)). opId: ${OP_ID}`,
    txBuilderVersion: "1.16.5",
    createdFromSafeAddress: OPERATOR_SAFE,
    createdFromOwnerAddress: "",
    checksum: "",
  },
  transactions: [
    {
      to: TIMELOCK,
      value: "0",
      data,
      contractMethod: null,
      contractInputsValues: null,
    },
  ],
};

const outPath = path.join(__dirname, "../../../safe_execute_phase6.json");
fs.writeFileSync(outPath, JSON.stringify(safeJson, null, 2));
console.log(`\nWritten: ${outPath}`);
console.log(`  to:    ${TIMELOCK}`);
console.log(`  value: 0`);
console.log(`  data:  ${data.slice(0, 42)}...`);
console.log(`  opId:  ${OP_ID}`);
