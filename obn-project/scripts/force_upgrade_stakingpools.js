require("dotenv").config();
const { ethers, upgrades, artifacts } = require("hardhat");

async function main() {
  const proxy =
    process.env.STAKING_POOLS_PROXY ||
    process.env.OBN_STAKING_CONTRACT ||
    process.env.PROXY;

  if (!proxy) throw new Error("Set OBN_STAKING_CONTRACT or STAKING_POOLS_PROXY = 0x...");

  const fqName = "contracts/StakingPools.sol:OBNStakingPools";
  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Signer:", signerAddr);
  console.log("Proxy:", proxy);

  // Read proxy owner (proxy is Ownable UUPS)
  const ownable = await ethers.getContractAt(
    ["function owner() view returns (address)"],
    proxy
  );
  const owner = await ownable.owner();
  console.log("Proxy owner:", owner);

  const implBefore = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("Current implementation:", implBefore);

  const Impl = await ethers.getContractFactory(fqName);
  const art = await artifacts.readArtifact(fqName);
  console.log("Artifact sourceName:", art.sourceName);

  await upgrades.validateUpgrade(proxy, Impl);
  const preparedImpl = await upgrades.prepareUpgrade(proxy, Impl);
  console.log("Prepared implementation:", preparedImpl);

  if (owner.toLowerCase() !== signerAddr.toLowerCase()) {
    console.log("⚠️  This signer is NOT the proxy owner. Execute the upgrade from the owner.");
    const uupsIface = new ethers.Interface(["function upgradeTo(address newImplementation)"]);
    const data = uupsIface.encodeFunctionData("upgradeTo", [preparedImpl]);
    console.log("Submit this TX from the OWNER (e.g. Gnosis Safe):");
    console.log("  to:   ", proxy);
    console.log("  data: ", data);
    return;
  }

  console.log("Sending upgrade transaction…");
  const upgraded = await upgrades.upgradeProxy(proxy, Impl);
  await upgraded.waitForDeployment();

  const implAfter = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("New implementation:", implAfter);

  const proxyAsNew = await ethers.getContractAt(fqName, proxy);
  try { console.log("Version:", await proxyAsNew.version()); } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });
