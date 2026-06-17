/**
 * deploy_airdrop.js
 * Deploys OBNAirdropClaim, approves all nonprofit PIDs, verifies on Basescan,
 * and prints the fund + startClaims instructions for the post-deploy checklist.
 *
 * NOTE: Before running, move OBNAirdropClaim.sol from future/contracts/ into contracts/.
 *       Hardhat's sources path only resolves from contracts/.
 *
 * Usage:
 *   npx hardhat run scripts/deploy_airdrop.js --network base_sepolia   # testnet
 *   npx hardhat run scripts/deploy_airdrop.js --network base           # mainnet
 *
 * Required env vars (see .env):
 *   PRIVATE_KEY               — deployer private key (also used to pay gas)
 *   OBN_TOKEN_CONTRACT        — OBN ERC-20 address
 *   OBN_STAKING_CONTRACT      — StakingPools proxy address
 *   AIRDROP_SIGNER_ADDRESS    — backend signer wallet address (issues EIP-712 signatures)
 *   OWNER_ADDRESS             — airdrop contract owner (multisig recommended)
 *   OBN_AIRDROP_ADDRESS       — funder address (the ONLY address that can call fund())
 *   BASESCAN_API_KEY          — for contract verification
 *
 * Optional env vars:
 *   AIRDROP_PIDS              — comma-separated list of PIDs to approve, e.g. "0,1,2,3,4,5,6,7,8"
 *                               Defaults to every PID_N found in env (PID_0, PID_1, …).
 */

require("dotenv").config();
const { ethers, run } = require("hardhat");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mustAddr(val, name) {
  if (!val || !/^0x[a-fA-F0-9]{40}$/.test(val)) {
    throw new Error(`❌ Missing or invalid address for ${name}: "${val}"`);
  }
  return val;
}

function resolvePids() {
  if (process.env.AIRDROP_PIDS) {
    return process.env.AIRDROP_PIDS.split(",").map((p) => Number(p.trim()));
  }
  // Auto-discover PID_0, PID_1, … from env
  const pids = [];
  let i = 0;
  while (process.env[`PID_${i}`]) {
    pids.push(i);
    i++;
  }
  if (pids.length === 0) throw new Error("❌ No PIDs found. Set AIRDROP_PIDS or PID_0…PID_N in env.");
  return pids;
}

async function verifyContract(address, constructorArgs) {
  console.log("\n🔍 Verifying on Basescan…");
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log("✅ Verified.");
  } catch (e) {
    if (e.message?.includes("Already Verified")) {
      console.log("✅ Already verified.");
    } else {
      console.warn("⚠️  Verification failed (you can retry manually):", e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const isMainnet = Number(network.chainId) === 8453;

  console.log(`\n🌐 Network : ${network.name} (chainId ${network.chainId})`);
  console.log(`👤 Deployer: ${deployer.address}`);

  // ---- Resolve constructor args from env ----
  const TOKEN         = mustAddr(process.env.OBN_TOKEN_CONTRACT,     "OBN_TOKEN_CONTRACT");
  const STAKING_POOLS = mustAddr(process.env.OBN_STAKING_CONTRACT,   "OBN_STAKING_CONTRACT");
  const SIGNER        = mustAddr(process.env.AIRDROP_SIGNER_ADDRESS,  "AIRDROP_SIGNER_ADDRESS");
  const OWNER         = mustAddr(process.env.OWNER_ADDRESS,           "OWNER_ADDRESS");
  const FUNDER        = mustAddr(process.env.OBN_AIRDROP_ADDRESS,     "OBN_AIRDROP_ADDRESS");

  const PIDS = resolvePids();

  console.log("\n📋 Constructor args:");
  console.log(`   token_        : ${TOKEN}`);
  console.log(`   stakingPools_ : ${STAKING_POOLS}`);
  console.log(`   signer_       : ${SIGNER}`);
  console.log(`   owner_        : ${OWNER}`);
  console.log(`   funder_       : ${FUNDER}`);
  console.log(`\n🎯 PIDs to approve: [${PIDS.join(", ")}]`);

  if (isMainnet) {
    console.log("\n⚠️  MAINNET deployment detected. You have 10 seconds to cancel (Ctrl+C)…");
    await new Promise((r) => setTimeout(r, 10_000));
  }

  // ---- Deploy ----
  console.log("\n🚀 Deploying OBNAirdropClaim…");
  const Factory = await ethers.getContractFactory("OBNAirdropClaim");
  const airdrop = await Factory.deploy(TOKEN, STAKING_POOLS, SIGNER, OWNER, FUNDER);
  await airdrop.waitForDeployment();
  const address = await airdrop.getAddress();
  console.log(`✅ Deployed at: ${address}`);

  // ---- Approve PIDs ----
  // approvePid is onlyOwner. Only attempt if the deployer IS the owner.
  // If owner is a multisig, PIDs must be approved separately via the multisig.
  if (deployer.address.toLowerCase() === OWNER.toLowerCase()) {
    console.log(`\n🔐 Approving ${PIDS.length} PIDs…`);
    for (const pid of PIDS) {
      process.stdout.write(`   approvePid(${pid})… `);
      const tx = await airdrop.approvePid(pid);
      await tx.wait();
      console.log(`✅ (tx: ${tx.hash})`);
    }
  } else {
    console.log(`\n⚠️  Deployer (${deployer.address}) ≠ Owner (${OWNER}).`);
    console.log(`   PIDs must be approved by the owner via multisig after deployment.`);
    console.log(`   PIDs to approve: [${PIDS.join(", ")}]`);
  }

  // ---- Verify ----
  await verifyContract(address, [TOKEN, STAKING_POOLS, SIGNER, OWNER, FUNDER]);

  // ---- Post-deploy checklist ----
  const explorerBase = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  OBNAirdropClaim deployed and PIDs approved.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contract : ${address}
Explorer : ${explorerBase}/address/${address}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEPS (manual — do in order):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. From the FUNDER wallet (${FUNDER}):
   a. Approve the airdrop contract to spend your OBN:
      OBN.approve("${address}", <amount_in_wei>)

   b. Fund the contract:
      OBNAirdropClaim.fund(<amount_in_wei>)

      Example for 50,000,000 OBN:
      amount = 50000000000000000000000000  (50_000_000 × 10^18)

2. From the OWNER wallet (${OWNER}):
   Call startClaims() when ready to open the campaign.
   This is irreversible — only do it after fund() is confirmed.

3. Add to .env:
   AIRDROP_CONTRACT=${address}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
