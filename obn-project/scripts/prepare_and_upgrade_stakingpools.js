require("dotenv").config();
const { ethers, upgrades, artifacts } = require("hardhat");

async function main() {
  const proxy =
    process.env.STAKING_POOLS_PROXY ||
    process.env.OBN_STAKING_CONTRACT ||
    process.env.PROXY;

  if (!proxy) throw new Error("Set STAKING_POOLS_PROXY=0x...");

  console.log("Proxy:", proxy);
  const implBefore = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("Current implementation:", implBefore);

  // ⚠️ Fully-qualified name to ensure we use contracts/StakingPools.sol
  const fqName = "contracts/StakingPools.sol:OBNStakingPools";
  const Impl = await ethers.getContractFactory(fqName);

  // Sanity: show source path Hardhat thinks this artifact came from
  const art = await artifacts.readArtifact(fqName);
  console.log("Artifact sourceName:", art.sourceName);

  // Prepare (deploys new impl only if bytecode changed)
  const preparedImpl = await upgrades.prepareUpgrade(proxy, Impl);
  console.log("Prepared implementation:", preparedImpl);

  if (preparedImpl.toLowerCase() === implBefore.toLowerCase()) {
    console.log("No bytecode changes detected. Did you save the file and clean/compile?");
    console.log("Tip: confirm _mintSlices has 10/88, 1/88, 1/88 math.");
    return;
  }

  // Upgrade
  const upgraded = await upgrades.upgradeProxy(proxy, Impl);
  await upgraded.waitForDeployment();
  const implAfter = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("New implementation:", implAfter);

  // Optional: update the on-chain version label if you added this setter
  try {
    await (await upgraded.postUpgrade_setVersion()).wait();
  } catch (_) {}
  try { console.log("Version:", await upgraded.version()); } catch (_) {}
}

main().catch((e) => { console.error(e); process.exit(1); });
