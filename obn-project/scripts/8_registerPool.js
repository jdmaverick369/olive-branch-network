// scripts/registerPool.js
const hre = require("hardhat");
const { ethers } = hre;
require("dotenv").config();

async function main() {
  const ctrl = await ethers.getContractAt("EmissionsController", process.env.OBN_CONTROLLER_ADDRESS);
  const pool = process.env.OBN_STAKING_ADDRESS;
  if (!pool) throw new Error("Set OBN_STAKING_ADDRESS in .env");

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  const owner = await ctrl.owner();

  console.log("Signer:", signerAddr);
  console.log("Controller.owner:", owner);
  if (owner.toLowerCase() !== signerAddr.toLowerCase()) {
    throw new Error("This signer is not the controller owner. Use the owner key or change owner.");
  }

  const tx = await ctrl.registerPool(pool);
  await tx.wait();
  console.log("Registered pool:", pool);
}
main().catch(e => { console.error(e); process.exit(1); });
