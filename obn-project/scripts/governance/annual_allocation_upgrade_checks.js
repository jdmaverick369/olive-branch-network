"use strict";

// Read-only checks shared by implementation deployment and Safe payload generation.
// Account for UUPSUpgradeable's immutable __self address, then ignore only Solidity's
// CBOR metadata trailer for V1, whose frozen fixture has a different name/path.
function executableBytecode(code) {
  if (!/^0x[0-9a-f]+$/i.test(code) || code.length < 6) throw new Error("Missing contract bytecode");
  const metadataBytes = parseInt(code.slice(-4), 16);
  const end = code.length - (metadataBytes + 2) * 2;
  if (end <= 2) throw new Error("Invalid Solidity metadata trailer");
  return code.slice(0, end).toLowerCase();
}

async function deployedCodeFor(artifacts, name, implementation) {
  const artifact = await artifacts.readArtifact(name);
  const build = await artifacts.getBuildInfo(`${artifact.sourceName}:${artifact.contractName}`);
  if (!build) throw new Error("Missing compiler build info; compile the reviewed source first");
  const output = build.output.contracts[artifact.sourceName][artifact.contractName];
  const references = output.evm.deployedBytecode.immutableReferences;
  // Both reviewed implementations inherit precisely one immutable: UUPS __self.
  if (Object.keys(references).length !== 1) throw new Error("Unexpected implementation immutables");
  let code = artifact.deployedBytecode;
  for (const { start, length } of Object.values(references).flat()) {
    if (length !== 32) throw new Error("Unexpected UUPS immutable size");
    const value = implementation.slice(2).toLowerCase().padStart(length * 2, "0");
    const offset = 2 + start * 2;
    code = code.slice(0, offset) + value + code.slice(offset + length * 2);
  }
  return code;
}

async function checkUpgrade(hre, { proxy, expectedImplementation, timelock, chainId, candidate }) {
  const { ethers, upgrades, artifacts } = hre;
  for (const [name, value] of Object.entries({ proxy, expectedImplementation, timelock, ...(candidate ? { candidate } : {}) })) {
    if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`Invalid ${name} address`);
  }
  if ((await ethers.provider.getNetwork()).chainId !== BigInt(chainId)) throw new Error("Wrong chain");
  const actual = await upgrades.erc1967.getImplementationAddress(proxy);
  if (actual.toLowerCase() !== expectedImplementation.toLowerCase()) throw new Error("Current implementation differs from reviewed address");
  const baselineCode = await deployedCodeFor(artifacts, "AnnualGovernanceV1", actual);
  if (executableBytecode(await ethers.provider.getCode(actual)) !== executableBytecode(baselineCode)) {
    throw new Error("Current implementation does not match the frozen V1 executable bytecode; review its source and storage before proceeding");
  }
  const governance = await ethers.getContractAt("AnnualGovernance", proxy);
  if ((await governance.owner()).toLowerCase() !== timelock.toLowerCase()) throw new Error("Proxy owner is not the expected Timelock");
  if (await ethers.provider.getCode(timelock) === "0x") throw new Error("Timelock has no contract code");
  const cycleId = await governance.currentCycleId();
  const state = await governance.getCycleState(cycleId);
  if (![0n, 5n, 6n].includes(state)) throw new Error("Active governance cycle: upgrade is forbidden");
  const V1 = await ethers.getContractFactory("AnnualGovernanceV1");
  const V2 = await ethers.getContractFactory("AnnualGovernance");
  await upgrades.validateUpgrade(V1, V2, { kind: "uups" });
  if (candidate) {
    const candidateCode = await deployedCodeFor(artifacts, "AnnualGovernance", candidate);
    if ((await ethers.provider.getCode(candidate)).toLowerCase() !== candidateCode.toLowerCase()) {
      throw new Error("Candidate bytecode does not match the reviewed AnnualGovernance build");
    }
  }
  return { cycleId, state, implementation: actual };
}

module.exports = { checkUpgrade, executableBytecode };
