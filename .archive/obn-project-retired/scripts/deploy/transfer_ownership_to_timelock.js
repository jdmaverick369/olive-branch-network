// scripts/governance/transfer_ownership_to_timelock.js
const { ethers } = require("hardhat");

async function main() {
  const timelock = process.env.TIMELOCK_ADDR;
  const token = process.env.OBN_TOKEN_CONTRACT;
  const pools = process.env.OBN_STAKING_CONTRACT;
  const vesting = process.env.TEAM_VESTING_CONTRACT; // optional

  if (!ethers.isAddress(timelock)) throw new Error("❌ TIMELOCK_ADDR missing/invalid");
  if (!ethers.isAddress(token)) throw new Error("❌ OBN_TOKEN_CONTRACT missing/invalid");
  if (!ethers.isAddress(pools)) throw new Error("❌ OBN_STAKING_CONTRACT missing/invalid");

  const tokenCtr = await ethers.getContractAt("OBNToken", token);
  const poolsCtr = await ethers.getContractAt("OBNStakingPools", pools);

  console.log("=== Before ownership transfers ===");
  console.log("Token.owner:", await tokenCtr.owner());
  console.log("Pools.owner:", await poolsCtr.owner());

  if (vesting && ethers.isAddress(vesting)) {
    const vestCtr = await ethers.getContractAt("TeamVesting", vesting);
    console.log("Vesting.owner:", await vestCtr.owner());
  }

  console.log("\nTransferring OBNToken.owner → Timelock...");
  await (await tokenCtr.transferOwnership(timelock)).wait();
  console.log("✅ OBNToken ownership moved.");

  console.log("Transferring OBNStakingPools.owner → Timelock...");
  await (await poolsCtr.transferOwnership(timelock)).wait();
  console.log("✅ OBNStakingPools ownership moved.");

  if (vesting && ethers.isAddress(vesting)) {
    console.log("Transferring TeamVesting.owner → Timelock...");
    const vestCtr = await ethers.getContractAt("TeamVesting", vesting);
    await (await vestCtr.transferOwnership(timelock)).wait();
    console.log("✅ TeamVesting ownership moved.");
  }

  console.log("\n=== After ownership transfers ===");
  console.log("Token.owner:", await tokenCtr.owner());
  console.log("Pools.owner:", await poolsCtr.owner());

  if (vesting && ethers.isAddress(vesting)) {
    const vestCtr = await ethers.getContractAt("TeamVesting", vesting);
    console.log("Vesting.owner:", await vestCtr.owner());
  }

  console.log("\n🎉 All set! Contracts now governed by Timelock:", timelock);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
