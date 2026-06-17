// scripts/governance/gen_safe_bootstrap.js
// Generates a Safe Transaction Builder JSON to bootstrap a newly added nonprofit pool.
// Must be run AFTER the addPool Timelock operation is executed and verified on-chain.
//
// In v9.3, charityFundBootstrap is restricted to charityFund (ExtendOliveBranch contract)
// or charityFundOperator (OPERATOR_SAFE). Since ExtendOliveBranch can't call it,
// OPERATOR_SAFE must do it directly — hence this Safe JSON.
//
// The Safe JSON batches two calls atomically:
//   1. OBNToken.approve(stakingProxy, amount)       — grant allowance from Safe
//   2. stakingProxy.charityFundBootstrap(pid, amount, charityWallet)
//
// Required env vars:
//   OBN_STAKING_CONTRACT  — staking proxy address
//   OBN_TOKEN_CONTRACT    — OBN ERC20 address
//   OPERATOR_SAFE         — the 2-of-3 Safe (createdFromSafeAddress)
//
// Usage:
//   node scripts/governance/gen_safe_bootstrap.js --pid 11 --charity 0x... [--amount 1000000]
//
// Output:
//   governance-operations/YYYY-MM-DD-bootstrap-pidN.json

"use strict";
const { ethers } = require("ethers");
const minimist = require("minimist");
const fs   = require("fs");
const path = require("path");
const addrs = require("./addresses");

const STAKING       = addrs.STAKING_PROXY;
const TOKEN         = addrs.OBN_TOKEN;
const OPERATOR_SAFE = addrs.OPERATOR_SAFE;
const CHAIN_ID      = addrs.CHAIN_ID;
const DECIMALS      = 18;

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
];
const POOL_ABI = [
  "function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary) external",
];

function mustAddr(a, name) {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing → ${a}`);
  return a;
}

function main() {
  const argv = minimist(process.argv.slice(2));

  const pid = argv.pid !== undefined ? Number(argv.pid) : undefined;
  if (pid === undefined || !Number.isInteger(pid) || pid < 0)
    throw new Error("❌ Provide --pid (non-negative integer)");

  const { getByPid } = require("./nonprofits");
  const np = getByPid(pid);
  const charity = mustAddr(argv.charity || np.wallet, `wallet for PID ${pid}`);

  const amountHuman = String(argv.amount ?? "1000000");
  const amountWei   = ethers.parseUnits(amountHuman, DECIMALS);

  mustAddr(STAKING,       "OBN_STAKING_CONTRACT");
  mustAddr(TOKEN,         "OBN_TOKEN_CONTRACT");
  mustAddr(OPERATOR_SAFE, "OPERATOR_SAFE");

  const tokenIface = new ethers.Interface(TOKEN_ABI);
  const poolIface  = new ethers.Interface(POOL_ABI);

  const approveData   = tokenIface.encodeFunctionData("approve", [STAKING, amountWei]);
  const bootstrapData = poolIface.encodeFunctionData("charityFundBootstrap", [pid, amountWei, charity]);

  const safeJson = {
    version: "1.0",
    chainId: CHAIN_ID,
    createdAt: Date.now(),
    meta: {
      name: `OBN bootstrap PID ${pid} — ${amountHuman} OBN → ${charity}`,
      description: `Atomic: approve(${STAKING}, ${amountWei}) + charityFundBootstrap(${pid}, ${amountWei}, ${charity})`,
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: OPERATOR_SAFE,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions: [
      {
        to: TOKEN,
        value: "0",
        data: approveData,
        contractMethod: null,
        contractInputsValues: null,
      },
      {
        to: STAKING,
        value: "0",
        data: bootstrapData,
        contractMethod: null,
        contractInputsValues: null,
      },
    ],
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir  = path.resolve(__dirname, "../../../governance-operations");
  const outFile = path.join(outDir, `${dateStr}-bootstrap-pid${pid}.json`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(safeJson, null, 2));

  console.log(`\n✅ Safe JSON written: ${outFile}`);
  console.log(`   PID:          ${pid}`);
  console.log(`   Charity:      ${charity}`);
  console.log(`   Amount:       ${amountHuman} OBN (${amountWei} wei)`);
  console.log(`   tx[0]: OBNToken.approve(stakingProxy, ${amountWei})`);
  console.log(`   tx[1]: stakingProxy.charityFundBootstrap(${pid}, ${amountWei}, ${charity})`);
  console.log(`\n   Import into Safe Transaction Builder, sign with 2-of-3 owners, execute.`);
  console.log(`   Safe must hold ≥ ${amountHuman} OBN before executing.`);
}

try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
