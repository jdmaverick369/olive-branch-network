// V93GovernanceIntegration.test.js
//
// End-to-end integration tests connecting StakingPoolsV93, AnnualGovernance,
// TheOffering, ExtendOliveBranch, and OBNStakingLens against real OBNToken.
//
// Single fixture: fullFixture
//   staker1    : 1,000 OBN in pool 0 (nonprofit1)   — bootstrapped, voting power 1,000
//   staker2    : 2,000 OBN in pool 1 (nonprofit2)   — bootstrapped, voting power 2,000
//   staker3    : 1,000 OBN in pool 2 (nonprofit3)   — bootstrapped, voting power 1,000
//   unbootstrapped : 500 OBN in pool 2 (nonprofit3)  — NOT bootstrapped, voting power 0
//
// Only staker1, staker2, staker3 are passed to batchBootstrap.
// unbootstrapped is used specifically for lazy-bootstrap tests (item 2).

const { expect }    = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24n * 3600n;
const P1  = 30n * DAY;   // phase1Duration for all test cycles
const P2  = 30n * DAY;   // phase2Duration for all test cycles

const CS = {
  INACTIVE: 0n, PHASE1_OPEN: 1n, PHASE1_READY: 2n,
  PHASE2_OPEN: 3n, PHASE2_READY: 4n, COMPLETED: 5n, CANCELLED: 6n,
};

// ─── Fixture ──────────────────────────────────────────────────────────────────

