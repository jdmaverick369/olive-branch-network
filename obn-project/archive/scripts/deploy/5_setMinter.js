// scripts/5_setMinter.js
const { ethers } = require("hardhat");
require("dotenv").config();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🔧 Wiring OBNStakingPools as the sole minter for OBNToken…");

  const tokenAddress   = process.env.OBN_TOKEN_CONTRACT;   // OBNToken (proxy)
  const stakingAddress = process.env.OBN_STAKING_CONTRACT; // Staking (proxy)

  const req = (v, name) => {
    if (!v || v === "" || v === "0x0000000000000000000000000000000000000000") {
      throw new Error(`❌ Missing/invalid ${name} in .env`);
    }
  };
  req(tokenAddress, "OBN_TOKEN_CONTRACT");
  req(stakingAddress, "OBN_STAKING_CONTRACT");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("🔗 Token   :", tokenAddress);
  console.log("🏦 Staking :", stakingAddress);

  // Sanity: both addresses are contracts
  const codeToken = await ethers.provider.getCode(tokenAddress);
  const codeStake = await ethers.provider.getCode(stakingAddress);
  if (codeToken === "0x") throw new Error("❌ OBN_TOKEN_CONTRACT is not a contract");
  if (codeStake === "0x") throw new Error("❌ OBN_STAKING_CONTRACT is not a contract");

  const token = await ethers.getContractAt("OBNToken", tokenAddress);
  const iface = token.interface;

  // Helpers to probe capabilities safely
  const hasFn = (name) => iface.fragments.some((f) => f.type === "function" && f.name === name);
  const tryCall = async (fn, args = []) => {
    try { return await token[fn](...args); } catch { return undefined; }
  };

  // --- PRE-CHECKS: if already authorized, exit early ---
  // 1) Try minter() view
  if (hasFn("minter")) {
    const current = await tryCall("minter");
    if (current && current.toLowerCase() === stakingAddress.toLowerCase()) {
      console.log("✅ Already sole minter via minter(). No action taken.");
      return;
    }
  }
  // 2) Try isMinter(address)
  if (hasFn("isMinter")) {
    const ok = await tryCall("isMinter", [stakingAddress]);
    if (ok === true) {
      console.log("✅ Already authorized via isMinter(). No action taken.");
      return;
    }
  }
  // 3) Try AccessControl hasRole
  let MINTER_ROLE;
  if (hasFn("hasRole")) {
    MINTER_ROLE = await tryCall("MINTER_ROLE") ?? ethers.id("MINTER_ROLE");
    const has = await tryCall("hasRole", [MINTER_ROLE, stakingAddress]);
    if (has === true) {
      console.log("✅ Already authorized via AccessControl. No action taken.");
      return;
    }
  }

  // --- AUTHORIZE (choose the method that exists) ---
  let tx;
  if (hasFn("setMinterOnce")) {
    console.log("📝 setMinterOnce(staking)...");
    tx = await token.setMinterOnce(stakingAddress);
  } else if (hasFn("setMinter")) {
    console.log("📝 setMinter(staking, true)...");
    tx = await token.setMinter(stakingAddress, true);
  } else if (hasFn("grantRole")) {
    MINTER_ROLE = await tryCall("MINTER_ROLE") ?? ethers.id("MINTER_ROLE");
    console.log("📝 grantRole(MINTER_ROLE, staking)...");
    tx = await token.grantRole(MINTER_ROLE, stakingAddress);
  } else {
    throw new Error(
      "❌ Token exposes neither setMinterOnce, setMinter, nor grantRole.\n" +
      "   Update OBNToken to include one of these, or point to the correct token."
    );
  }

  console.log("   tx:", tx.hash);
  const rcpt = await tx.wait();
  if (!rcpt || rcpt.status !== 1) {
    throw new Error("❌ Transaction reverted (receipt status != 1). Check owner/onlyOwner and token implementation.");
  }

  // Give RPC/indexer a moment to catch up
  await sleep(1500);

  // --- POST-CHECKS: confirm staking is authorized ---
  let ok = false;

  if (hasFn("minter")) {
    const m = await tryCall("minter");
    if (m && m.toLowerCase() === stakingAddress.toLowerCase()) ok = true;
  }
  if (!ok && hasFn("isMinter")) {
    const b = await tryCall("isMinter", [stakingAddress]);
    if (b === true) ok = true;
  }
  if (!ok && hasFn("hasRole")) {
    MINTER_ROLE = MINTER_ROLE ?? (await tryCall("MINTER_ROLE") ?? ethers.id("MINTER_ROLE"));
    const b = await tryCall("hasRole", [MINTER_ROLE, stakingAddress]);
    if (b === true) ok = true;
  }

  if (!ok) {
    // Print diagnostics to help you fix env/config mismatches
    const owner = hasFn("owner") ? await tryCall("owner") : undefined;
    const name  = hasFn("name") ? await tryCall("name") : undefined;
    const sym   = hasFn("symbol") ? await tryCall("symbol") : undefined;

    throw new Error(
      [
        "❌ Post-check failed: could not confirm staking is a minter.",
        "   Diagnostics:",
        `   - token.owner(): ${owner ?? "(n/a)"}`,
        `   - token.name/symbol: ${name ?? "?"} / ${sym ?? "?"}`,
        `   - token.minter(): ${hasFn("minter") ? (await tryCall("minter")) : "(no minter() view)"}`,
        `   - token.isMinter(staking): ${hasFn("isMinter") ? (await tryCall("isMinter", [stakingAddress])) : "(no isMinter())"}`,
        `   - token.hasRole(MINTER_ROLE, staking): ${hasFn("hasRole") ? (await tryCall("hasRole", [MINTER_ROLE ?? ethers.id("MINTER_ROLE"), stakingAddress])) : "(no AccessControl)"}`,
        "",
        "   Common causes:",
        "   • .env points to an OLD token (not the one you just deployed).",
        "   • You are not the owner calling onlyOwner function.",
        "   • You interacted with an implementation directly instead of the proxy.",
        "   • The token ABI doesn’t match the deployed bytecode (no minter API on-chain)."
      ].join("\n")
    );
  }

  console.log("✅ Staking is authorized to mint.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
