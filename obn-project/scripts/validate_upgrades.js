const { upgrades } = require("hardhat");

async function main() {
  const Lens = await hre.ethers.getContractFactory("OBNStakingLens");
  await upgrades.validateImplementation(Lens, { kind: "uups" });
  console.log("OBNStakingLens: PASS");

  const AG = await hre.ethers.getContractFactory("AnnualGovernance");
  await upgrades.validateImplementation(AG, { kind: "uups" });
  console.log("AnnualGovernance: PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });
