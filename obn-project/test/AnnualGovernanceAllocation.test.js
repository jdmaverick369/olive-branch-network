const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { checkUpgrade } = require("../scripts/governance/annual_allocation_upgrade_checks");

const DAY = 86400n;
const amount = ethers.parseEther;

// Real token, staking rewards, and both real vaults: mocks that only record calls
// cannot establish that GIVE arrives before the snapshot or that funds remain.
async function buildFixture(governanceName = "AnnualGovernance", stakingName = "contracts/StakingPoolsV93.sol:OBNStakingPools") {
  const [owner, admin, voter, nonprofit, stranger] = await ethers.getSigners();
  const token = await upgrades.deployProxy(await ethers.getContractFactory("OBNToken"), [
    owner.address, amount("1000000000"), ...Array(5).fill(owner.address),
  ], { kind: "uups" });
  const extend = await (await ethers.getContractFactory("ExtendOliveBranch")).deploy(token.target, owner.address);
  const offering = await (await ethers.getContractFactory("TheOffering")).deploy(token.target, extend.target, owner.address);
  const pools = await upgrades.deployProxy(await ethers.getContractFactory(stakingName), [
    token.target, offering.target, extend.target,
  ], { kind: "uups" });
  await token.setMinterOnce(pools.target);
  await pools.migrateV93(offering.target, extend.target, owner.address);
  await pools.addPool(nonprofit.address);
  await token.approve(pools.target, ethers.MaxUint256);
  await pools.charityFundBootstrap(0, amount("1000000"), nonprofit.address);
  await token.transfer(voter.address, amount("10000"));
  await token.connect(voter).approve(pools.target, ethers.MaxUint256);
  await pools.connect(voter).deposit(0, amount("10000"));
  const governance = await upgrades.deployProxy(await ethers.getContractFactory(governanceName), [
    token.target, pools.target, offering.target, extend.target, owner.address, admin.address, 50,
  ], { kind: "uups" });
  await offering.setGovernance(governance.target);
  await extend.setGovernance(governance.target);
  await extend.setApprovedNonprofit(nonprofit.address, true);
  // Bootstrap/deposit can already generate emissions. Isolate initial test balances.
  for (const vault of [offering, extend]) {
    if (await token.balanceOf(vault.target)) await vault.emergencySweep(token.target, owner.address);
  }
  return { owner, admin, voter, nonprofit, stranger, token, extend, offering, pools, governance };
}
async function fixture() { return buildFixture(); }
async function legacyFixture() { return buildFixture("AnnualGovernanceV1"); }
async function v94Fixture() { return buildFixture("AnnualGovernance", "OBNStakingPoolsV94"); }
async function start(f, give = false) {
  await f.governance.connect(f.admin).startAnnualCycle(DAY, DAY);
  const id = await f.governance.currentCycleId();
  await f.governance.connect(f.voter).castOfferingVote(id, !give);
  return id;
}
async function phase1(f, id = 1n) {
  await time.increaseTo((await f.governance.getCycleSummary(id)).phase1End);
  return f.governance.connect(f.stranger).executePhase1(id);
}
async function vote2(f, id = 1n) {
  await f.governance.connect(f.voter).castNonprofitVote(id, f.nonprofit.address);
}
async function phase2(f, id = 1n) {
  await time.increaseTo((await f.governance.getCycleSummary(id)).phase2End);
  return f.governance.connect(f.stranger).executePhase2(id);
}

