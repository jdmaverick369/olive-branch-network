// scripts/governance/gen_safe_execute_phase5.js
// Generates a Safe Transaction Builder JSON for Timelock.executeBatch (Phase 5).
// Run: node scripts/governance/gen_safe_execute_phase5.js
"use strict";
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const TIMELOCK      = "0x86396526286769ace21982E798Df5eef2389f51c";
const OPERATOR_SAFE = "0x066e2FABb036deab7DC58bAde428F819AC3542DD";
const CHAIN_ID      = "8453";

// ── Exact values from the original scheduleBatch ──────────────────────────────

const TARGETS = [
  "0xc75B2a5C7B8F88327D44C223769cFa19cc93E341",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
  "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
];

const VALUES = TARGETS.map(() => "0");

const PAYLOADS = [
  "0xab033ea90000000000000000000000001135d5fea8098b09b4ed3afbffdc7b248359d270",
  "0xab033ea90000000000000000000000001135d5fea8098b09b4ed3afbffdc7b248359d270",
  "0x2bce32b0000000000000000000000000750ef1d7a0b4ab1c97b7a623d7917cceb5ea779c0000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000e04063602b8b6b5d3526e6af873d2a4777e12d920000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000ab739d4f2b44f3f4ed8236070a8f97119eaed4ab0000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000998f25be40241ca5d8f5fcaf3591b5ed06ef3be70000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000891432ab6414efff5d986e14848ecd1e6b2961ae0000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b00000000000000000000000000a60e17d5c98d491809cd8a15370c53806eec1ec0000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000532fb5d00f40ced99b16d1e295c77cda2eb1bb4f0000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b000000000000000000000000092ee2370b56dc32794a6cd72585dc01d4288d3140000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000718a03c0b38889d57224b5a4ec853953f7b1aa180000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000a23fa5a73c6366f6a829ac1f452a24efdc5ecff70000000000000000000000000000000000000000000000000000000000000001",
  "0x2bce32b0000000000000000000000000859d4d3096928048de53cf256a640abd428f9bc90000000000000000000000000000000000000000000000000000000000000001",
];

const PREDECESSOR = "0x0000000000000000000000000000000000000000000000000000000000000000";
const SALT        = "0x4a84c2d6ebdf23cef2ed26fc76c7783b225c24f711f9d17b2545bf47d965d7ef";
const OP_ID       = "0x49137d5ebb30656fd8598a4faf7a4f201cbf5513a5fc8d797fed2f27eae3f9d3";

// ── Encode executeBatch calldata ──────────────────────────────────────────────

const TIMELOCK_ABI = [
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) external payable",
];

const iface = new ethers.Interface(TIMELOCK_ABI);
const data  = iface.encodeFunctionData("executeBatch", [
  TARGETS,
  VALUES.map(v => BigInt(v)),
  PAYLOADS,
  PREDECESSOR,
  SALT,
]);

const selector = data.slice(0, 10);
console.log(`executeBatch selector: ${selector}`);
// Expected: 0xe38335e5

// ── Build Safe Transaction Builder JSON ──────────────────────────────────────

const safeJson = {
  version: "1.0",
  chainId: CHAIN_ID,
  createdAt: Date.now(),
  meta: {
    name: "OBN v9.3 Phase 5 EXECUTE — Vault wiring + nonprofit approvals",
    description: `Timelock.executeBatch: setGovernance x2 + setApprovedNonprofit x11. opId: ${OP_ID}`,
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

const outPath = path.join(__dirname, "../../../safe_execute_phase5.json");
fs.writeFileSync(outPath, JSON.stringify(safeJson, null, 2));
console.log(`\nWritten: ${outPath}`);
console.log(`\nTransaction summary:`);
console.log(`  to:    ${TIMELOCK}`);
console.log(`  value: 0`);
console.log(`  data:  ${data.slice(0, 42)}...`);
console.log(`  opId:  ${OP_ID}`);
console.log(`\nImport in Safe → New Transaction → Transaction Builder → drag-drop or paste JSON.`);
