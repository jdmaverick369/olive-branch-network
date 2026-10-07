const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, mine, time } = require("@nomicfoundation/hardhat-network-helpers");
const { ABI, STATE, nextAction, readCycle, executeCycle, formatResult } = require("../scripts/governance/execute_cycle.js");

const DAY = 86400;
// Cycle start prepares 100 pools (MAX_INDEX_BATCH); 201 leaves two batches for the script.
const POOL_COUNT = 201;

// Mirrors the production path: legacy AnnualGovernance proxy upgraded to V2 with NFT voting.
async function fixture() {
  const [owner, admin, alice, keeper] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory("OliveNFT")).deploy("Olive", "OLIVE", "");
  const vault = await upgrades.deployProxy(await ethers.getContractFactory("OliveAssembly"), [nft.target, owner.address], { kind: "uups" });
  await nft.ownerMint(alice.address, 1);
  await nft.connect(alice).setApprovalForAll(vault.target, true);
  const token = await upgrades.deployProxy(await ethers.getContractFactory("OBNToken"), [
    owner.address, ethers.parseEther("1000000000"), ...Array(5).fill(owner.address),
  ], { kind: "uups" });
  const extend = await (await ethers.getContractFactory("ExtendOliveBranch")).deploy(token.target, owner.address);
  const offering = await (await ethers.getContractFactory("TheOffering")).deploy(token.target, extend.target, owner.address);
  const pools = await upgrades.deployProxy(await ethers.getContractFactory("contracts/StakingPoolsV93.sol:OBNStakingPools"), [
    token.target, offering.target, extend.target,
  ], { kind: "uups" });
  await token.setMinterOnce(pools.target);
  await pools.migrateV93(offering.target, extend.target, owner.address);
  for (let i = 0; i < POOL_COUNT; i++) {
    const wallet = ethers.Wallet.createRandom().address;
    await pools.addPool(wallet);
    await extend.setApprovedNonprofit(wallet, true);
  }
  const legacy = await upgrades.deployProxy(await ethers.getContractFactory("AnnualGovernance"), [
    token.target, pools.target, offering.target, extend.target, owner.address, admin.address, 50,
  ], { kind: "uups" });
  await offering.setGovernance(legacy.target);
  await extend.setGovernance(legacy.target);
  const gov = await upgrades.upgradeProxy(legacy.target, await ethers.getContractFactory("AnnualGovernanceV2"), {
    kind: "uups", call: { fn: "initializeNFTVoting", args: [vault.target] },
  });
  await vault.bindGovernance(gov.target);
  await vault.connect(alice).deposit(1);
  await mine();
  // The script's own ABI, signed by an account with no governance role.
  const script = new ethers.Contract(gov.target, ABI, keeper);
  return { admin, gov, script };
}

async function startCycle({ gov, admin }) {
  await gov.connect(admin).startAnnualCycle(30 * DAY, 30 * DAY);
}