describe("AnnualGovernance fixed Phase 2 allocation", function () {
  for (const give of [false, true]) {
    it(`${give ? "GIVE" : "BURN"}: fixes both funds at Phase 1 execution and carries later receipts into the next cycle`, async function () {
      const f = await loadFixture(fixture);
      const { token, offering, extend, governance, nonprofit } = f;
      await token.transfer(extend.target, amount("100"));
      await token.transfer(offering.target, amount("50"));
      await start(f, give);
      // Receipts during Phase 1 voting still belong to this cycle.
      await token.transfer(extend.target, amount("10"));
      await token.transfer(offering.target, amount("5"));
      const fixed = amount(give ? "165" : "110");
      await expect(phase1(f)).to.emit(governance, "Phase2AllocationFixed").withArgs(1n, fixed);
      expect(await governance.getPhase2Allocation(1)).to.deep.equal([fixed, true]);
      expect(await token.balanceOf(offering.target)).to.equal(0n);
      await token.transfer(extend.target, amount("20"));
      await token.transfer(offering.target, amount("7"));
      await vote2(f);
      const before = await token.balanceOf(nonprofit.address);
      await expect(phase2(f)).to.emit(governance, "Phase2Executed").withArgs(1n, nonprofit.address, fixed);
      expect(await token.balanceOf(nonprofit.address)).to.equal(before + fixed);
      expect(await token.balanceOf(extend.target)).to.equal(amount("20"));
      expect(await token.balanceOf(offering.target)).to.equal(amount("7"));
      expect(await governance.getPhase2Allocation(1)).to.deep.equal([fixed, true]);
      // The carried amounts are actually distributable next cycle, exactly once.
      await start(f, true);
      await phase1(f, 2n);
      expect(await governance.getPhase2Allocation(2)).to.deep.equal([amount("27"), true]);
      await vote2(f, 2n);
      await phase2(f, 2n);
      expect(await token.balanceOf(extend.target)).to.equal(0n);
      expect(await token.balanceOf(nonprofit.address)).to.equal(before + fixed + amount("27"));
      await expect(governance.executePhase1(1)).to.be.revertedWith("not ready for phase1 execution");
      await expect(governance.executePhase2(1)).to.be.revertedWith("not ready for phase2 execution");
    });
  }

  // v9.4 is a separate, unreleased change set. Default release tests must use
  // only committed dependencies. Explicitly opt in to the extra integration run.
  const claimFixtures = [["v9.3", fixture]];
  if (process.env.TEST_GOVERNANCE_V94 === "true") claimFixtures.push(["v9.4", v94Fixture]);
  for (const [version, setup] of claimFixtures) {
    it(`${version}: real claims keep minting both 1% shares, but Phase 2 pays only the fixed allocation`, async function () {
      const f = await loadFixture(setup);
      await start(f, true);
      await time.increase(DAY / 2n);
      const userBefore = await f.token.balanceOf(f.voter.address);
      await f.pools.connect(f.voter).claim(0);
      expect(await f.token.balanceOf(f.voter.address)).to.be.greaterThan(userBefore);
      const firstOffering = await f.token.balanceOf(f.offering.target);
      const firstExtend = await f.token.balanceOf(f.extend.target);
      expect(firstOffering).to.be.greaterThan(0n);
      expect(firstExtend).to.equal(firstOffering);
      await phase1(f);
      const fixed = firstOffering + firstExtend;
      expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([fixed, true]);
      await time.increase(DAY / 2n);
      await f.pools.connect(f.voter).claim(0);
      const carriedOffering = await f.token.balanceOf(f.offering.target);
      const carriedExtend = (await f.token.balanceOf(f.extend.target)) - fixed;
      expect(carriedOffering).to.be.greaterThan(0n);
      expect(carriedExtend).to.equal(carriedOffering);
      await vote2(f);
      await expect(phase2(f)).to.emit(f.governance, "Phase2Executed").withArgs(1n, f.nonprofit.address, fixed);
      expect(await f.token.balanceOf(f.extend.target)).to.equal(carriedExtend);
      expect(await f.token.balanceOf(f.offering.target)).to.equal(carriedOffering);
    });
  }

  it("includes receipts after Phase 1 voting closes but excludes receipts even after Phase 2 voting closes", async function () {
    const f = await loadFixture(fixture);
    await start(f, true);
    await time.increaseTo((await f.governance.getCycleSummary(1)).phase1End + DAY);
    await f.token.transfer(f.extend.target, amount("100"));
    await f.token.transfer(f.offering.target, amount("50"));
    await f.governance.executeCurrentCycle();
    expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([amount("150"), true]);
    await vote2(f);
    await time.increaseTo((await f.governance.getCycleSummary(1)).phase2End + DAY);
    await f.token.transfer(f.extend.target, amount("20"));
    await expect(f.governance.executeCurrentCycle()).to.emit(f.governance, "Phase2Executed")
      .withArgs(1n, f.nonprofit.address, amount("150"));
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("20"));
  });

  it("treats zero as a fixed allocation and leaves all later receipts untouched", async function () {
    const f = await loadFixture(fixture);
    expect(await f.governance.getPhase2Allocation(0)).to.deep.equal([0n, false]);
    expect(await f.governance.getPhase2Allocation(999)).to.deep.equal([0n, false]);
    await start(f, true);
    expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([0n, false]);
    await phase1(f);
    expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([0n, true]);
    await f.token.transfer(f.extend.target, amount("20"));
    await vote2(f);
    await expect(phase2(f)).to.emit(f.governance, "Phase2Executed").withArgs(1n, f.nonprofit.address, 0n);
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("20"));
  });

  it("rolls the fixed allocation and later receipts into the next cycle with no Phase 2 votes", async function () {
    const f = await loadFixture(fixture);
    await f.token.transfer(f.extend.target, amount("100"));
    await f.token.transfer(f.offering.target, amount("50"));
    await start(f, true);
    await phase1(f);
    await f.token.transfer(f.extend.target, amount("20"));
    await expect(phase2(f)).to.emit(f.governance, "Phase2RolledOver").withArgs(1n);
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("170"));
    await start(f);
    await phase1(f, 2n);
    expect(await f.governance.getPhase2Allocation(2)).to.deep.equal([amount("170"), true]);
    await vote2(f, 2n);
    await phase2(f, 2n);
    expect(await f.token.balanceOf(f.extend.target)).to.equal(0n);
  });

  it("keeps cancelled-cycle funds available and does not create a snapshot on cancellation", async function () {
    const f = await loadFixture(fixture);
    await f.token.transfer(f.extend.target, amount("100"));
    await start(f);
    await f.governance.cancelCycle(1);
    expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([0n, false]);
    await start(f);
    await phase1(f, 2n);
    expect(await f.governance.getPhase2Allocation(2)).to.deep.equal([amount("100"), true]);
  });

  for (const withdraw of ["distribute", "emergencySweep"]) {
    it(`reverts atomically after an admin ${withdraw} causes a shortfall, and succeeds after replenishment`, async function () {
      const f = await loadFixture(fixture);
      await f.token.transfer(f.extend.target, amount("100"));
      await start(f);
      await phase1(f);
      await vote2(f);
      if (withdraw === "distribute") await f.extend.distribute(f.nonprofit.address, amount("40"));
      else await f.extend.emergencySweep(f.token.target, f.owner.address);
      const remaining = await f.token.balanceOf(f.extend.target);
      await time.increaseTo((await f.governance.getCycleSummary(1)).phase2End);
      await expect(f.governance.executePhase2(1)).to.be.revertedWith("phase2 allocation underfunded");
      expect((await f.governance.getCycleSummary(1)).phase2Executed).to.equal(false);
      expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([amount("100"), true]);
      expect(await f.token.balanceOf(f.extend.target)).to.equal(remaining);
      await f.token.transfer(f.extend.target, amount("100") - remaining + amount("7"));
      await expect(f.governance.executePhase2(1)).to.emit(f.governance, "Phase2Executed")
        .withArgs(1n, f.nonprofit.address, amount("100"));
      expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("7"));
    });
  }

  it("rolls back Phase 1 on a failed GIVE and snapshots only the successful retry", async function () {
    const f = await loadFixture(fixture);
    await f.token.transfer(f.offering.target, amount("50"));
    await start(f, true);
    await f.offering.setGovernance(f.stranger.address);
    await expect(phase1(f)).to.be.revertedWith("not governance");
    expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([0n, false]);
    expect((await f.governance.getCycleSummary(1)).phase1Executed).to.equal(false);
    expect(await f.token.balanceOf(f.offering.target)).to.equal(amount("50"));
    await f.token.transfer(f.extend.target, amount("10"));
    await f.offering.setGovernance(f.governance.target);
    await f.governance.executePhase1(1);
    expect(await f.governance.getPhase2Allocation(1)).to.deep.equal([amount("60"), true]);
  });

  it("rolls back Phase 2 on a vault failure without changing the allocation", async function () {
    const f = await loadFixture(fixture);
    await f.token.transfer(f.extend.target, amount("100"));
    await start(f);
    await phase1(f);
    await vote2(f);
    await f.extend.setGovernance(f.stranger.address);
    await expect(phase2(f)).to.be.revertedWith("not governance");
    expect((await f.governance.getCycleSummary(1)).phase2Executed).to.equal(false);
    await f.token.transfer(f.extend.target, amount("20"));
    await f.extend.setGovernance(f.governance.target);
    await f.governance.executePhase2(1);
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("20"));
  });

  it("retains ballot authority when the winner's approval is revoked after the snapshot", async function () {
    const f = await loadFixture(fixture);
    await f.token.transfer(f.extend.target, amount("100"));
    await start(f);
    await phase1(f);
    await vote2(f);
    await f.extend.setApprovedNonprofit(f.nonprofit.address, false);
    await expect(phase2(f)).to.emit(f.extend, "Distributed").withArgs(f.nonprofit.address, amount("100"));
  });
});

