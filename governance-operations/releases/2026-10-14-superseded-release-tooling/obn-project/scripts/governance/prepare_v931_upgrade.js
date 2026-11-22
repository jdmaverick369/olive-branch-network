"use strict";
// check is read-only; schedule/execute only write unsigned Safe JSON.
// Only ACTION=deploy broadcasts an implementation deployment.
const hre = require("hardhat");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");
const addrs = require("./addresses");
const PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const BASELINE = "0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E";
const TIMELOCK = "0x86396526286769ace21982E798Df5eef2389f51c";
const OLD = "contracts/StakingPoolsV93.sol:OBNStakingPools";
const NEXT = "OBNStakingPoolsV931";

async function matchCode(name, address) {
  const artifact = await hre.artifacts.readArtifact(name);
  const build = await hre.artifacts.getBuildInfo(`${artifact.sourceName}:${artifact.contractName}`);
  const output = build.output.contracts[artifact.sourceName][artifact.contractName];
  const refs = output.evm.deployedBytecode.immutableReferences;
  if (Object.keys(refs).length !== 1) throw new Error("Unexpected implementation immutables");
  let code = artifact.deployedBytecode.toLowerCase();
  for (const { start, length } of Object.values(refs).flat()) {
    if (length !== 32) throw new Error("Unexpected UUPS immutable width");
    const offset = 2 + start * 2;
    code = code.slice(0, offset) + address.slice(2).toLowerCase().padStart(64, "0") + code.slice(offset + 64);
  }
  if ((await hre.ethers.provider.getCode(address)).toLowerCase() !== code) throw new Error(`${name} deployed bytecode mismatch`);
}

async function main() {
  const { ethers, upgrades } = hre;
  const action = process.env.ACTION || "check";
  if (!["check", "deploy", "schedule", "execute"].includes(action)) throw new Error("Invalid ACTION");
  if ((await ethers.provider.getNetwork()).chainId !== 8453n) throw new Error("Base mainnet required");
  if (addrs.STAKING_PROXY.toLowerCase() !== PROXY.toLowerCase() || addrs.TIMELOCK.toLowerCase() !== TIMELOCK.toLowerCase()) throw new Error("Unexpected address overrides");
  const actual = await upgrades.erc1967.getImplementationAddress(PROXY);
  if (actual.toLowerCase() !== BASELINE.toLowerCase()) throw new Error("Proxy no longer uses reviewed V9.3 baseline");
  await matchCode(OLD, actual);
  const staking = await ethers.getContractAt(OLD, PROXY);
  if ((await staking.owner()).toLowerCase() !== TIMELOCK.toLowerCase()) throw new Error("Unexpected staking owner");
  if (await staking.version() !== "9.3" || await staking.upgradeBlock() === 0n) throw new Error("V9.3 migration not confirmed");
  const Old = await ethers.getContractFactory(OLD), Next = await ethers.getContractFactory(NEXT);
  await upgrades.validateUpgrade(Old, Next, { kind: "uups" });
  const artifact = await hre.artifacts.readArtifact(NEXT);
  if ((artifact.deployedBytecode.length - 2) / 2 > 24576) throw new Error("Implementation exceeds EIP-170 size limit");
  console.log(`Validated V9.3 baseline, Timelock ownership and V9.3.1 storage compatibility for ${PROXY}`);
  if (action === "check") return;
  if (action === "deploy") {
    const next = await Next.deploy();
    console.log(`Deployment transaction: ${next.deploymentTransaction().hash}`);
    await next.waitForDeployment();
    console.log(`STAKING_V931_IMPL=${next.target}`);
    console.log("Proxy unchanged. Verify this implementation before generating the schedule.");
    return;
  }
  const candidate = process.env.STAKING_V931_IMPL, executor = process.env.AUTOCLAIM_EXECUTOR;
  for (const address of [candidate, executor]) if (!ethers.isAddress(address) || address === ethers.ZeroAddress) throw new Error("STAKING_V931_IMPL and AUTOCLAIM_EXECUTOR are required");
  if (executor.toLowerCase() === TIMELOCK.toLowerCase() || executor.toLowerCase() === addrs.OPERATOR_SAFE.toLowerCase()) throw new Error("Use a dedicated automation smart account");
  await matchCode(NEXT, candidate);
  const timelock = await ethers.getContractAt([
    "function getMinDelay() view returns(uint256)", "function isOperationReady(bytes32) view returns(bool)",
  ], TIMELOCK);
  if (BigInt(addrs.TIMELOCK_DELAY) < await timelock.getMinDelay()) throw new Error("Delay below minimum");
  const init = Next.interface.encodeFunctionData("initializeV931", [executor]);
  const calldata = Next.interface.encodeFunctionData("upgradeToAndCall", [candidate, init]);
  const args = { target: PROXY, calldata, label: "staking-v931-autoclaim" };
  if (action === "schedule") scheduleOne(args);
  else {
    if (!ethers.isHexString(process.env.OP_ID, 32) || !await timelock.isOperationReady(process.env.OP_ID)) throw new Error("Scheduled operation is not ready");
    executeOne(args); // exact salt/operation-ID comparison before writing
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
