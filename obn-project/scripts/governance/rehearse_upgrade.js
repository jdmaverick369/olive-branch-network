// scripts/governance/rehearse_upgrade.js
//
// Window 0: Fork rehearsal for the upgradeToAndCall + migrateV93 atomic upgrade.
//
// Run this BEFORE queueing anything in the Timelock. It:
//   1. Verifies on-chain contract identities (anti-swap, OBN token, ownership)
//   2. Prints V93_IMPL bytecode codehash for audit trail
//   3. Encodes and double-decodes MIGRATE_CALLDATA and OUTER_CALLDATA
//   4. Prints keccak256 hashes of both for auditor sign-off and runbook recording
//   5. Simulates the exact OUTER_CALLDATA against a mainnet fork (Timelock impersonation)
//   6. Verifies all 10 post-upgrade invariants including exact upgradeBlock and one-time guard
//   7. Prints a compact RUNBOOK RECORD block to paste into the Address Registry
//
// Required env vars:
//   FORK_MAINNET=true    — required; script refuses to run without it
//   V93_IMPL             — StakingPoolsV93 bare implementation address
//   OFFERING_ADDR        — TheOffering address
//   EXTENDING_OB_ADDR    — ExtendOliveBranch address
//   OPERATOR_SAFE        — new charityFundOperator (Operator Safe)
//
// Optional (validated with requireAddr if provided; otherwise falls back to confirmed values):
//   STAKING_PROXY        — default: 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2
//   TIMELOCK             — default: 0x86396526286769ace21982E798Df5eef2389f51c
//   OBN_TOKEN            — default: 0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685
//
// Usage:
//   FORK_MAINNET=true \
//   V93_IMPL=0x... \
//   OFFERING_ADDR=0x... \
//   EXTENDING_OB_ADDR=0x... \
//   OPERATOR_SAFE=0x... \
//   npx hardhat run scripts/governance/rehearse_upgrade.js

require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;

const ERC1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const CONFIRMED_STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const CONFIRMED_TIMELOCK       = "0x86396526286769ace21982E798Df5eef2389f51c";
const CONFIRMED_OBN_TOKEN      = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
const OLD_TREASURY             = "0x5C8a0aCfAD4528714076068f71a5ff2Ee06c3718";
const OLD_CHARITY_FUND         = "0x398fE423a8b4FD9B40CADF8bc72448C95474455F";

function requireAddr(name) {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/i.test(v)) {
    throw new Error(`Missing or invalid address env var: ${name}  (got: ${v ?? "undefined"})`);
  }
  return v;
}

function pass(label, value) {
  process.stdout.write(`  ✓  ${label}${value !== undefined ? `  →  ${value}` : ""}\n`);
}

function fail(label, value) {
  process.stderr.write(`  ✗  ${label}${value !== undefined ? `  →  ${value}` : ""}\n`);
}

function check(ok, label, value) {
  if (ok) pass(label, value); else fail(label, value);
  return ok;
}

