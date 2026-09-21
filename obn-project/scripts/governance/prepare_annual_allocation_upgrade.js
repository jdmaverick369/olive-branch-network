"use strict";

// Run via hardhat --network base. ACTION=check (default), deploy, schedule, or execute.
// Only deploy sends a transaction (implementation deployment). schedule/execute
// generate unsigned Safe JSON; neither broadcasts an upgrade or submits to Safe.
const hre = require("hardhat");
const addrs = require("./addresses");
const { checkUpgrade } = require("./annual_allocation_upgrade_checks");
const { scheduleOne, executeOne } = require("./timelock_safe_helper");

async function main() {
  const action = process.env.ACTION || "check";
  if (!["check", "deploy", "schedule", "execute"].includes(action)) throw new Error("Invalid ACTION");
  const proxy = process.env.ANNUAL_GOV_PROXY;
  const expectedImplementation = process.env.ANNUAL_GOV_EXPECTED_IMPL;
  const candidate = process.env.ANNUAL_GOV_ALLOCATION_IMPL;
  if (["schedule", "execute"].includes(action) && !candidate) throw new Error("ANNUAL_GOV_ALLOCATION_IMPL is required");
  const result = await checkUpgrade(hre, {
    proxy, expectedImplementation, timelock: addrs.TIMELOCK, chainId: addrs.CHAIN_ID,
    candidate: action === "deploy" ? undefined : candidate,
  });
  console.log(`Validated proxy ${proxy}, V1 implementation ${result.implementation}, cycle ${result.cycleId}, state ${result.state}`);
  if (action === "check") return;
  if (action === "deploy") {
    const implementation = await (await hre.ethers.getContractFactory("AnnualGovernance")).deploy();
    console.log(`Implementation deployment transaction: ${implementation.deploymentTransaction().hash}`);
    await implementation.waitForDeployment();
    console.log(`ANNUAL_GOV_ALLOCATION_IMPL=${implementation.target}`);
    console.log("Only the implementation was deployed. The proxy has not been upgraded.");
    return;
  }
  const timelock = await hre.ethers.getContractAt(["function getMinDelay() view returns (uint256)"], addrs.TIMELOCK);
  if (BigInt(addrs.TIMELOCK_DELAY) < await timelock.getMinDelay()) throw new Error("Configured delay is below the Timelock minimum");
  const calldata = new hre.ethers.Interface(["function upgradeToAndCall(address,bytes)"])
    .encodeFunctionData("upgradeToAndCall", [candidate, "0x"]);
  const args = { target: proxy, calldata, label: "annual-fixed-allocation" };
  if (action === "schedule") scheduleOne(args);
  else executeOne(args);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
