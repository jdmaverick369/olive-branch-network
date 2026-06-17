// scripts/governance/timelock_safe_helper.js
// Shared helper for generating Timelock scheduleBatch / executeBatch Safe JSONs.
// All governance scripts that go through the Timelock use this.
"use strict";
const { ethers } = require("ethers");
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");
const addrs  = require("./addresses");

const TIMELOCK_ABI = [
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) external payable",
];
const iface       = new ethers.Interface(TIMELOCK_ABI);
const PREDECESSOR = ethers.ZeroHash;

function computeOpId(targets, values, datas, salt) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
      [targets, values, datas, PREDECESSOR, salt]
    )
  );
}

function buildSafeJson(name, description, to, data) {
  return {
    version: "1.0",
    chainId: addrs.CHAIN_ID,
    createdAt: Date.now(),
    meta: {
      name,
      description,
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: addrs.OPERATOR_SAFE,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions: [
      { to, value: "0", data, contractMethod: null, contractInputsValues: null },
    ],
  };
}

function writeJson(filePath, json) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
}

function outDir() {
  return path.resolve(__dirname, "../../../governance-operations");
}

/**
 * Generate a Timelock schedule Safe JSON for a single target call.
 * Returns { salt, opId, outFile }.
 */
function scheduleOne({ target, calldata, label, pid }) {
  const salt   = "0x" + crypto.randomBytes(32).toString("hex");
  const targets = [target];
  const values  = [BigInt(0)];
  const datas   = [calldata];
  const opId    = computeOpId(targets, values, datas, salt);

  const scheduleData = iface.encodeFunctionData("scheduleBatch", [
    targets, values, datas, PREDECESSOR, salt, addrs.TIMELOCK_DELAY,
  ]);

  const dateStr = new Date().toISOString().slice(0, 10);
  const slug    = pid !== undefined ? `${label}-pid${pid}` : label;
  const outFile = path.join(outDir(), `${dateStr}-${slug}-schedule.json`);

  writeJson(outFile, buildSafeJson(
    `OBN ${label} — Timelock schedule`,
    `Timelock.scheduleBatch: ${label}. opId: ${opId}`,
    addrs.TIMELOCK,
    scheduleData,
  ));

  console.log(`\n✅ Schedule Safe JSON: ${outFile}`);
  console.log(`   Import into Safe Transaction Builder, sign with 2-of-3, execute.`);
  console.log(`\n📋 Save for execute step (needed in 24h):`);
  console.log(`   export SALT="${salt}"`);
  console.log(`   export OP_ID="${opId}"`);
  console.log(`\n   Monitor: OP_ID=${opId} node scripts/governance/timelock_countdown.js`);

  return { salt, opId, outFile };
}

/**
 * Generate a Timelock execute Safe JSON. Verifies opId before writing.
 * Returns { outFile }.
 */
function executeOne({ target, calldata, label, pid }) {
  const salt  = process.env.SALT;
  const opId  = process.env.OP_ID;

  if (!salt || !/^0x[a-fA-F0-9]{64}$/.test(salt))
    throw new Error("❌ SALT env var missing or invalid — copy it from the schedule step");
  if (!opId || !/^0x[a-fA-F0-9]{64}$/.test(opId))
    throw new Error("❌ OP_ID env var missing or invalid — copy it from the schedule step");

  const targets = [target];
  const values  = [BigInt(0)];
  const datas   = [calldata];
  const computed = computeOpId(targets, values, datas, salt);

  if (computed.toLowerCase() !== opId.toLowerCase())
    throw new Error(
      `❌ opId mismatch — parameters don't match the schedule step.\n` +
      `   Computed: ${computed}\n` +
      `   Expected: ${opId}\n` +
      `   Check that all arguments are identical to the schedule step.`
    );
  console.log(`✅ opId verified: ${opId}`);

  const executeData = iface.encodeFunctionData("executeBatch", [
    targets, values, datas, PREDECESSOR, salt,
  ]);

  const dateStr = new Date().toISOString().slice(0, 10);
  const slug    = pid !== undefined ? `${label}-pid${pid}` : label;
  const outFile = path.join(outDir(), `${dateStr}-${slug}-execute.json`);

  writeJson(outFile, buildSafeJson(
    `OBN ${label} — Timelock execute`,
    `Timelock.executeBatch: ${label}. opId: ${opId}`,
    addrs.TIMELOCK,
    executeData,
  ));

  console.log(`\n✅ Execute Safe JSON: ${outFile}`);
  console.log(`   Import into Safe Transaction Builder, sign with 2-of-3, execute.`);

  return { outFile };
}

module.exports = { scheduleOne, executeOne, buildSafeJson, writeJson, outDir };