async function main() {
  // ── Guard: must run on a fork ─────────────────────────────────────────────────
  if (process.env.FORK_MAINNET !== "true") {
    throw new Error(
      "FORK_MAINNET=true is required. " +
      "This script impersonates the Timelock and must never run against live mainnet."
    );
  }

  const V93_IMPL          = requireAddr("V93_IMPL");
  const OFFERING_ADDR     = requireAddr("OFFERING_ADDR");
  const EXTENDING_OB_ADDR = requireAddr("EXTENDING_OB_ADDR");
  const OPERATOR_SAFE     = requireAddr("OPERATOR_SAFE");

  // Optional — validate format if provided, otherwise use confirmed mainnet values.
  const STAKING_PROXY = process.env.STAKING_PROXY
    ? requireAddr("STAKING_PROXY")
    : CONFIRMED_STAKING_PROXY;
  const TIMELOCK = process.env.TIMELOCK
    ? requireAddr("TIMELOCK")
    : CONFIRMED_TIMELOCK;
  const OBN_TOKEN = process.env.OBN_TOKEN
    ? requireAddr("OBN_TOKEN")
    : CONFIRMED_OBN_TOKEN;

  console.log("\n═".repeat(62));
  console.log("  OBN v9.3  —  Window 0: Fork Rehearsal (upgradeToAndCall)");
  console.log("═".repeat(62));
  console.log();
  console.log("  STAKING_PROXY     :", STAKING_PROXY);
  console.log("  TIMELOCK          :", TIMELOCK);
  console.log("  OBN_TOKEN         :", OBN_TOKEN);
  console.log("  V93_IMPL          :", V93_IMPL);
  console.log("  OFFERING_ADDR     :", OFFERING_ADDR);
  console.log("  EXTENDING_OB_ADDR :", EXTENDING_OB_ADDR);
  console.log("  OPERATOR_SAFE     :", OPERATOR_SAFE);

  const staking = await ethers.getContractAt("OBNStakingPools", STAKING_PROXY);

  // ── Section 1: On-chain contract identity ────────────────────────────────────
  console.log("\n─ 1. Contract identity verification (anti-swap) ─────────");

  const offeringAbi = [
    "function obn() view returns (address)",
    "function extendOliveBranch() view returns (address)",
    "function timelockOwner() view returns (address)",
  ];
  const extendAbi = [
    "function obn() view returns (address)",
    "function timelockOwner() view returns (address)",
  ];

  const offeringContract = await ethers.getContractAt(offeringAbi, OFFERING_ADDR);
  const extendContract   = await ethers.getContractAt(extendAbi,   EXTENDING_OB_ADDR);

  const offeringExtend   = await offeringContract.extendOliveBranch();
  const offeringOBN      = await offeringContract.obn();
  const offeringTimelock = await offeringContract.timelockOwner();
  const extendOBN        = await extendContract.obn();
  const extendTimelock   = await extendContract.timelockOwner();

  let identityOk = true;

  // Anti-swap: only TheOffering has extendOliveBranch(). If the two vault addresses
  // are transposed, this call either reverts or returns the wrong value.
  identityOk &= check(
    offeringExtend.toLowerCase() === EXTENDING_OB_ADDR.toLowerCase(),
    "OFFERING_ADDR.extendOliveBranch() == EXTENDING_OB_ADDR  (anti-swap)",
    offeringExtend
  );

  // OBN token equality: non-zero alone does not prove the vault points to the real token.
  identityOk &= check(
    offeringOBN.toLowerCase() === OBN_TOKEN.toLowerCase(),
    "OFFERING_ADDR.obn() == OBN_TOKEN",
    offeringOBN
  );
  identityOk &= check(
    extendOBN.toLowerCase() === OBN_TOKEN.toLowerCase(),
    "EXTENDING_OB_ADDR.obn() == OBN_TOKEN",
    extendOBN
  );

  identityOk &= check(
    offeringTimelock.toLowerCase() === TIMELOCK.toLowerCase(),
    "OFFERING_ADDR.timelockOwner() == TIMELOCK",
    offeringTimelock
  );
  identityOk &= check(
    extendTimelock.toLowerCase() === TIMELOCK.toLowerCase(),
    "EXTENDING_OB_ADDR.timelockOwner() == TIMELOCK",
    extendTimelock
  );

  const preVersion = await staking.version();
  identityOk &= check(preVersion === "9.2", 'STAKING_PROXY.version() == "9.2"', preVersion);

  const stakingOwner = await staking.owner();
  identityOk &= check(
    stakingOwner.toLowerCase() === TIMELOCK.toLowerCase(),
    "STAKING_PROXY.owner() == TIMELOCK",
    stakingOwner
  );

  // V93_IMPL must be uninitialized (version == "") and must not be owned by a privileged address.
  // version is a storage variable set only by initialize() → "9.2" and migrateV93() → "9.3".
  // A bare implementation never calls either; its storage is empty. Expect "".
  // The real version check happens post-upgrade on the PROXY (section 3 below).
  const implV93 = await ethers.getContractAt("OBNStakingPools", V93_IMPL);
  const implVersion = await implV93.version();
  identityOk &= check(implVersion === "", 'V93_IMPL.version() == "" (uninitialized bare impl)', implVersion);

  const implOwner = await implV93.owner();
  const implOwnerIsPrivileged =
    implOwner.toLowerCase() === TIMELOCK.toLowerCase() ||
    implOwner.toLowerCase() === OPERATOR_SAFE.toLowerCase();
  identityOk &= check(
    !implOwnerIsPrivileged,
    "V93_IMPL.owner() is not a privileged address",
    implOwner
  );

  // Bytecode codehash — record this in the runbook for audit trail.
  const implBytecode = await ethers.provider.getCode(V93_IMPL);
  const implCodeHash = ethers.keccak256(implBytecode);
  console.log("\n  V93_IMPL codehash (record in runbook):", implCodeHash);

  if (!identityOk) {
    throw new Error("Identity checks failed. Do not queue until all identity checks pass.");
  }

  // ── Section 2: Encode and double-decode calldata ──────────────────────────────
  console.log("\n─ 2. Calldata encoding + double-decode ──────────────");

  const MIGRATE_CALLDATA = staking.interface.encodeFunctionData("migrateV93", [
    OFFERING_ADDR,
    EXTENDING_OB_ADDR,
    OPERATOR_SAFE,
  ]);

  const OUTER_CALLDATA = staking.interface.encodeFunctionData("upgradeToAndCall", [
    V93_IMPL,
    MIGRATE_CALLDATA,
  ]);

  // Decode MIGRATE_CALLDATA and verify each argument.
  const decodedMigrate = staking.interface.decodeFunctionData("migrateV93", MIGRATE_CALLDATA);
  console.log("\n  MIGRATE_CALLDATA decoded:");
  console.log("    arg[0] newTreasury    :", decodedMigrate[0]);
  console.log("    arg[1] newCharityFund :", decodedMigrate[1]);
  console.log("    arg[2] newOperator    :", decodedMigrate[2]);

  let decodeOk = true;
  decodeOk &= check(
    decodedMigrate[0].toLowerCase() === OFFERING_ADDR.toLowerCase(),
    "migrate arg[0] == OFFERING_ADDR"
  );
  decodeOk &= check(
    decodedMigrate[1].toLowerCase() === EXTENDING_OB_ADDR.toLowerCase(),
    "migrate arg[1] == EXTENDING_OB_ADDR"
  );
  decodeOk &= check(
    decodedMigrate[2].toLowerCase() === OPERATOR_SAFE.toLowerCase(),
    "migrate arg[2] == OPERATOR_SAFE"
  );

  // Decode OUTER_CALLDATA and verify impl address and that inner bytes are intact.
  const decodedOuter = staking.interface.decodeFunctionData("upgradeToAndCall", OUTER_CALLDATA);
  console.log("\n  OUTER_CALLDATA decoded:");
  console.log("    arg[0] newImplementation :", decodedOuter[0]);
  console.log("    arg[1] inner bytes (head) :", decodedOuter[1].slice(0, 20) + "…");

  decodeOk &= check(
    decodedOuter[0].toLowerCase() === V93_IMPL.toLowerCase(),
    "outer arg[0] == V93_IMPL"
  );
  decodeOk &= check(
    decodedOuter[1].toLowerCase() === MIGRATE_CALLDATA.toLowerCase(),
    "outer arg[1] == MIGRATE_CALLDATA (inner bytes identical)"
  );

  if (!decodeOk) {
    throw new Error("Calldata decode mismatch. Do not queue.");
  }

  // ── Section 3: Calldata hashes ────────────────────────────────────────────────
  const migrateHash = ethers.keccak256(ethers.getBytes(MIGRATE_CALLDATA));
  const outerHash   = ethers.keccak256(ethers.getBytes(OUTER_CALLDATA));

  console.log("\n─ 3. Calldata hashes (both auditors record and compare independently) ─");
  console.log("  MIGRATE_CALLDATA :", MIGRATE_CALLDATA);
  console.log("  keccak256        :", migrateHash);
  console.log();
  console.log("  OUTER_CALLDATA   :", OUTER_CALLDATA);
  console.log("  keccak256        :", outerHash);
  console.log();
  console.log("  ⚠  Record MIGRATE_CALLDATA_HASH and OUTER_CALLDATA_HASH in the runbook");
  console.log("     Address Registry. Both auditors independently compute and compare");
  console.log("     before queueing. After queueing, hash the on-chain Timelock event");
  console.log("     payload and confirm it matches OUTER_CALLDATA_HASH exactly.");

  // ── Section 4: Fork rehearsal ─────────────────────────────────────────────────
  console.log("\n─ 4. Fork rehearsal ───────────────────────────────────");

  const preGlobalStaked = await staking.globalTotalStaked();
  const prePoolLength   = await staking.poolLength();

  console.log("  Pre-upgrade state (record as pre-upgrade snapshot):");
  console.log("    globalTotalStaked :", preGlobalStaked.toString());
  console.log("    poolLength        :", prePoolLength.toString());

  // Impersonate Timelock with enough ETH for gas.
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [TIMELOCK],
  });
  await hre.network.provider.send("hardhat_setBalance", [
    TIMELOCK,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  const timelockSigner = await ethers.getSigner(TIMELOCK);

  console.log("\n  Executing exact OUTER_CALLDATA from impersonated Timelock…");
  const tx = await timelockSigner.sendTransaction({
    to: STAKING_PROXY,
    data: OUTER_CALLDATA,
    gasLimit: 5_000_000n,
  });
  const receipt = await tx.wait();
  console.log(
    "  Transaction mined. Block:", receipt.blockNumber,
    " Gas used:", receipt.gasUsed.toString()
  );

  // ── Section 5: Post-upgrade verification ─────────────────────────────────────
  console.log("\n─ 5. Post-upgrade verification ─────────────────────────────");

  let allOk = true;

  const postVersion = await staking.version();
  allOk &= check(postVersion === "9.3", 'version() == "9.3"', postVersion);

  const upgradeBlock = await staking.upgradeBlock();
  // Exact block check: migrateV93 sets upgradeBlock = block.number of the upgrade tx.
  allOk &= check(
    upgradeBlock === BigInt(receipt.blockNumber),
    "upgradeBlock() == upgrade tx block",
    `${upgradeBlock} (expected ${receipt.blockNumber})`
  );

  const treasury = await staking.treasury();
  allOk &= check(
    treasury.toLowerCase() === OFFERING_ADDR.toLowerCase(),
    "treasury() == OFFERING_ADDR",
    treasury
  );
  allOk &= check(
    treasury.toLowerCase() !== OLD_TREASURY.toLowerCase(),
    "treasury() != OLD_TREASURY",
  );

  const charityFund = await staking.charityFund();
  allOk &= check(
    charityFund.toLowerCase() === EXTENDING_OB_ADDR.toLowerCase(),
    "charityFund() == EXTENDING_OB_ADDR",
    charityFund
  );
  allOk &= check(
    charityFund.toLowerCase() !== OLD_CHARITY_FUND.toLowerCase(),
    "charityFund() != OLD_CHARITY_FUND",
  );

  const charityFundOperator = await staking.charityFundOperator();
  allOk &= check(
    charityFundOperator.toLowerCase() === OPERATOR_SAFE.toLowerCase(),
    "charityFundOperator() == OPERATOR_SAFE",
    charityFundOperator
  );

  const implSlotRaw  = await ethers.provider.getStorage(STAKING_PROXY, ERC1967_IMPL_SLOT);
  const implFromSlot = "0x" + implSlotRaw.slice(26);
  allOk &= check(
    implFromSlot.toLowerCase() === V93_IMPL.toLowerCase(),
    "ERC1967 impl slot == V93_IMPL",
    implFromSlot
  );

  const postGlobalStaked = await staking.globalTotalStaked();
  allOk &= check(
    postGlobalStaked === preGlobalStaked,
    "globalTotalStaked unchanged",
    postGlobalStaked.toString()
  );

  const postPoolLength = await staking.poolLength();
  allOk &= check(
    postPoolLength === prePoolLength,
    "poolLength unchanged",
    postPoolLength.toString()
  );

  // One-time guard: a second migrateV93 call must revert.
  // This proves _migrationExecuted is set without needing a public getter.
  let secondCallReverted = false;
  try {
    await staking.connect(timelockSigner).migrateV93(
      OFFERING_ADDR,
      EXTENDING_OB_ADDR,
      OPERATOR_SAFE
    );
  } catch {
    secondCallReverted = true;
  }
  allOk &= check(secondCallReverted, "second migrateV93() reverts (_migrationExecuted guard)");

  // ── Section 6: RUNBOOK RECORD ─────────────────────────────────────────────────
  console.log("\n─ 6. RUNBOOK RECORD (paste into Address Registry before queueing) ─");
  console.log("  V93_IMPL              =", V93_IMPL);
  console.log("  OFFERING_ADDR         =", OFFERING_ADDR);
  console.log("  EXTENDING_OB_ADDR     =", EXTENDING_OB_ADDR);
  console.log("  OPERATOR_SAFE         =", OPERATOR_SAFE);
  console.log("  V93_IMPL_CODEHASH     =", implCodeHash);
  console.log("  MIGRATE_CALLDATA_HASH =", migrateHash);
  console.log("  OUTER_CALLDATA_HASH   =", outerHash);
  console.log("  PRE_GLOBAL_STAKED     =", preGlobalStaked.toString());
  console.log("  PRE_POOL_LENGTH       =", prePoolLength.toString());

  // ── Result ────────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(62));
  if (allOk) {
    console.log("  REHEARSAL PASSED — record hashes above, then queue Timelock");
  } else {
    console.error("  REHEARSAL FAILED — do not queue until all checks pass");
  }
  console.log("═".repeat(62) + "\n");

  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error("\nFatal:", e.message);
  process.exit(1);
});
