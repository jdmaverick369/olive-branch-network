// scripts/upgrade-staking.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxy = "0x2c4bd5b2a48a76f288d7f2db23afd3a03b9e7cd2"; // your staking proxy
  const Staking = await ethers.getContractFactory("OBNStakingPools");

  console.log("Upgrading proxy at:", proxy);
  await upgrades.upgradeProxy(proxy, Staking);                // executes upgradeTo via proxy
  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("✅ New implementation:", impl);
}

main().catch((e) => { console.error(e); process.exit(1); });
