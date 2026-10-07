#!/usr/bin/env node
// Regenerates obn-sdk/ from obn-project compiled artifacts and live Base mainnet state.
//
//   cd obn-project && npx hardhat compile && cd ..
//   node obn-sdk/scripts/generate.cjs
//
// Every ABI is taken from the artifact whose runtime bytecode matches the code
// deployed at that address (CBOR metadata stripped, immutables masked). If no
// artifact matches exactly, a candidate is accepted only when every function
// selector in its ABI is present in the deployed code. Anything else aborts.
// Read-only: no keys, no transactions. Set BASE_RPC_URL to use your own node.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECT = path.join(ROOT, "obn-project");
const SDK = path.join(ROOT, "obn-sdk");
const { ethers } = createRequire(path.join(PROJECT, "package.json"))("ethers");
const { NONPROFITS } = require(path.join(PROJECT, "scripts", "governance", "nonprofits.js"));

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const CHAIN_ID = 8453n;
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// Candidates are listed newest first; the first one matching on-chain code wins.
const CONTRACTS = [
  { name: "OBNToken", address: "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685", proxy: true,
    candidates: ["contracts/OBNToken.sol:OBNToken"] },
  { name: "OBNStakingPools", address: "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2", proxy: true,
    candidates: ["contracts/StakingPoolsV94.sol:OBNStakingPoolsV94", "contracts/StakingPoolsV932.sol:OBNStakingPoolsV932",
      "contracts/StakingPoolsV931.sol:OBNStakingPoolsV931", "contracts/StakingPoolsV93.sol:OBNStakingPools"] },
  // OBNStakingLensV1 is the frozen pre-v9.3.2 copy of contracts/OBNStakingLens.sol (renamed only),
  // kept so both Lens versions compile side by side during the upgrade.
  { name: "OBNStakingLens", address: "0x2ae4df523040c0245a6F84342E4B06850c5bdb9b", proxy: true,
    candidates: ["contracts/OBNStakingLens.sol:OBNStakingLens",
      { fqn: "contracts/test/OBNStakingLensV1.sol:OBNStakingLensV1", source: "contracts/OBNStakingLens.sol (pre-v9.3.2; frozen copy: contracts/test/OBNStakingLensV1.sol)" }] },
  { name: "AnnualGovernance", address: "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270", proxy: true,
    candidates: ["contracts/AnnualGovernanceV2.sol:AnnualGovernanceV2", "contracts/AnnualGovernance.sol:AnnualGovernance"] },
  { name: "OliveAssembly", address: "0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c", proxy: true,
    candidates: ["contracts/OliveAssembly.sol:OliveAssembly"] },
  { name: "TheOffering", address: "0xc75B2a5C7B8F88327D44C223769cFa19cc93E341",
    candidates: ["contracts/TheOffering.sol:TheOffering"] },
  { name: "ExtendOliveBranch", address: "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B",
    candidates: ["contracts/ExtendOliveBranch.sol:ExtendOliveBranch"] },
  { name: "OBNTimeLock", address: "0x86396526286769ace21982E798Df5eef2389f51c",
    candidates: ["contracts/OBNTimeLock.sol:OBNTimeLock"] },
  { name: "TeamVesting", address: "0x9428Edd912224778d84D762ebCDA52e1c829aB8d",
    candidates: ["contracts/TeamVesting.sol:TeamVesting"] },
  { name: "OliveNFT", address: "0xB66F67444b09f509D72d832567C2df84Edeb80F8",
    candidates: ["contracts/OliveNFT.sol:OliveNFT"] },
];

function loadArtifact(candidate) {
  const { fqn, source: published } = typeof candidate === "string" ? { fqn: candidate } : candidate;
  const [source, name] = fqn.split(":");
  const file = path.join(PROJECT, "artifacts", source, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
  const dbg = JSON.parse(fs.readFileSync(file.replace(/\.json$/, ".dbg.json"), "utf8"));
  const buildInfo = JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), dbg.buildInfo), "utf8"));
  const immutables = buildInfo.output.contracts[source][name].evm.deployedBytecode.immutableReferences || {};
  return { fqn, published: published || fqn, abi: artifact.abi, code: artifact.deployedBytecode, immutables };
}