describe("execute_cycle.js (AnnualGovernanceV2)", function () {
  it("maps every state to the step executeCurrentCycle() takes", function () {
    for (const complete of [true, false]) {
      expect(nextAction(STATE.INACTIVE, complete)).to.equal(null);
      expect(nextAction(STATE.PHASE1_OPEN, complete)).to.equal(complete ? null : "prepare-ballot");
      expect(nextAction(STATE.PHASE1_READY, complete)).to.equal(complete ? "execute-phase1" : "prepare-ballot");
      expect(nextAction(STATE.PHASE2_OPEN, complete)).to.equal(null);
      expect(nextAction(STATE.PHASE2_READY, complete)).to.equal("execute-phase2");
      expect(nextAction(STATE.COMPLETED, complete)).to.equal(null);
      expect(nextAction(STATE.CANCELLED, complete)).to.equal(null);
    }
  });

  it("does nothing when no cycle is running", async function () {
    const { script } = await loadFixture(fixture);
    const result = await executeCycle(script);
    expect(result).to.include({ state: STATE.INACTIVE, action: null, submitted: false });
    expect(formatResult(result)).to.contain("Nothing to execute.");
  });

  it("finishes ballot preparation during Phase 1, then settles both phases", async function () {
    const f = await loadFixture(fixture);
    await startCycle(f);

    let cycle = await readCycle(f.script);
    expect(cycle).to.include({ state: STATE.PHASE1_OPEN, action: "prepare-ballot" });
    expect(cycle.preparation).to.include({ cursor: 100n, poolCount: BigInt(POOL_COUNT), complete: false });
    expect(formatResult({ ...cycle, submitted: false })).to.contain("100/201 pools scanned");

    const dryRun = await executeCycle(f.script, { dryRun: true });
    expect(dryRun).to.include({ action: "prepare-ballot", submitted: false });
    expect((await readCycle(f.script)).preparation.cursor).to.equal(100n);

    expect(await executeCycle(f.script)).to.include({ action: "prepare-ballot", submitted: true });
    expect((await readCycle(f.script)).preparation.cursor).to.equal(200n);
    expect(await executeCycle(f.script)).to.include({ action: "prepare-ballot", submitted: true });
    cycle = await readCycle(f.script);
    expect(cycle.preparation).to.include({ cursor: BigInt(POOL_COUNT), complete: true, ballotSize: BigInt(POOL_COUNT) });
    expect(cycle.action).to.equal(null);
    expect(await executeCycle(f.script)).to.include({ action: null, submitted: false });

    await time.increase(30 * DAY);
    expect(await executeCycle(f.script)).to.include({ state: STATE.PHASE1_READY, action: "execute-phase1", submitted: true });
    expect((await readCycle(f.script)).state).to.equal(STATE.PHASE2_OPEN);

    await time.increase(30 * DAY);
    expect(await executeCycle(f.script)).to.include({ state: STATE.PHASE2_READY, action: "execute-phase2", submitted: true });
    expect(await readCycle(f.script)).to.include({ state: STATE.COMPLETED, action: null });
  });

  it("prepares the ballot before settling when Phase 1 ends unprepared", async function () {
    const f = await loadFixture(fixture);
    await startCycle(f);
    await time.increase(30 * DAY);
    const id = await f.gov.currentCycleId();
    // A READY-only keeper would call this and revert.
    await expect(f.gov.executePhase1(id)).to.be.revertedWith("ballot preparation incomplete");

    expect(await executeCycle(f.script)).to.include({ state: STATE.PHASE1_READY, action: "prepare-ballot", submitted: true });
    expect(await executeCycle(f.script)).to.include({ state: STATE.PHASE1_READY, action: "prepare-ballot", submitted: true });
    expect(await executeCycle(f.script)).to.include({ state: STATE.PHASE1_READY, action: "execute-phase1", submitted: true });
    expect((await readCycle(f.script)).state).to.equal(STATE.PHASE2_OPEN);
  });

  it("sends nothing when another caller advanced the cycle first", async function () {
    let sent = 0;
    const executeCurrentCycle = async () => { sent++; };
    executeCurrentCycle.staticCall = async () => { throw Object.assign(new Error("reverted"), { reason: "cycle not ready for execution" }); };
    const gov = { currentCycleId: async () => 1n, getCycleState: async () => BigInt(STATE.PHASE2_READY), executeCurrentCycle };
    expect(await executeCycle(gov)).to.include({ action: null, submitted: false });
    expect(sent).to.equal(0);
  });

  it("rejects unknown states without sending", async function () {
    let sent = 0;
    const gov = { currentCycleId: async () => 1n, getCycleState: async () => 7n, executeCurrentCycle: async () => { sent++; } };
    await expect(executeCycle(gov)).to.be.rejectedWith("Unknown governance state 7");
    expect(sent).to.equal(0);
  });
});
