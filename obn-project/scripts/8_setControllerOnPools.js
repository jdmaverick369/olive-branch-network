// scripts/setControllerOnPools.js (ethers v6)
const hre = require("hardhat");
const { ethers } = hre;
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  const stakingAddress = process.env.OBN_STAKING_ADDRESS;
  const controllerAddress = process.env.OBN_CONTROLLER_ADDRESS;
  if (!stakingAddress || !controllerAddress) {
    throw new Error("Missing OBN_STAKING_ADDRESS or OBN_CONTROLLER_ADDRESS in .env");
  }

  // Use the real contract ABI so the selector is definitely correct
  const pools = await ethers.getContractAt("OBNStakingPools", stakingAddress);

  const ownerAddr = await pools.owner();
  console.log("Signer:", signerAddr);
  console.log("Pools.owner():", ownerAddr);
  if (ownerAddr.toLowerCase() !== signerAddr.toLowerCase()) {
    throw new Error(`This signer is not the Pools owner`);
  }

  console.log("Calling setEmissionsController(", controllerAddress, ") ...");
  const tx = await pools.setEmissionsController(controllerAddress);
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  console.log("✅ Controller set successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
