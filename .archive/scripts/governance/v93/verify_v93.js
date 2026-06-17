// scripts/governance/verify_v93.js
//
// Verifies all OBN v9.3 contracts on Basescan.
//
// Run after each deployment phase, or once at the end with all addresses filled in.
//
// Required env vars (fill in as addresses become available):
//   V93_IMPL          — StakingPoolsV93 bare implementation
//   EXTENDING_OB_ADDR — ExtendOliveBranch
//   OFFERING_ADDR     — TheOffering
//   ANNUAL_GOV_IMPL   — AnnualGovernance implementation (not proxy)
//   ANNUAL_GOV_PROXY  — AnnualGovernance ERC1967 proxy
//   LENS_IMPL         — OBNStakingLens implementation (not proxy)
//   LENS_PROXY        — OBNStakingLens ERC1967 proxy
//   STAKING_PROXY     — Existing staking proxy (proxy re-verification after upgrade)
//   OBN_TOKEN         — OBN token address (constructor arg for vaults)
//   TIMELOCK          — Timelock address (constructor arg for all new contracts)
//   BASESCAN_API_KEY  — Basescan API key

require("dotenv").config();
const { execSync } = require("child_process");

const {
  V93_IMPL,
  EXTENDING_OB_ADDR,
  OFFERING_ADDR,
  ANNUAL_GOV_IMPL,
  ANNUAL_GOV_PROXY,
  LENS_IMPL,
  LENS_PROXY,
  STAKING_PROXY,
  OBN_TOKEN,
  TIMELOCK,
  BASESCAN_API_KEY,
} = process.env;

function requireAddr(name) {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) {
    throw new Error(`Missing or invalid env var: ${name}`);
  }
  return v;
}

function run(label, cmd) {
  console.log(`\n▶ ${label}`);
  console.log(`  ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
    console.log(`  ✅ ${label} — verified`);
    return true;
  } catch {
    console.error(`  ❌ ${label} — failed (see above)`);
    return false;
  }
}

async function verifyProxy(label, proxyAddr) {
  console.log(`\n▶ ${label} — Basescan proxy registration`);
  const url = `https://api.etherscan.io/v2/api?chainid=8453`;
  const body = new URLSearchParams({
    module:   "contract",
    action:   "verifyproxycontract",
    address:  proxyAddr,
    apikey:   BASESCAN_API_KEY,
  });
  try {
    const res = await fetch(url, { method: "POST", body });
    const json = await res.json();
    if (json.status === "1" || json.message === "OK") {
      console.log(`  ✅ Proxy registration submitted for ${proxyAddr}`);
      console.log(`     Basescan will index the ERC1967 slot and link the implementation ABI.`);
    } else {
      console.log(`  ⚠️  Response: ${JSON.stringify(json)}`);
      console.log(`     If the proxy is not yet indexed, retry in 2–3 minutes.`);
    }
  } catch (e) {
    console.error(`  ❌ Fetch failed: ${e.message}`);
  }
}

async function main() {
  console.log("=== OBN v9.3 Contract Verification ===\n");
  console.log("Skipping contracts whose env var is not set.\n");

  if (!BASESCAN_API_KEY) throw new Error("BASESCAN_API_KEY is not set");

  const results = [];

  // ── Implementations (no constructor args; _disableInitializers() is the constructor) ─

  if (V93_IMPL) {
    results.push(run(
      `StakingPoolsV93 implementation (${V93_IMPL})`,
      `npx hardhat verify --network base "${V93_IMPL}" --contract "contracts/StakingPoolsV93.sol:OBNStakingPools"`
    ));
  }

  if (ANNUAL_GOV_IMPL) {
    results.push(run(
      `AnnualGovernance implementation (${ANNUAL_GOV_IMPL})`,
      `npx hardhat verify --network base "${ANNUAL_GOV_IMPL}" --contract "contracts/AnnualGovernance.sol:AnnualGovernance"`
    ));
  }

  if (LENS_IMPL) {
    results.push(run(
      `OBNStakingLens implementation (${LENS_IMPL})`,
      `npx hardhat verify --network base "${LENS_IMPL}" --contract "contracts/OBNStakingLens.sol:OBNStakingLens"`
    ));
  }

  // ── Non-upgradeable vaults (have constructor args) ────────────────────────────────

  if (EXTENDING_OB_ADDR) {
    requireAddr("OBN_TOKEN"); requireAddr("TIMELOCK");
    results.push(run(
      `ExtendOliveBranch (${EXTENDING_OB_ADDR})`,
      `npx hardhat verify --network base "${EXTENDING_OB_ADDR}" "${OBN_TOKEN}" "${TIMELOCK}"`
    ));
  }

  if (OFFERING_ADDR) {
    requireAddr("OBN_TOKEN"); requireAddr("EXTENDING_OB_ADDR"); requireAddr("TIMELOCK");
    results.push(run(
      `TheOffering (${OFFERING_ADDR})`,
      `npx hardhat verify --network base "${OFFERING_ADDR}" "${OBN_TOKEN}" "${EXTENDING_OB_ADDR}" "${TIMELOCK}"`
    ));
  }

  // ── Proxy registration (Basescan reads ERC1967 slot, links implementation ABI) ────
  // Run these AFTER the corresponding implementation is verified above.

  if (ANNUAL_GOV_PROXY) await verifyProxy(`AnnualGovernance proxy (${ANNUAL_GOV_PROXY})`, ANNUAL_GOV_PROXY);
  if (LENS_PROXY)        await verifyProxy(`OBNStakingLens proxy  (${LENS_PROXY})`, LENS_PROXY);

  // Re-register the staking proxy after upgradeToAndCall so Basescan shows the v9.3 ABI.
  // Only run this AFTER Phase 6 (upgrade) is complete.
  if (STAKING_PROXY) await verifyProxy(`Staking proxy re-registration (${STAKING_PROXY})`, STAKING_PROXY);

  // ── Summary ──────────────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  console.log(`Implementation verifications: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("Troubleshooting:");
    console.log("  1. Wait 2–5 minutes for Basescan to index the deployment.");
    console.log("  2. Re-run this script — Basescan sometimes needs a retry.");
    console.log("  3. Confirm BASESCAN_API_KEY is correct.");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