async function fullFixture() {
  const [owner, timelockOwner, voteAdmin,
         staker1, staker2, staker3,
         nonprofit1, nonprofit2, nonprofit3,
         treasury, charityFund, charityFundOperator,
         extraPool, unbootstrapped] = await ethers.getSigners();

  // ── OBNToken (owner as minter for test token distribution) ──────────────────
  const OBNToken = await ethers.getContractFactory("OBNToken");
  const token = await upgrades.deployProxy(OBNToken, [
    owner.address, ethers.parseEther("1000000000"),
    owner.address, owner.address, owner.address, owner.address, owner.address,
  ], { kind: "uups" });
  await token.waitForDeployment();
  await token.setMinterOnce(owner.address);

  // ── StakingPoolsV93 ─────────────────────────────────────────────────────────
  const PoolsF = await ethers.getContractFactory("contracts/StakingPoolsV93.sol:OBNStakingPools");
  const proxy  = await upgrades.deployProxy(PoolsF, [
    await token.getAddress(), treasury.address, charityFund.address,
  ], { kind: "uups" });
  await proxy.waitForDeployment();
  const proxyAddr = await proxy.getAddress();

  // Three pools with distinct charity wallets
  await proxy.addPool(nonprofit1.address); // pid 0
  await proxy.addPool(nonprofit2.address); // pid 1
  await proxy.addPool(nonprofit3.address); // pid 2

  // ── Token distribution ──────────────────────────────────────────────────────
  const S1  = ethers.parseEther("1000");
  const S2  = ethers.parseEther("2000");
  const S3  = ethers.parseEther("1000");
  const S_UB = ethers.parseEther("500");  // unbootstrapped stake

  for (const [signer, amount] of [
    [staker1, ethers.parseEther("10000")],
    [staker2, ethers.parseEther("10000")],
    [staker3, ethers.parseEther("10000")],
    [unbootstrapped, ethers.parseEther("5000")],
  ]) {
    await token.mint(signer.address, amount);
    await token.connect(signer).approve(proxyAddr, ethers.MaxUint256);
  }

  // ── Pre-upgrade deposits (first deposits — d.pending == 0, no minting needed)
  await proxy.connect(staker1).deposit(0, S1);
  await proxy.connect(staker2).deposit(1, S2);
  await proxy.connect(staker3).deposit(2, S3);
  // unbootstrapped deposits BEFORE migrateV93 — upgradeBlock is 0 at this point,
  // so _initializeCheckpointIfNeeded is a no-op.
  await proxy.connect(unbootstrapped).deposit(2, S_UB);

  // ── Simulate v9.3 upgrade ───────────────────────────────────────────────────
  await proxy.migrateV93(treasury.address, charityFund.address, charityFundOperator.address);

  // Bootstrap staker1, staker2, staker3 — intentionally exclude unbootstrapped
  await proxy.batchBootstrap([staker1.address, staker2.address, staker3.address]);

  // ── Governance contracts ────────────────────────────────────────────────────
  const EOBFactory = await ethers.getContractFactory("ExtendOliveBranch");
  const extendOB   = await EOBFactory.deploy(await token.getAddress(), timelockOwner.address);

  const TOFactory = await ethers.getContractFactory("TheOffering");
  const offering  = await TOFactory.deploy(
    await token.getAddress(), await extendOB.getAddress(), timelockOwner.address
  );

  const AGFactory  = await ethers.getContractFactory("AnnualGovernance");
  const governance = await upgrades.deployProxy(AGFactory, [
    await token.getAddress(), proxyAddr,
    await offering.getAddress(), await extendOB.getAddress(),
    timelockOwner.address, voteAdmin.address, 50,
  ], { kind: "uups" });
  await governance.waitForDeployment();

  // Wire governance into both vaults
  const govAddr = await governance.getAddress();
  await offering.connect(timelockOwner).setGovernance(govAddr);
  await extendOB.connect(timelockOwner).setGovernance(govAddr);

  // Approve all 3 nonprofits
  await extendOB.connect(timelockOwner).setApprovedNonprofit(nonprofit1.address, true);
  await extendOB.connect(timelockOwner).setApprovedNonprofit(nonprofit2.address, true);
  await extendOB.connect(timelockOwner).setApprovedNonprofit(nonprofit3.address, true);

  // ── OBNStakingLens as UUPS proxy ─────────────────────────────────────────────
  const LensF = await ethers.getContractFactory("OBNStakingLens");
  const lens  = await upgrades.deployProxy(LensF, [proxyAddr, timelockOwner.address], { kind: "uups" });
  await lens.waitForDeployment();

  return {
    token, proxy, offering, extendOB, governance, lens,
    owner, timelockOwner, voteAdmin,
    staker1, staker2, staker3, unbootstrapped,
    nonprofit1, nonprofit2, nonprofit3,
    treasury, charityFund, charityFundOperator,
    extraPool,
    S1, S2, S3, S_UB,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHelpers(gov, va) {
  const startCycle = () => gov.connect(va).startAnnualCycle(P1, P2);

  const runPhase1 = async (cycleId = 1n) => {
    const s = await gov.getCycleSummary(cycleId);
    await time.increaseTo(Number(s.phase1End) + 1);
    return gov.executePhase1(cycleId);
  };

  const runPhase2 = async (cycleId = 1n) => {
    const s = await gov.getCycleSummary(cycleId);
    await time.increaseTo(Number(s.phase2End) + 1);
    return gov.executePhase2(cycleId);
  };

  return { startCycle, runPhase1, runPhase2 };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("Integration: StakingPoolsV93 + AnnualGovernance", function () {

  // ── 1. Voting power from v9.3 checkpoints ────────────────────────────────────

  describe("1. Voting power from v9.3 checkpoints", function () {
    it("staked amounts reflected in getPastVotingPower after batchBootstrap", async function () {
      const { proxy, staker1, staker2, staker3, S1, S2, S3 } = await loadFixture(fullFixture);

      const upgradeBlock  = await proxy.upgradeBlock();
      const snapshotBlock = upgradeBlock + 1n;

      expect(await proxy.getPastVotingPower(staker1.address, snapshotBlock)).to.equal(S1);
      expect(await proxy.getPastVotingPower(staker2.address, snapshotBlock)).to.equal(S2);
      expect(await proxy.getPastVotingPower(staker3.address, snapshotBlock)).to.equal(S3);
    });

    it("non-staker has zero voting power at any block", async function () {
      const { proxy, timelockOwner } = await loadFixture(fullFixture);
      const upgradeBlock = await proxy.upgradeBlock();
      expect(await proxy.getPastVotingPower(timelockOwner.address, upgradeBlock + 1n)).to.equal(0n);
    });

    it("governance castOfferingVote uses voting power at snapshot block", async function () {
      const { governance, voteAdmin, staker1, staker2, S1, S2 } = await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);
      await startCycle();

      await governance.connect(staker2).castOfferingVote(1, false); // give
      await governance.connect(staker1).castOfferingVote(1, true);  // burn

      const s = await governance.getCycleSummary(1);
      expect(s.giveVotes).to.equal(S2);
      expect(s.burnVotes).to.equal(S1);
    });
  });

  // ── 2. Checkpoint infrastructure ─────────────────────────────────────────────
  //
  // StakingPoolsV93 writes a checkpoint on every _depositCore call (line 679),
  // so in a direct v9.3 deployment all depositing stakers have checkpoints from day 1.
  // The bootstrapCheckpoint / batchBootstrap ceremony exists for the production
  // v9.2 → v9.3 upgrade where the old contract had no checkpoint tracking; those
  // stakers had deposits but zero checkpoint history.
  //
  // These tests verify the v9.3 checkpoint behavior and the upgrade-ceremony
  // functions' handling of the already-initialized case.

  describe("2. Checkpoint infrastructure", function () {
    it("v9.3 deposits write checkpoints immediately — all stakers have count > 0", async function () {
      const { proxy, staker1, staker2, staker3 } = await loadFixture(fullFixture);
      for (const staker of [staker1, staker2, staker3]) {
        expect(await proxy.checkpointCount(staker.address)).to.be.gt(0n);
      }
    });

    it("getPastVotingPower returns 0 at block 1 (before any deposits were made)", async function () {
      const { proxy, staker1, staker2, staker3 } = await loadFixture(fullFixture);
      // Block 1 predates all deposits in the fixture; the checkpoint array for each
      // staker has no entry with key <= 1, so upperLookup returns 0.
      for (const staker of [staker1, staker2, staker3]) {
        expect(await proxy.getPastVotingPower(staker.address, 1n)).to.equal(0n);
      }
    });

    it("getPastVotingPower returns the correct staked balance at and after upgradeBlock", async function () {
      const { proxy, staker1, staker2, staker3, S1, S2, S3 } = await loadFixture(fullFixture);
      const upgradeBlock = await proxy.upgradeBlock();
      // All 3 stakers deposited before migrateV93; their checkpoint key < upgradeBlock.
      // upperLookup(upgradeBlock) finds those earlier checkpoints correctly.
      expect(await proxy.getPastVotingPower(staker1.address, upgradeBlock)).to.equal(S1);
      expect(await proxy.getPastVotingPower(staker2.address, upgradeBlock)).to.equal(S2);
      expect(await proxy.getPastVotingPower(staker3.address, upgradeBlock)).to.equal(S3);
    });

    it("batchBootstrap silently skips already-initialized stakers without reverting", async function () {
      const { proxy, staker1, staker2, staker3 } = await loadFixture(fullFixture);

      const countsBefore = await Promise.all(
        [staker1, staker2, staker3].map(s => proxy.checkpointCount(s.address))
      );

      // All 3 stakers are already initialized; the call must not revert
      await expect(
        proxy.batchBootstrap([staker1.address, staker2.address, staker3.address])
      ).to.not.be.reverted;

      for (const [i, staker] of [staker1, staker2, staker3].entries()) {
        expect(await proxy.checkpointCount(staker.address)).to.equal(countsBefore[i]);
      }
    });

    it("bootstrapCheckpoint reverts for already-initialized stakers", async function () {
      const { proxy, staker1 } = await loadFixture(fullFixture);
      await expect(
        proxy.bootstrapCheckpoint(staker1.address)
      ).to.be.revertedWith("already initialized");
    });
  });

  // ── 3. Active pool ballot generation ─────────────────────────────────────────

  describe("3. Active pool ballot generation", function () {
    it("all 3 active pools appear on the ballot", async function () {
      const { governance, voteAdmin, nonprofit1, nonprofit2, nonprofit3 } =
        await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);
      await startCycle();

      const ballot = await governance.getBallot(1);
      expect(ballot).to.have.length(3);
      expect(ballot).to.include(nonprofit1.address);
      expect(ballot).to.include(nonprofit2.address);
      expect(ballot).to.include(nonprofit3.address);
    });

    it("ballot preserves pool insertion order (lowest pid first)", async function () {
      const { governance, voteAdmin, nonprofit1, nonprofit2, nonprofit3 } =
        await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);
      await startCycle();

      const ballot = await governance.getBallot(1);
      expect(ballot[0]).to.equal(nonprofit1.address);
      expect(ballot[1]).to.equal(nonprofit2.address);
      expect(ballot[2]).to.equal(nonprofit3.address);
    });
  });

  // ── 4. poolFullyRemoved exclusion from ballot ─────────────────────────────────

  describe("4. poolFullyRemoved exclusion from ballot", function () {
    it("a fully removed pool does not appear on the ballot", async function () {
      const { proxy, governance, extendOB, voteAdmin, timelockOwner,
              extraPool } = await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);

      await proxy.addPool(extraPool.address);
      await extendOB.connect(timelockOwner).setApprovedNonprofit(extraPool.address, true);
      await proxy.removePool(3);

      await startCycle();
      const ballot = await governance.getBallot(1);
      expect(ballot).to.have.length(3);
      expect(ballot).to.not.include(extraPool.address);
    });

    it("poolFullyRemoved is true after removePool and false after shutdownPool only", async function () {
      const { proxy, extraPool } = await loadFixture(fullFixture);

      await proxy.addPool(extraPool.address);
      await proxy.shutdownPool(3);
      expect(await proxy.poolFullyRemoved(3)).to.equal(false);

      await proxy.removePool(3);
      expect(await proxy.poolFullyRemoved(3)).to.equal(true);
    });
  });

  // ── 5. Shutdown pool remains ballot-eligible ──────────────────────────────────

  describe("5. Shutdown pool remains ballot-eligible", function () {
    it("shutdown pool (poolRemoved, not poolFullyRemoved) appears on ballot", async function () {
      const { proxy, governance, extendOB, voteAdmin, timelockOwner, extraPool } =
        await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);

      await proxy.addPool(extraPool.address);
      await extendOB.connect(timelockOwner).setApprovedNonprofit(extraPool.address, true);
      await proxy.shutdownPool(3);

      await startCycle();
      const ballot = await governance.getBallot(1);
      expect(ballot).to.have.length(4);
      expect(ballot).to.include(extraPool.address);
    });

    it("stakers can vote for a shutdown pool in Phase 2", async function () {
      const { proxy, governance, extendOB, voteAdmin, timelockOwner,
              staker1, extraPool } = await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      await proxy.addPool(extraPool.address);
      await extendOB.connect(timelockOwner).setApprovedNonprofit(extraPool.address, true);
      await proxy.shutdownPool(3);

      await startCycle();
      await runPhase1();

      await expect(
        governance.connect(staker1).castNonprofitVote(1, extraPool.address)
      ).to.not.be.reverted;
    });
  });

  // ── 6. Ballot deduplication ────────────────────────────────────────────────────

  describe("6. Ballot deduplication", function () {
    it("two pools sharing a charity wallet produce one ballot entry for that wallet", async function () {
      const { proxy, governance, voteAdmin, nonprofit1, nonprofit2 } =
        await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);

      // Pool 2 gets nonprofit1's wallet (same as pool 0); nonprofit3 drops off ballot
      await proxy.updateCharityWallet(2, nonprofit1.address);

      await startCycle();
      const ballot = await governance.getBallot(1);
      // pids 0,1,2 → wallets [np1, np2, np1] → deduped [np1, np2]
      expect(ballot).to.have.length(2);
      expect(ballot.filter(a => a === nonprofit1.address)).to.have.length(1);
      expect(ballot).to.include(nonprofit2.address);
    });

    it("adding a pool that duplicates an existing wallet does not increase ballot size", async function () {
      const { proxy, governance, voteAdmin } = await loadFixture(fullFixture);
      const { startCycle } = makeHelpers(governance, voteAdmin);

      const { nonprofit1 } = await loadFixture(fullFixture);

      // pid 3 with same wallet as pid 0 (nonprofit1 already approved)
      await proxy.addPool(nonprofit1.address);

      await startCycle();
      const ballot = await governance.getBallot(1);
      // pids 0,1,2,3 → wallets [np1, np2, np3, np1] → deduped [np1, np2, np3]
      expect(ballot).to.have.length(3);
      expect(ballot.filter(a => a === nonprofit1.address)).to.have.length(1);
    });
  });

  // ── 7. TheOffering burn path ───────────────────────────────────────────────────

  describe("7. TheOffering burn path", function () {
    it("burn vote: TheOffering OBN balance is destroyed and total supply decreases", async function () {
      const { token, governance, offering, voteAdmin, staker1, staker3 } =
        await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      const burnAmount  = ethers.parseEther("500");
      await token.mint(await offering.getAddress(), burnAmount);
      const supplyBefore = await token.totalSupply();

      await startCycle();
      // staker1 (1000) burn vs staker3 (1000) give → tie → BURN wins
      await governance.connect(staker1).castOfferingVote(1, true);
      await governance.connect(staker3).castOfferingVote(1, false);

      await runPhase1();

      expect(await token.totalSupply()).to.equal(supplyBefore - burnAmount);
      expect(await token.balanceOf(await offering.getAddress())).to.equal(0n);
    });

    it("burn path emits Phase1Executed with BURN outcome and correct amount", async function () {
      const { token, governance, offering, voteAdmin } = await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      const burnAmount = ethers.parseEther("200");
      await token.mint(await offering.getAddress(), burnAmount);
      await startCycle();

      // No votes cast → tie (0 vs 0) → BURN wins
      const tx = await runPhase1();
      const s  = await governance.getCycleSummary(1);
      // Phase1Outcome.BURN == 1
      await expect(tx).to.emit(governance, "Phase1Executed")
        .withArgs(1n, 1n, burnAmount, s.phase2End);
      await expect(tx).to.emit(offering, "Burned").withArgs(burnAmount);
    });

    it("burn path emits Phase2Started immediately after Phase1Executed", async function () {
      const { token, governance, voteAdmin } = await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      await token.mint(
        await (await ethers.getContractFactory("TheOffering")).attach(
          await governance.theOffering()
        ).getAddress(),
        ethers.parseEther("100")
      );
      await startCycle();
      const tx = await runPhase1();
      const s  = await governance.getCycleSummary(1);

      await expect(tx).to.emit(governance, "Phase2Started").withArgs(1n, s.phase2End);
    });
  });

  // ── 8. TheOffering give path ───────────────────────────────────────────────────

  describe("8. TheOffering give path", function () {
    it("give vote: OBN transfers from TheOffering to ExtendOliveBranch", async function () {
      const { token, governance, offering, extendOB, voteAdmin, staker2, staker1 } =
        await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      const giveAmount = ethers.parseEther("750");
      await token.mint(await offering.getAddress(), giveAmount);
      const extendBefore = await token.balanceOf(await extendOB.getAddress());

      await startCycle();
      // staker2 (2000) give > staker1 (1000) burn → GIVE wins
      await governance.connect(staker2).castOfferingVote(1, false);
      await governance.connect(staker1).castOfferingVote(1, true);

      await runPhase1();

      expect(await token.balanceOf(await offering.getAddress())).to.equal(0n);
      expect(await token.balanceOf(await extendOB.getAddress())).to.equal(extendBefore + giveAmount);
    });

    it("give path emits SentToExtend on TheOffering", async function () {
      const { token, governance, offering, voteAdmin, staker2 } = await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      const giveAmount = ethers.parseEther("300");
      await token.mint(await offering.getAddress(), giveAmount);
      await startCycle();
      await governance.connect(staker2).castOfferingVote(1, false);

      const tx = await runPhase1();
      await expect(tx).to.emit(offering, "SentToExtend").withArgs(giveAmount);
    });

    it("total supply is unchanged after a give vote (tokens moved, not burned)", async function () {
      const { token, governance, offering, voteAdmin, staker2 } = await loadFixture(fullFixture);
      const { startCycle, runPhase1 } = makeHelpers(governance, voteAdmin);

      await token.mint(await offering.getAddress(), ethers.parseEther("100"));
      const supplyBefore = await token.totalSupply();
      await startCycle();
      await governance.connect(staker2).castOfferingVote(1, false);
      await runPhase1();

      expect(await token.totalSupply()).to.equal(supplyBefore);
    });
  });

  // ── 9. ExtendOliveBranch distribution path ────────────────────────────────────

  describe("9. ExtendOliveBranch distribution", function () {
    it("Phase 2 winner receives the full ExtendOliveBranch balance", async function () {
      const { token, governance, extendOB, voteAdmin, staker2, nonprofit2 } =
        await loadFixture(fullFixture);
      const { startCycle, runPhase1, runPhase2 } = makeHelpers(governance, voteAdmin);

      const distAmount = ethers.parseEther("1000");
      await token.mint(await extendOB.getAddress(), distAmount);

      await startCycle();
      await runPhase1();

      await governance.connect(staker2).castNonprofitVote(1, nonprofit2.address);
      const balBefore = await token.balanceOf(nonprofit2.address);

      const tx = await runPhase2();
      await expect(tx).to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit2.address, distAmount);
      await expect(tx).to.emit(extendOB, "Distributed")
        .withArgs(nonprofit2.address, distAmount);
      expect(await token.balanceOf(nonprofit2.address)).to.equal(balBefore + distAmount);
      expect(await token.balanceOf(await extendOB.getAddress())).to.equal(0n);
    });

    it("distribute reverts for a non-approved nonprofit (direct call)", async function () {
      const { extendOB, timelockOwner, nonprofit2 } = await loadFixture(fullFixture);

      await extendOB.connect(timelockOwner).setApprovedNonprofit(nonprofit2.address, false);
      await expect(
        extendOB.connect(timelockOwner).distribute(nonprofit2.address, ethers.parseEther("1"))
      ).to.be.revertedWith("nonprofit not approved");
    });

    it("full give→distribute cycle: total supply unchanged, tokens reach nonprofit", async function () {
      const { token, governance, offering, extendOB, voteAdmin,
              staker2, staker1, nonprofit2 } = await loadFixture(fullFixture);
      const { startCycle, runPhase1, runPhase2 } = makeHelpers(governance, voteAdmin);

      const emissionAmount = ethers.parseEther("500");
      await token.mint(await offering.getAddress(), emissionAmount);
      const supplyBefore = await token.totalSupply();

      await startCycle();
      await governance.connect(staker2).castOfferingVote(1, false); // give
      await governance.connect(staker1).castOfferingVote(1, true);  // burn (loses)
      await runPhase1();
      await governance.connect(staker2).castNonprofitVote(1, nonprofit2.address);
      await runPhase2();

      expect(await token.totalSupply()).to.equal(supplyBefore);
      expect(await token.balanceOf(nonprofit2.address)).to.equal(emissionAmount);
    });
  });

  // ── 10. OBNStakingLens equivalence ────────────────────────────────────────────

  describe("10. OBNStakingLens equivalence", function () {
    it("Lens.getUserStats matches direct proxy storage reads for staker1", async function () {
      const { proxy, lens, staker1 } = await loadFixture(fullFixture);

      const stats = await lens.getUserStats(staker1.address);

      expect(stats.totalUserStaked).to.equal(await proxy.userAmount(0, staker1.address));
      expect(stats.totalUserClaimed).to.equal(await proxy.totalClaimedByUser(staker1.address));
      expect(stats.totalUserDeposited).to.equal(await proxy.totalDepositedByUser(staker1.address));
      expect(stats.totalUserWithdrawn).to.equal(await proxy.totalWithdrawnByUser(staker1.address));
      expect(stats.poolCount).to.equal(1n); // staker1 active in pool 0 only
    });

    it("Lens.getPoolStats matches direct proxy storage reads for pool 0", async function () {
      const { proxy, lens, S1 } = await loadFixture(fullFixture);

      const s = await lens.getPoolStats(0);

      expect(s.charityWallet).to.equal((await proxy.getPoolInfo(0)).charityWallet);
      expect(s.totalStaked).to.equal(S1);
      expect(s.uniqueStakers).to.equal(await proxy.uniqueStakersByPool(0));
      expect(s.accPerShare).to.equal(await proxy.accRewardPerShare(0));
      expect(s.lastTime).to.equal(await proxy.lastRewardTime(0));
      expect(s.accruedCharity).to.equal(await proxy.charityAccrued(0));
      expect(s.depositedAllTime).to.equal(await proxy.totalDepositedByPool(0));
    });

    it("Lens.listPoolsBasic returns correct wallets, totals, and staker counts", async function () {
      const { proxy, lens, nonprofit1, nonprofit2, nonprofit3,
              S1, S2, S3, S_UB } = await loadFixture(fullFixture);

      const { charityWallets, totals, uniqueCounts } = await lens.listPoolsBasic();

      expect(charityWallets[0]).to.equal(nonprofit1.address);
      expect(charityWallets[1]).to.equal(nonprofit2.address);
      expect(charityWallets[2]).to.equal(nonprofit3.address);

      expect(totals[0]).to.equal(S1);
      expect(totals[1]).to.equal(S2);
      expect(totals[2]).to.equal(S3 + S_UB); // staker3 + unbootstrapped both in pool 2

      for (let i = 0; i < 3; i++) {
        expect(uniqueCounts[i]).to.equal(await proxy.uniqueStakersByPool(i));
      }
    });

    it("Lens.getUserPoolView returns consistent staked, locked, unlocked, isActive", async function () {
      const { lens, staker1, S1 } = await loadFixture(fullFixture);

      const v = await lens.getUserPoolView(0, staker1.address);

      expect(v.staked).to.equal(S1);
      expect(v.locked).to.equal(0n);
      expect(v.unlocked).to.equal(S1);
      expect(v.isActive).to.equal(true);
    });

    it("Lens.pendingCharityFor matches charityAccrued on proxy for all pools", async function () {
      const { proxy, lens } = await loadFixture(fullFixture);
      for (let pid = 0; pid < 3; pid++) {
        expect(await lens.pendingCharityFor(pid)).to.equal(await proxy.charityAccrued(pid));
      }
    });

    it("proxy.userAmount is the v9.3 replacement for the removed getUserStakeValue helper", async function () {
      const { proxy, staker1, staker2, staker3, S1, S2, S3 } = await loadFixture(fullFixture);

      expect(await proxy.userAmount(0, staker1.address)).to.equal(S1);
      expect(await proxy.userAmount(1, staker2.address)).to.equal(S2);
      expect(await proxy.userAmount(2, staker3.address)).to.equal(S3);
    });
  });

  // ── 11. UUPS initializer safety ───────────────────────────────────────────────

  describe("11. UUPS initializer safety", function () {
    it("T2: OBNStakingLens bare implementation cannot be initialized", async function () {
      const { proxy, timelockOwner } = await loadFixture(fullFixture);
      const proxyAddr = await proxy.getAddress();

      const LensF = await ethers.getContractFactory("OBNStakingLens");
      const impl  = await LensF.deploy();
      await impl.waitForDeployment();

      await expect(
        impl.initialize(proxyAddr, timelockOwner.address)
      ).to.be.revertedWithCustomError(impl, "InvalidInitialization");
    });

    it("T4: OBNStakingLens proxy initialize() cannot be replayed", async function () {
      const { lens, proxy, timelockOwner } = await loadFixture(fullFixture);
      const proxyAddr = await proxy.getAddress();

      await expect(
        lens.initialize(proxyAddr, timelockOwner.address)
      ).to.be.revertedWithCustomError(lens, "InvalidInitialization");
    });

    it("AnnualGovernance proxy initialize() cannot be replayed", async function () {
      const { governance, proxy, offering, extendOB, timelockOwner, voteAdmin, token } =
        await loadFixture(fullFixture);
      const proxyAddr = await proxy.getAddress();

      await expect(
        governance.initialize(
          await token.getAddress(), proxyAddr,
          await offering.getAddress(), await extendOB.getAddress(),
          timelockOwner.address, voteAdmin.address, 50
        )
      ).to.be.revertedWithCustomError(governance, "InvalidInitialization");
    });
  });
});
