const { ethers } = require("hardhat");

async function main() {
  const delay = Number(process.env.TIMELOCK_DELAY || 86400);         // 24h default
  const proposer = process.env.GNOSIS_SAFE_ADDRESS;                  // from your .env

  console.log("GNOSIS_SAFE_ADDRESS =", proposer);
  console.log("TIMELOCK_DELAY =", delay);

  if (!proposer || !ethers.isAddress(proposer)) {
    throw new Error("❌ Missing or invalid Gnosis Safe address in GNOSIS_SAFE_ADDRESS");
  }

  // Use the wrapper by class name (requires file name: contracts/governance/OBNTimeLock.sol)
  console.log("Getting factory for OBNTimeLock…");
  const Timelock = await ethers.getContractFactory("OBNTimeLock");

  console.log("Deploying OBNTimeLock…");
  const timelock = await Timelock.deploy(
    delay,
    [proposer],             // proposers (your Safe)
    [ethers.ZeroAddress],   // executors (anyone can execute after delay)
    proposer                // temporary admin = Safe
  );
  await timelock.waitForDeployment();
  const addr = await timelock.getAddress();
  console.log("✅ Timelock deployed at:", addr);

  // role ids (ethers v6: compute via keccak256)
  const ADMIN_ROLE    = ethers.keccak256(ethers.toUtf8Bytes("TIMELOCK_ADMIN_ROLE"));
  const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
  // const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE")); // not needed

  console.log("Granting admin to Timelock itself…");
  await (await timelock.grantRole(ADMIN_ROLE, addr)).wait();

  console.log("Ensuring Safe has PROPOSER_ROLE…");
  const hasProposer = await timelock.hasRole(PROPOSER_ROLE, proposer);
  if (!hasProposer) {
    await (await timelock.grantRole(PROPOSER_ROLE, proposer)).wait();
  }

  console.log("Renouncing Safe as admin…");
  await (await timelock.renounceRole(ADMIN_ROLE, proposer)).wait();

  console.log("✅ Timelock is now self-administered.");
  console.log("👉 Add to .env: TIMELOCK_ADDR =", addr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