// Public RPCs rate-limit bursts; retry reads with a short backoff.
async function retry(read) {
  for (let attempt = 1; ; attempt++) {
    try { return await read(); } catch (err) {
      if (attempt === 5) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Zero immutable slots, then drop the trailing CBOR metadata (length in the last 2 bytes).
function normalize(code, immutables) {
  const bytes = Buffer.from(code.replace(/^0x/, ""), "hex");
  for (const refs of Object.values(immutables)) for (const { start, length } of refs) bytes.fill(0, start, start + length);
  const metadataLength = bytes.readUInt16BE(bytes.length - 2);
  return bytes.subarray(0, bytes.length - metadataLength - 2).toString("hex");
}

function selectorsPresent(abi, code) {
  const hex = code.toLowerCase();
  const iface = new ethers.Interface(abi);
  const missing = [];
  iface.forEachFunction(fn => { if (!hex.includes("63" + fn.selector.slice(2))) missing.push(fn.format()); });
  return missing;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  if ((await provider.getNetwork()).chainId !== CHAIN_ID) throw Error("RPC is not Base mainnet");
  const blockTag = await provider.getBlockNumber();

  fs.rmSync(path.join(SDK, "abis"), { recursive: true, force: true });
  fs.mkdirSync(path.join(SDK, "abis"), { recursive: true });
  fs.mkdirSync(path.join(SDK, "deployments"), { recursive: true });

  const contracts = {};
  const abis = {};
  for (const c of CONTRACTS) {
    let target = c.address;
    let implementation;
    if (c.proxy) {
      const slot = await retry(() => provider.getStorage(c.address, IMPLEMENTATION_SLOT, blockTag));
      implementation = ethers.getAddress("0x" + slot.slice(-40));
      target = implementation;
    }
    const onchain = await retry(() => provider.getCode(target, blockTag));
    if (onchain === "0x") throw Error(`${c.name}: no code at ${target}`);

    const candidates = c.candidates.map(loadArtifact).filter(Boolean);
    let chosen = candidates.find(a => normalize(a.code, a.immutables) === normalize(onchain, a.immutables));
    let match = "bytecode";
    if (!chosen) {
      chosen = candidates.find(a => selectorsPresent(a.abi, onchain).length === 0);
      match = "selectors";
    }
    if (!chosen) throw Error(`${c.name}: no artifact matches deployed code at ${target} (tried ${candidates.map(a => a.fqn).join(", ")})`);

    const abiFile = `abis/${c.name}.json`;
    fs.writeFileSync(path.join(SDK, abiFile), JSON.stringify(chosen.abi, null, 2) + "\n");
    abis[c.name] = chosen.abi;
    contracts[c.name] = {
      address: ethers.getAddress(c.address),
      ...(c.proxy ? { proxy: "ERC1967 (UUPS)", implementation } : {}),
      abi: abiFile,
      source: `obn-project/${chosen.published}`,
      verifiedBy: match,
    };
    console.log(`${c.name.padEnd(18)} ${match.padEnd(9)} ${chosen.fqn}${implementation ? `  impl ${implementation}` : ""}`);
  }

  fs.writeFileSync(path.join(SDK, "deployments", "base-mainnet.json"), JSON.stringify({
    chainId: Number(CHAIN_ID), network: "base", block: blockTag, contracts,
  }, null, 2) + "\n");

  // Pool registry: wallets and status from chain, names from nonprofits.js, facts from registry/pool-metadata.json.
  const staking = new ethers.Contract(contracts.OBNStakingPools.address, abis.OBNStakingPools, provider);
  const metadata = JSON.parse(fs.readFileSync(path.join(SDK, "registry", "pool-metadata.json"), "utf8"));
  const count = Number(await retry(() => staking.poolLength({ blockTag })));
  const pools = [];
  for (let pid = 0; pid < count; pid++) {
    const [wallet] = await retry(() => staking.getPoolInfo(pid, { blockTag }));
    const shutdown = await retry(() => staking.poolRemoved(pid, { blockTag }));
    const removed = await retry(() => staking.poolFullyRemoved(pid, { blockTag }));
    const registered = NONPROFITS.find(n => n.pid === pid);
    const meta = metadata.find(m => m.pid === pid);
    if (!registered || !meta) throw Error(`pid ${pid}: missing from nonprofits.js or registry/pool-metadata.json`);
    if (registered.wallet.toLowerCase() !== wallet.toLowerCase()) throw Error(`pid ${pid}: nonprofits.js wallet ${registered.wallet} != on-chain ${wallet}`);
    pools.push({
      pid, name: registered.name, shortName: meta.shortName, wallet: ethers.getAddress(wallet),
      status: removed ? "removed" : shutdown ? "shutdown" : "active",
      category: meta.category, websiteUrl: meta.websiteUrl, ...(meta.verifyUrl ? { verifyUrl: meta.verifyUrl } : {}),
    });
  }
  fs.writeFileSync(path.join(SDK, "deployments", "base-mainnet.pools.json"), JSON.stringify({
    chainId: Number(CHAIN_ID), staking: contracts.OBNStakingPools.address, block: blockTag, pools,
  }, null, 2) + "\n");
  console.log(`pools              ${pools.length} (block ${blockTag})`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
