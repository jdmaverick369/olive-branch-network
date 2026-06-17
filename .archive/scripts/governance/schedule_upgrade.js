// scripts/governance/1_upgrade_stakingpools_schedule.js
// Prepares and schedules a StakingPools upgrade through the Timelock.
// This script will:
// 1. Deploy the new implementation contract
// 2. Encode the upgradeToAndCall calldata
// 3. Generate the timelock proposal parameters
// 4. Optionally schedule it if --auto is passed and signer has PROPOSER_ROLE

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
const crypto = require("crypto");
const minimist = require("minimist");
const fs = require("fs");

const UUPS_UPGRADE_ABI = [
  "function upgradeToAndCall(address newImplementation, bytes data)",
];

const TIMELOCK_ABI = [
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function scheduleBatch(address[] targets,uint256[] values,bytes[] data,bytes32 predecessor,bytes32 salt,uint256 delay)",
  "function hashOperationBatch(address[] targets,uint256[] values,bytes[] data,bytes32 predecessor,bytes32 salt) view returns (bytes32)",
  "function getMinDelay() view returns (uint256)",
];

function mustAddr(a, name = "address") {
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error(`❌ ${name}: invalid or missing -> ${a}`);
  return a;
}

async function main() {
  const argv = minimist(process.argv.slice(2));

  // Get required addresses from environment
  const STAKING_PROXY = mustAddr(
    process.env.OBN_STAKING_CONTRACT || process.env.STAKING_POOLS_PROXY,
    "STAKING_PROXY"
  );
  const TIMELOCK = mustAddr(process.env.TIMELOCK_ADDR, "TIMELOCK_ADDR");

  console.log("=== StakingPools Upgrade via Timelock ===");
  console.log("Proxy:", STAKING_PROXY);
  console.log("Timelock:", TIMELOCK);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", await signer.getAddress());

  // Get current implementation
  const implBefore = await upgrades.erc1967.getImplementationAddress(STAKING_PROXY);
  console.log("\nCurrent implementation:", implBefore);

  // Deploy new implementation
  console.log("\n📦 Deploying new implementation...");
  const fqName = "contracts/StakingPools.sol:OBNStakingPools";
  const StakingPoolsFactory = await ethers.getContractFactory(fqName);

  // Prepare upgrade - this deploys the new implementation
  const newImplAddress = await upgrades.prepareUpgrade(STAKING_PROXY, StakingPoolsFactory);
  console.log("✅ New implementation deployed at:", newImplAddress);

  if (newImplAddress.toLowerCase() === implBefore.toLowerCase()) {
    console.log("\n⚠️ WARNING: New implementation is same as current. No bytecode changes detected.");
    console.log("Did you save the contract file and recompile?");
    if (!argv.force) {
      console.log("Use --force to proceed anyway.");
      return;
    }
  }

  // Encode the upgrade call
  // upgradeToAndCall(newImplementation, bytes data)
  // For a simple upgrade with no initialization call, data = "0x"
  const upgradeInterface = new ethers.Interface(UUPS_UPGRADE_ABI);
  const upgradeData = upgradeInterface.encodeFunctionData("upgradeToAndCall", [
    newImplAddress,
    "0x" // no initialization call needed for this upgrade
  ]);

  // Prepare timelock parameters
  const targets = [STAKING_PROXY];
  const values = [0];
  const datas = [upgradeData];
  const predecessor = ethers.ZeroHash;
  const salt = ethers.hexlify(crypto.randomBytes(32));
  const delayArg = 0; // Timelock enforces its minDelay automatically

  // Calculate operation hash
  const timelock = new ethers.Contract(TIMELOCK, TIMELOCK_ABI, signer);
  const opId = await timelock.hashOperationBatch(targets, values, datas, predecessor, salt);
  const minDelay = await timelock.getMinDelay();

  console.log("\n🧰 Timelock Proposal Parameters:");
  console.log("─────────────────────────────────────");
  console.log("Operation ID:", opId);
  console.log("Min Delay:", Number(minDelay), "seconds");
  console.log("\nParameters:");
  console.log({
    targets,
    values: values.map(v => v.toString()),
    datas,
    predecessor,
    salt,
    delayArg,
  });

  // Save to JSON file for reference
  const proposalData = {
    timestamp: new Date().toISOString(),
    network: (await ethers.provider.getNetwork()).name,
    stakingProxy: STAKING_PROXY,
    timelock: TIMELOCK,
    oldImplementation: implBefore,
    newImplementation: newImplAddress,
    opId,
    minDelay: Number(minDelay),
    targets,
    values: values.map(v => v.toString()),
    datas,
    predecessor,
    salt,
    delayArg,
  };

  const filename = `upgrade_stakingpools_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(proposalData, null, 2));
  console.log(`\n💾 Proposal saved to: ${filename}`);

  console.log("\n🔖 Environment Variables for Execution:");
  console.log("─────────────────────────────────────");
  console.log(`export TARGETS_CSV="${targets.join(",")}"`);
  console.log(`export VALUES_CSV="${values.join(",")}"`);
  console.log(`export DATAS_HEX_CSV="${datas.join(",")}"`);
  console.log(`export PREDECESSOR="${predecessor}"`);
  console.log(`export SALT="${salt}"`);
  console.log(`export OP_ID="${opId}"`);

  // Check if auto-schedule is requested
  try {
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const canPropose = await timelock.hasRole(PROPOSER_ROLE, await signer.getAddress());

    console.log("\n📋 Scheduling Options:");
    console.log("─────────────────────────────────────");
    console.log("Signer has PROPOSER_ROLE:", canPropose);

    if (argv.auto && canPropose) {
      console.log("\n🟢 Auto-scheduling enabled and authorized. Scheduling now...");
      const tx = await timelock.scheduleBatch(targets, values, datas, predecessor, salt, delayArg);
      console.log("Transaction hash:", tx.hash);
      await tx.wait();
      console.log(`✅ Scheduled! Operation ID: ${opId}`);
      console.log(`⏳ Wait ${minDelay} seconds before execution is allowed.`);
    } else if (argv.auto) {
      console.log("\n⚠️ --auto provided but signer lacks PROPOSER_ROLE.");
      console.log("Use your Gnosis Safe to schedule this operation.");
    } else {
      console.log("\nℹ️ Not auto-scheduling (no --auto flag).");
      console.log("Use your Gnosis Safe to call TimelockController.scheduleBatch()");
    }
  } catch (e) {
    console.log("\n⚠️ Could not check PROPOSER_ROLE:", e.message);
  }

  console.log("\n📝 Next Steps:");
  console.log("─────────────────────────────────────");
  console.log("1. Schedule via Gnosis Safe (if not auto-scheduled):");
  console.log("   - Connect to your Gnosis Safe");
  console.log("   - Create transaction to TimelockController.scheduleBatch()");
  console.log(`   - Use the parameters from ${filename}`);
  console.log(`   - Wait ${minDelay} seconds after scheduling`);
  console.log("\n2. Execute the upgrade:");
  console.log("   - Run: node scripts/governance/2_execute_by_hash.js");
  console.log("   - Or execute via Gnosis Safe using same parameters");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