describe("AnnualGovernance allocation upgrade compatibility", function () {
  it("preflights and executes the exact upgradeToAndCall payload through the real Timelock", async function () {
    const f = await loadFixture(legacyFixture);
    const timelock = await (await ethers.getContractFactory("OBNTimeLock")).deploy(
      DAY, [f.owner.address], [f.owner.address], f.owner.address,
    );
    await f.governance.transferOwnership(timelock.target);
    const candidate = await (await ethers.getContractFactory("AnnualGovernance")).deploy();
    const expectedImplementation = await upgrades.erc1967.getImplementationAddress(f.governance.target);
    const options = {
      proxy: f.governance.target, expectedImplementation, timelock: timelock.target,
      candidate: candidate.target, chainId: 31337,
    };
    const hre = require("hardhat");
    await checkUpgrade(hre, options);
    await expect(checkUpgrade(hre, { ...options, chainId: 8453 })).to.be.rejectedWith("Wrong chain");
    await expect(checkUpgrade(hre, { ...options, expectedImplementation: candidate.target }))
      .to.be.rejectedWith("Current implementation differs from reviewed address");
    await expect(checkUpgrade(hre, { ...options, candidate: expectedImplementation }))
      .to.be.rejectedWith("Candidate bytecode does not match");
    await expect(checkUpgrade(hre, { ...options, timelock: f.stranger.address }))
      .to.be.rejectedWith("Proxy owner is not the expected Timelock");
    const data = candidate.interface.encodeFunctionData("upgradeToAndCall", [candidate.target, "0x"]);
    const salt = ethers.id("annual-allocation-upgrade-test");
    const batch = [[f.governance.target], [0n], [data], ethers.ZeroHash, salt];
    await timelock.scheduleBatch(...batch, DAY);
    await expect(timelock.executeBatch(...batch)).to.be.reverted;
    await time.increase(DAY);
    await timelock.executeBatch(...batch);
    expect(await upgrades.erc1967.getImplementationAddress(f.governance.target)).to.equal(candidate.target);
    const upgraded = await ethers.getContractAt("AnnualGovernance", f.governance.target);
    expect(await upgraded.owner()).to.equal(timelock.target);
    expect(await upgraded.getPhase2Allocation(1)).to.deep.equal([0n, false]);
    await expect(checkUpgrade(hre, { ...options, expectedImplementation: candidate.target }))
      .to.be.rejectedWith("Current implementation does not match the frozen V1");
    f.governance = upgraded;
    await f.token.transfer(f.extend.target, amount("100"));
    await start(f);
    await phase1(f);
    await vote2(f);
    await f.token.transfer(f.extend.target, amount("20"));
    await phase2(f);
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("20"));
  });

  it("passes OpenZeppelin storage and implementation validation against the frozen V1", async function () {
    await upgrades.validateUpgrade(
      await ethers.getContractFactory("AnnualGovernanceV1"),
      await ethers.getContractFactory("AnnualGovernance"),
      { kind: "uups" },
    );
  });

  for (const state of ["INACTIVE", "COMPLETED", "CANCELLED"]) {
    it(`upgrades V1 in ${state}, preserves stored history, and fixes allocations in the next cycle`, async function () {
      const f = await loadFixture(legacyFixture);
      if (state !== "INACTIVE") {
        await f.token.transfer(f.extend.target, amount("100"));
        await start(f, true);
        if (state === "CANCELLED") await f.governance.cancelCycle(1);
        else { await phase1(f); await vote2(f); await phase2(f); }
      }
      const id = await f.governance.currentCycleId();
      const summary = await f.governance.getCycleSummary(id);
      const ballot = await f.governance.getBallot(id);
      const votes = await f.governance.getNonprofitVotes(id, f.nonprofit.address);
      const upgraded = await upgrades.upgradeProxy(f.governance.target, await ethers.getContractFactory("AnnualGovernance"));
      expect(await upgraded.currentCycleId()).to.equal(id);
      expect(await upgraded.owner()).to.equal(f.owner.address);
      expect(await upgraded.voteAdmin()).to.equal(f.admin.address);
      expect(await upgraded.maxBallotSize()).to.equal(50n);
      expect(await upgraded.obn()).to.equal(f.token.target);
      expect(await upgraded.stakingPools()).to.equal(f.pools.target);
      expect(await upgraded.theOffering()).to.equal(f.offering.target);
      expect(await upgraded.extendOliveBranch()).to.equal(f.extend.target);
      expect(await upgraded.getCycleSummary(id)).to.deep.equal(summary);
      expect(await upgraded.getBallot(id)).to.deep.equal(ballot);
      expect(await upgraded.getNonprofitVotes(id, f.nonprofit.address)).to.equal(votes);
      expect(await upgraded.hasVotedPhase1(id, f.voter.address)).to.equal(state !== "INACTIVE");
      expect(await upgraded.hasVotedPhase2(id, f.voter.address)).to.equal(state === "COMPLETED");
      expect(await upgraded.getPhase2Allocation(id)).to.deep.equal([0n, false]);
      f.governance = upgraded;
      const nextId = await start(f, true);
      const fixed = (await f.token.balanceOf(f.extend.target)) + (await f.token.balanceOf(f.offering.target));
      await phase1(f, nextId);
      expect(await upgraded.getPhase2Allocation(nextId)).to.deep.equal([fixed, true]);
      await f.token.transfer(f.extend.target, amount("7"));
      await vote2(f, nextId);
      await phase2(f, nextId);
      expect(await f.token.balanceOf(f.extend.target)).to.equal(amount("7"));
    });
  }

  for (const setup of [legacyFixture, fixture]) {
    for (const state of ["PHASE1_OPEN", "PHASE1_READY", "PHASE2_OPEN", "PHASE2_READY"]) {
      it(`${setup.name}: blocks upgrades in ${state}`, async function () {
        const f = await loadFixture(setup);
        const implementation = await (await ethers.getContractFactory("AnnualGovernance")).deploy();
        await start(f);
        if (state === "PHASE1_READY") await time.increaseTo((await f.governance.getCycleSummary(1)).phase1End);
        if (state.startsWith("PHASE2")) await phase1(f);
        if (state === "PHASE2_READY") await time.increaseTo((await f.governance.getCycleSummary(1)).phase2End);
        await expect(f.governance.upgradeToAndCall(implementation.target, "0x"))
          .to.be.revertedWith("upgrade: cycle in progress");
      });
    }
  }

  it("rejects unauthorized upgrades and keeps the implementation initializer locked", async function () {
    const f = await loadFixture(fixture);
    const implementation = await (await ethers.getContractFactory("AnnualGovernance")).deploy();
    await expect(f.governance.connect(f.stranger).upgradeToAndCall(implementation.target, "0x"))
      .to.be.revertedWithCustomError(f.governance, "OwnableUnauthorizedAccount");
    const args = [f.token.target, f.pools.target, f.offering.target, f.extend.target, f.owner.address, f.admin.address, 50];
    await expect(implementation.initialize(...args)).to.be.revertedWithCustomError(implementation, "InvalidInitialization");
    await expect(f.governance.initialize(...args)).to.be.revertedWithCustomError(f.governance, "InvalidInitialization");
  });
});
