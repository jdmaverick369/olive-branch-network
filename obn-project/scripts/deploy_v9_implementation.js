// Deploy v9.0 implementation for governance upgrade
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("=== Deploying StakingPools v9.0 Implementation ===\n");

  const [signer] = await ethers.getSigners();
  console.log("Deploying with:", await signer.getAddress());
  console.log();

  // Deploy the new implementation
  const OBNStakingPools = await ethers.getContractFactory("OBNStakingPools");
  const implementation = await OBNStakingPools.deploy();
  await implementation.waitForDeployment();

  const implAddress = await implementation.getAddress();
  console.log("✅ Implementation deployed at:", implAddress);
  console.log();

  // Get current proxy info
  const proxyAddr = process.env.OBN_STAKING_CONTRACT;
  console.log("Proxy address:", proxyAddr);
  console.log();

  // Create governance proposal data
  const proposalData = {
    timestamp: new Date().toISOString(),
    network: "base",
    stakingProxy: proxyAddr,
    timelock: process.env.TIMELOCK_ADDR,
    oldImplementation: "", // Will be filled by querying proxy
    newImplementation: implAddress,
    minDelay: 86400,
    targets: [proxyAddr],
    values: ["0"],
    datas: [], // Will be filled below
    predecessor: "0x0000000000000000000000000000000000000000000000000000000000000000",
  };

  // Create upgrade call data (upgradeTo with empty init data)
  const iface = new ethers.Interface([
    "function upgradeTo(address newImplementation, bytes calldata data)"
  ]);
  
  const upgradeData = iface.encodeFunctionData("upgradeTo", [
    implAddress,
    "0x" // empty init data
  ]);

  proposalData.datas = [upgradeData];

  // Get current implementation for oldImplementation field
  try {
    const { upgrades } = require("hardhat");
    const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddr);
    proposalData.oldImplementation = currentImpl;
    console.log("Current implementation:", currentImpl);
  } catch (e) {
    console.log("Warning: Could not fetch current implementation");
  }

  // Save proposal JSON
  const fs = require("fs");
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `governance-operations/${timestamp}-upgrade_stakingpools_v9.json`;
  
  fs.writeFileSync(filename, JSON.stringify(proposalData, null, 2));
  console.log(`\n✅ Proposal saved to: ${filename}`);
  console.log();
  console.log("=== Proposal Summary ===");
  console.log(`New Implementation: ${implAddress}`);
  console.log(`Version: 9.0`);
  console.log(`Timelock Delay: ${proposalData.minDelay} seconds (24 hours)`);
  console.log();
  console.log("Next steps:");
  console.log("1. Review the proposal JSON");
  console.log("2. Queue via Gnosis Safe using the timelock.scheduleBatch() function");
  console.log("3. Wait 24 hours");
  console.log("4. Execute via execute_upgrade.js");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
