// AnnualGovernance.test.js
//
// Tests the two-phase annual governance cycle implemented in AnnualGovernance.sol.
// Uses mock contracts for all external dependencies (staking, TheOffering, ExtendOliveBranch)
// so each test is self-contained and does not depend on the live staking state.
//
// Staker powers (fixed across all tests unless a test overrides them):
//   staker1 → 100 OBN   staker2 → 200 OBN   staker3 → 100 OBN
//
// Ballot order (pools 0-2):
//   ballot[0] = nonprofit1   ballot[1] = nonprofit2   ballot[2] = nonprofit3

const { expect }  = require("chai");
const { ethers, upgrades }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

const DAY            = 24n * 3600n;
const PHASE1_DURATION = 30n * DAY;
const PHASE2_DURATION = 30n * DAY;

// CycleState enum values (matches AnnualGovernance.sol declaration order)
const CS = {
  INACTIVE:     0n,
  PHASE1_OPEN:  1n,
  PHASE1_READY: 2n,
  PHASE2_OPEN:  3n,
  PHASE2_READY: 4n,
  COMPLETED:    5n,
  CANCELLED:    6n,
};

describe("AnnualGovernance", function () {
  let governance;
  let obn, mockStaking, mockOffering, mockExtend;
  let timelockOwner, voteAdmin;
  let staker1, staker2, staker3;
  let nonprofit1, nonprofit2, nonprofit3;

  beforeEach(async function () {
    [, timelockOwner, voteAdmin, staker1, staker2, staker3,
      nonprofit1, nonprofit2, nonprofit3] = await ethers.getSigners();

    // ── Deploy mocks ──────────────────────────────────────────────────────────
    const MockERC20   = await ethers.getContractFactory("MockERC20");
    const MockStaking = await ethers.getContractFactory("MockStakingForGovernance");
    const MockOffering = await ethers.getContractFactory("MockTheOffering");
    const MockExtend  = await ethers.getContractFactory("MockExtendOliveBranch");

    obn          = await MockERC20.deploy();
    mockStaking  = await MockStaking.deploy();
    mockOffering = await MockOffering.deploy();
    mockExtend   = await MockExtend.deploy();

    // ── Configure 3 pools ────────────────────────────────────────────────────
    await mockStaking.setPoolCount(3);
    await mockStaking.setPool(0, nonprofit1.address);
    await mockStaking.setPool(1, nonprofit2.address);
    await mockStaking.setPool(2, nonprofit3.address);

    // ── Approve all nonprofits in ExtendOliveBranch ───────────────────────────
    await mockExtend.setApproved(nonprofit1.address, true);
    await mockExtend.setApproved(nonprofit2.address, true);
    await mockExtend.setApproved(nonprofit3.address, true);

    // ── Set voting power for stakers (flat; mock ignores blockNumber) ─────────
    await mockStaking.setVotingPower(staker1.address, ethers.parseEther("100"));
    await mockStaking.setVotingPower(staker2.address, ethers.parseEther("200"));
    await mockStaking.setVotingPower(staker3.address, ethers.parseEther("100"));

    // ── Deploy AnnualGovernance as UUPS proxy ─────────────────────────────────
    const Factory = await ethers.getContractFactory("AnnualGovernance");
    governance = await upgrades.deployProxy(Factory, [
      await obn.getAddress(),
      await mockStaking.getAddress(),
      await mockOffering.getAddress(),
      await mockExtend.getAddress(),
      timelockOwner.address,
      voteAdmin.address,
      100, // maxBallotSize
    ], { kind: "uups" });
    await governance.waitForDeployment();

    // Wire governance address into mock so distributeFromGovernance access check passes
    await mockExtend.setGovernance(await governance.getAddress());
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async function startCycle(p1 = PHASE1_DURATION, p2 = PHASE2_DURATION) {
    return governance.connect(voteAdmin).startAnnualCycle(p1, p2);
  }

  async function advanceToPhase1End(cycleId = 1n) {
    const s = await governance.getCycleSummary(cycleId);
    await time.increaseTo(Number(s.phase1End) + 1);
  }

  async function advanceToPhase2End(cycleId = 1n) {
    const s = await governance.getCycleSummary(cycleId);
    await time.increaseTo(Number(s.phase2End) + 1);
  }

  async function executePhase1(cycleId = 1n) {
    await advanceToPhase1End(cycleId);
    return governance.executePhase1(cycleId);
  }

  async function executePhase2(cycleId = 1n) {
    await advanceToPhase2End(cycleId);
    return governance.executePhase2(cycleId);
  }

  // ─── 1. Phase 1 executes Burn correctly ──────────────────────────────────────

  describe("1. Phase 1 — Burn outcome", function () {
    it("calls theOffering.burn() when burnVotes > giveVotes", async function () {
      await startCycle();
      // 300 burn (staker1 100 + staker2 200) vs 100 give (staker3 100)
      await governance.connect(staker1).castOfferingVote(1, true);
      await governance.connect(staker2).castOfferingVote(1, true);
      await governance.connect(staker3).castOfferingVote(1, false);

      const amount = ethers.parseEther("500");
      await obn.mint(await mockOffering.getAddress(), amount);
      await executePhase1();

      expect(await mockOffering.burnCalled()).to.equal(true);
      expect(await mockOffering.sendToExtendCalled()).to.equal(false);
      expect(await mockOffering.lastAmount()).to.equal(amount);
    });

    it("burn wins on a tie (giveVotes == burnVotes)", async function () {
      await startCycle();
      // staker1 (100) burn vs staker3 (100) give — exact tie
      await governance.connect(staker1).castOfferingVote(1, true);
      await governance.connect(staker3).castOfferingVote(1, false);

      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("1"));
      await executePhase1();

      expect(await mockOffering.burnCalled()).to.equal(true);
      expect(await mockOffering.sendToExtendCalled()).to.equal(false);
    });

    it("burn wins with zero participation", async function () {
      await startCycle();
      // no votes cast at all
      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("1"));
      await executePhase1();

      expect(await mockOffering.burnCalled()).to.equal(true);
    });

    it("skips the TheOffering call entirely when its balance is zero", async function () {
      await startCycle();
      // no OBN minted to TheOffering
      await executePhase1();

      expect(await mockOffering.burnCalled()).to.equal(false);
      expect(await mockOffering.sendToExtendCalled()).to.equal(false);
    });

    it("emits Phase1Executed with BURN outcome and correct amount", async function () {
      await startCycle();
      const amount = ethers.parseEther("200");
      await obn.mint(await mockOffering.getAddress(), amount);
      const tx = await executePhase1();

      // Phase1Outcome.BURN == 1 (enum: PENDING=0, BURN=1, GIVE=2)
      await expect(tx)
        .to.emit(governance, "Phase1Executed")
        .withArgs(1n, 1n, amount, (await governance.getCycleSummary(1)).phase2End);
    });
  });

  // ─── 2. Phase 1 executes Give correctly ──────────────────────────────────────

  describe("2. Phase 1 — Give outcome", function () {
    it("calls theOffering.sendToExtend() when giveVotes strictly exceed burnVotes", async function () {
      await startCycle();
      // 200 give (staker2) vs 100 burn (staker1)
      await governance.connect(staker2).castOfferingVote(1, false);
      await governance.connect(staker1).castOfferingVote(1, true);

      const amount = ethers.parseEther("300");
      await obn.mint(await mockOffering.getAddress(), amount);
      await executePhase1();

      expect(await mockOffering.sendToExtendCalled()).to.equal(true);
      expect(await mockOffering.burnCalled()).to.equal(false);
      expect(await mockOffering.lastAmount()).to.equal(amount);
    });

    it("emits Phase1Executed with GIVE outcome", async function () {
      await startCycle();
      await governance.connect(staker2).castOfferingVote(1, false);

      const amount = ethers.parseEther("100");
      await obn.mint(await mockOffering.getAddress(), amount);
      const tx = await executePhase1();

      // Phase1Outcome.GIVE == 2
      await expect(tx).to.emit(governance, "Phase1Executed").withArgs(
        1n, 2n, amount,
        (await governance.getCycleSummary(1)).phase2End
      );
    });
  });

  // ─── 3. Phase 2 starts only after executePhase1 succeeds ─────────────────────

  describe("3. Phase 2 activation", function () {
    it("phase2End is 0 before executePhase1 is called", async function () {
      await startCycle();
      const summary = await governance.getCycleSummary(1);
      expect(summary.phase2End).to.equal(0n);
    });

    it("state never reaches PHASE2_OPEN or PHASE2_READY before executePhase1", async function () {
      await startCycle();
      // Advance past phase1End — state should be PHASE1_READY, not any Phase 2 state
      await advanceToPhase1End();
      expect(await governance.getCycleState(1)).to.equal(CS.PHASE1_READY);
    });

    it("state transitions to PHASE2_OPEN immediately after executePhase1", async function () {
      await startCycle();
      await executePhase1();
      // phase2End is now set in the future, so state should be PHASE2_OPEN
      expect(await governance.getCycleState(1)).to.equal(CS.PHASE2_OPEN);
    });

    it("phase2End is set in the executePhase1 block, not the cycle start block", async function () {
      await startCycle();
      const txResponse = await executePhase1();
      const receipt    = await txResponse.wait();
      const block      = await ethers.provider.getBlock(receipt.blockNumber);

      const expectedPhase2End = BigInt(block.timestamp) + PHASE2_DURATION;
      const summary = await governance.getCycleSummary(1);
      expect(summary.phase2End).to.equal(expectedPhase2End);
    });
  });

  // ─── 4. TheOffering revert → Phase 2 does not start ─────────────────────────

  describe("4. TheOffering revert safety", function () {
    it("executePhase1 reverts and phase1Executed stays false when burn() reverts", async function () {
      await startCycle();
      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("100"));
      await mockOffering.setShouldRevertOnBurn(true);

      await advanceToPhase1End();
      await expect(governance.executePhase1(1)).to.be.reverted;

      // EVM atomicity: phase1Executed must not have committed
      const summary = await governance.getCycleSummary(1);
      expect(summary.phase1Executed).to.equal(false);
      expect(summary.phase2End).to.equal(0n);
      expect(await governance.getCycleState(1)).to.equal(CS.PHASE1_READY);
    });

    it("executePhase1 reverts and phase1Executed stays false when sendToExtend() reverts", async function () {
      await startCycle();
      // staker2 gives majority for GIVE outcome
      await governance.connect(staker2).castOfferingVote(1, false);
      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("100"));
      await mockOffering.setShouldRevertOnSend(true);

      await advanceToPhase1End();
      await expect(governance.executePhase1(1)).to.be.reverted;

      const summary = await governance.getCycleSummary(1);
      expect(summary.phase1Executed).to.equal(false);
      expect(summary.phase2End).to.equal(0n);
    });

    it("phase2End remains 0 and PHASE2_OPEN state is unreachable after a failed executePhase1", async function () {
      await startCycle();
      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("1"));
      await mockOffering.setShouldRevertOnBurn(true);

      await advanceToPhase1End();
      await expect(governance.executePhase1(1)).to.be.reverted;

      // Advancing further in time must not change the state to any Phase 2 state
      await time.increase(Number(PHASE2_DURATION) + 1000);
      expect(await governance.getCycleState(1)).to.equal(CS.PHASE1_READY);
    });
  });

  // ─── 5. Phase2Started event fires only after successful Phase 1 ──────────────

  describe("5. Phase2Started event", function () {
    it("emits Phase2Started with correct phase2End on successful executePhase1", async function () {
      await startCycle();
      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("1"));

      const txResponse = await executePhase1();
      const receipt    = await txResponse.wait();
      const block      = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedPhase2End = BigInt(block.timestamp) + PHASE2_DURATION;

      await expect(txResponse)
        .to.emit(governance, "Phase2Started")
        .withArgs(1n, expectedPhase2End);
    });

    it("Phase2Started and Phase1Executed both fire in the same transaction", async function () {
      await startCycle();
      const txResponse = await executePhase1();

      const summary = await governance.getCycleSummary(1);
      await expect(txResponse).to.emit(governance, "Phase1Executed");
      await expect(txResponse).to.emit(governance, "Phase2Started").withArgs(1n, summary.phase2End);
    });

    it("no Phase2Started event emitted when executePhase1 reverts", async function () {
      await startCycle();
      await obn.mint(await mockOffering.getAddress(), ethers.parseEther("1"));
      await mockOffering.setShouldRevertOnBurn(true);

      await advanceToPhase1End();
      // transaction reverts → no events committed at all
      await expect(governance.executePhase1(1)).to.be.reverted;
      // cycle still at PHASE1_READY, phase2End is still 0
      expect((await governance.getCycleSummary(1)).phase2End).to.equal(0n);
    });
  });

  // ─── 6. Phase 2 gets full duration from executePhase1 timestamp ──────────────

  describe("6. Phase 2 duration integrity", function () {
    it("phase2End = executePhase1 timestamp + phase2Duration even when Phase 1 executes late", async function () {
      await startCycle();

      // Execute Phase 1 ten days after phase1End (simulates late execution)
      const s = await governance.getCycleSummary(1);
      const lateTimestamp = Number(s.phase1End) + Number(10n * DAY);
      await time.increaseTo(lateTimestamp);

      const txResponse = await governance.executePhase1(1);
      const receipt    = await txResponse.wait();
      const block      = await ethers.provider.getBlock(receipt.blockNumber);

      const expectedPhase2End = BigInt(block.timestamp) + PHASE2_DURATION;
      const summaryAfter = await governance.getCycleSummary(1);
      expect(summaryAfter.phase2End).to.equal(expectedPhase2End);
    });

    it("Phase 2 voting window is fully open (PHASE2_OPEN) immediately after late Phase 1 execution", async function () {
      await startCycle();
      const s = await governance.getCycleSummary(1);
      await time.increaseTo(Number(s.phase1End) + Number(10n * DAY));
      await governance.executePhase1(1);

      // Phase2End is now + 30 days from now — should be OPEN, not READY
      expect(await governance.getCycleState(1)).to.equal(CS.PHASE2_OPEN);
    });

    it("phase2Duration passed to startAnnualCycle is preserved in the cycle", async function () {
      const customDuration = 14n * DAY; // 14 days instead of 30
      await startCycle(PHASE1_DURATION, customDuration);

      const txResponse = await executePhase1();
      const receipt    = await txResponse.wait();
      const block      = await ethers.provider.getBlock(receipt.blockNumber);

      const expectedPhase2End = BigInt(block.timestamp) + customDuration;
      const summaryAfter = await governance.getCycleSummary(1);
      expect(summaryAfter.phase2End).to.equal(expectedPhase2End);
    });
  });

  // ─── 7. No nonprofit votes → rollover ────────────────────────────────────────

  describe("7. Phase 2 — rollover on zero participation", function () {
    it("emits Phase2RolledOver and does not call distribute when no votes cast", async function () {
      await startCycle();
      await executePhase1();

      // Fund ExtendOliveBranch but cast no votes
      await obn.mint(await mockExtend.getAddress(), ethers.parseEther("500"));

      const tx = await executePhase2();
      await expect(tx).to.emit(governance, "Phase2RolledOver").withArgs(1n);
      expect(await mockExtend.distributeFromGovCalled()).to.equal(false);
    });

    it("state transitions to COMPLETED even on rollover", async function () {
      await startCycle();
      await executePhase1();
      await executePhase2();

      expect(await governance.getCycleState(1)).to.equal(CS.COMPLETED);
    });

    it("next cycle can start after a rolled-over cycle", async function () {
      await startCycle();
      await executePhase1();
      await executePhase2();

      // startAnnualCycle must succeed because previous cycle is COMPLETED
      await expect(startCycle()).to.emit(governance, "CycleStarted").withArgs(
        2n, // cycleId increments
        (v) => true, // snapshotBlock — any value
        (v) => true, // phase1End — any value
        PHASE2_DURATION,
        (v) => true  // ballot — any value
      );
    });
  });

  // ─── 8. Winner receives ExtendOliveBranch balance ────────────────────────────

  describe("8. Phase 2 — winner distribution", function () {
    it("distributes the full ExtendOliveBranch balance to the nonprofit with the most votes", async function () {
      await startCycle();
      await executePhase1();

      const balance = ethers.parseEther("1000");
      await obn.mint(await mockExtend.getAddress(), balance);

      // staker2 (200) → nonprofit2, staker1 (100) → nonprofit1: nonprofit2 wins
      await governance.connect(staker2).castNonprofitVote(1, nonprofit2.address);
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);

      const tx = await executePhase2();
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit2.address, balance);

      expect(await mockExtend.lastFromGovTo()).to.equal(nonprofit2.address);
      expect(await mockExtend.lastFromGovAmount()).to.equal(balance);
    });

    it("skips the distribute call when ExtendOliveBranch balance is zero", async function () {
      await startCycle();
      await executePhase1();

      // Votes exist but no balance to distribute
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);

      const tx = await executePhase2();
      // distributeFromGovernance is NOT called (contract guards: if (bal > 0)), but Phase2Executed still fires
      expect(await mockExtend.distributeFromGovCalled()).to.equal(false);
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit1.address, 0n);
    });

    it("phase2 votes from stakers who also voted phase1 are counted correctly", async function () {
      await startCycle();
      // Phase 1 vote
      await governance.connect(staker1).castOfferingVote(1, true);
      await executePhase1();

      // Same staker now votes phase 2 — independent mapping, should succeed
      await obn.mint(await mockExtend.getAddress(), ethers.parseEther("50"));
      await governance.connect(staker1).castNonprofitVote(1, nonprofit3.address);

      const tx = await executePhase2();
      await expect(tx).to.emit(governance, "Phase2Executed").withArgs(
        1n, nonprofit3.address, ethers.parseEther("50")
      );
    });
  });

  // ─── 9. Ties go to earliest ballot index ─────────────────────────────────────

  describe("9. Phase 2 — tie-breaking", function () {
    it("first ballot entry (lowest pool index) wins when two nonprofits tie", async function () {
      await startCycle();
      await executePhase1();

      await obn.mint(await mockExtend.getAddress(), ethers.parseEther("1"));

      // staker1 (100) → nonprofit1 (ballot[0])
      // staker3 (100) → nonprofit2 (ballot[1])
      // Equal votes: nonprofit1 must win (lower ballot index)
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);
      await governance.connect(staker3).castNonprofitVote(1, nonprofit2.address);

      const tx = await executePhase2();
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit1.address, ethers.parseEther("1"));
    });

    it("a nonprofit at a higher ballot index wins if it has strictly more votes", async function () {
      await startCycle();
      await executePhase1();

      await obn.mint(await mockExtend.getAddress(), ethers.parseEther("1"));

      // staker2 (200) → nonprofit2 (ballot[1]) beats staker1 (100) → nonprofit1 (ballot[0])
      await governance.connect(staker2).castNonprofitVote(1, nonprofit2.address);
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);

      const tx = await executePhase2();
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit2.address, ethers.parseEther("1"));
    });

    it("three-way split: nonprofit with most votes wins; no tie-break needed", async function () {
      await startCycle();
      await executePhase1();

      await obn.mint(await mockExtend.getAddress(), ethers.parseEther("1"));

      // staker1 (100) → nonprofit1, staker3 (100) → nonprofit2, staker2 (200) → nonprofit3
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);
      await governance.connect(staker3).castNonprofitVote(1, nonprofit2.address);
      await governance.connect(staker2).castNonprofitVote(1, nonprofit3.address);

      const tx = await executePhase2();
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit3.address, ethers.parseEther("1"));
    });
  });

  // ─── 10. Cancel impossible after phase1Executed ──────────────────────────────

  describe("10. cancelCycle", function () {
    it("reverts when timelockOwner tries to cancel after executePhase1", async function () {
      await startCycle();
      await executePhase1();

      await expect(
        governance.connect(timelockOwner).cancelCycle(1)
      ).to.be.revertedWith("phase1 already executed");
    });

    it("succeeds during PHASE1_OPEN (before phase1End)", async function () {
      await startCycle();

      await expect(
        governance.connect(timelockOwner).cancelCycle(1)
      ).to.emit(governance, "CycleCancelled").withArgs(1n, timelockOwner.address);

      expect(await governance.getCycleState(1)).to.equal(CS.CANCELLED);
    });

    it("succeeds during PHASE1_READY (after phase1End, before executePhase1)", async function () {
      await startCycle();
      await advanceToPhase1End();

      await expect(
        governance.connect(timelockOwner).cancelCycle(1)
      ).to.emit(governance, "CycleCancelled");
    });

    it("reverts if called twice on the same cycle", async function () {
      await startCycle();
      await governance.connect(timelockOwner).cancelCycle(1);

      await expect(
        governance.connect(timelockOwner).cancelCycle(1)
      ).to.be.revertedWith("already cancelled");
    });

    it("reverts if called by anyone other than timelockOwner", async function () {
      await startCycle();
      await expect(
        governance.connect(staker1).cancelCycle(1)
      ).to.be.revertedWithCustomError(governance, "OwnableUnauthorizedAccount");
    });

    it("next cycle can start after a cancelled cycle", async function () {
      await startCycle();
      await governance.connect(timelockOwner).cancelCycle(1);

      await expect(startCycle()).to.not.be.reverted;
      expect(await governance.currentCycleId()).to.equal(2n);
    });
  });

  // ─── Governance sovereignty: distributeFromGovernance design ────────────────
  //
  // The design: approvedNonprofit is a ballot ENTRY gate (enforced at cycle start),
  // not a post-vote execution gate. Once Phase 1 executes, the community decision
  // is final. timelockOwner revoking approval after that point must not invalidate
  // a completed vote. These tests verify the full invariant set.

  describe("governance sovereignty — distributeFromGovernance", function () {

    // ── Test 1: whitelist IS enforced as a ballot-entry gate at startAnnualCycle ──

    it("startAnnualCycle reverts if any ballot address is not approved in ExtendOliveBranch", async function () {
      // nonprofit2 loses approval before cycle start → ballot can't be built
      await mockExtend.setApproved(nonprofit2.address, false);

      await expect(startCycle()).to.be.revertedWith(
        "ballot address not approved in ExtendOliveBranch"
      );
    });

    // ── Test 2: revoking approval AFTER cycle start does not block executePhase2 ──

    it("executePhase2 succeeds even if the winner's approval is revoked after cycle start", async function () {
      // Cycle starts with all nonprofits approved
      await startCycle();
      await executePhase1();

      const balance = ethers.parseEther("500");
      await obn.mint(await mockExtend.getAddress(), balance);

      // nonprofit2 wins the vote
      await governance.connect(staker2).castNonprofitVote(1, nonprofit2.address);
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);

      // timelockOwner revokes nonprofit2's approval AFTER the vote is complete
      await mockExtend.setApproved(nonprofit2.address, false);

      // executePhase2 must still succeed — the frozen ballot governs, not the current whitelist
      const tx = await executePhase2();
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit2.address, balance);

      expect(await mockExtend.distributeFromGovCalled()).to.equal(true);
      expect(await mockExtend.lastFromGovTo()).to.equal(nonprofit2.address);
      expect(await mockExtend.lastFromGovAmount()).to.equal(balance);
    });

    // ── Test 3: distributeFromGovernance bypasses whitelist — ballot is the gate ──

    it("distributeFromGovernance does not check approvedNonprofit — ballot validation at startAnnualCycle is the only gate", async function () {
      // Cycle starts while nonprofit1 is approved — ballot passes validation.
      await startCycle();

      // Revoke approval mid-cycle (AFTER startAnnualCycle, BEFORE executePhase2).
      // This simulates the exact R2 scenario: timelockOwner acts after voting is done.
      await mockExtend.setApproved(nonprofit1.address, false);

      await executePhase1();
      await obn.mint(await mockExtend.getAddress(), ethers.parseEther("100"));
      await governance.connect(staker1).castNonprofitVote(1, nonprofit1.address);

      // nonprofit1 won the vote. Its approval was revoked post-vote.
      // executePhase2 must succeed because distributeFromGovernance skips the whitelist.
      const tx = await executePhase2();
      await expect(tx)
        .to.emit(governance, "Phase2Executed")
        .withArgs(1n, nonprofit1.address, ethers.parseEther("100"));

      expect(await mockExtend.lastFromGovTo()).to.equal(nonprofit1.address);
    });

    // ── Test 4: timelockOwner manual distribute() still requires approvedNonprofit ──

    it("distribute() called by timelockOwner reverts if address is not approved", async function () {
      // The manual distribution path for timelockOwner preserves the whitelist check.
      // Calling distribute() directly on the mock with an unapproved address must revert.
      await mockExtend.setApproved(nonprofit1.address, false);

      await expect(
        mockExtend.distribute(nonprofit1.address, ethers.parseEther("1"))
      ).to.be.revertedWith("nonprofit not approved");
    });

    it("distribute() called by timelockOwner succeeds for an approved address", async function () {
      // Sanity-check the positive path: approved address, called directly.
      await mockExtend.distribute(nonprofit1.address, ethers.parseEther("10"));

      expect(await mockExtend.distributeCalled()).to.equal(true);
      expect(await mockExtend.lastDistributedTo()).to.equal(nonprofit1.address);
    });

    // ── Test 5: non-governance caller cannot call distributeFromGovernance ─────────

    it("distributeFromGovernance reverts when called by any address other than governance", async function () {
      const [, , , rando] = await ethers.getSigners();

      // Direct call from a non-governance address must revert
      await expect(
        mockExtend.connect(rando).distributeFromGovernance(
          nonprofit1.address,
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("not governance");
    });

    it("distributeFromGovernance reverts when called by timelockOwner (not governance)", async function () {
      await expect(
        mockExtend.connect(timelockOwner).distributeFromGovernance(
          nonprofit1.address,
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("not governance");
    });

    it("votes for non-ballot address revert — ballot freezing is the distribution gate", async function () {
      // An address not on the ballot cannot receive votes, so it can never become the
      // winner passed to distributeFromGovernance. This proves the ballot-freeze protection.
      await startCycle();
      await executePhase1();

      const [, , , , , , , , , outsider] = await ethers.getSigners();

      await expect(
        governance.connect(staker1).castNonprofitVote(1, outsider.address)
      ).to.be.revertedWith("not on ballot");
    });
  });

  // ─── Deduplication of duplicate charity wallets ───────────────────────────────
  // (Noted in BallotEligibility.test.js as belonging here — the dedup logic lives
  //  in AnnualGovernance.startAnnualCycle())

  describe("ballot deduplication", function () {
    it("two pools sharing a charity wallet appear only once on the ballot", async function () {
      // Override pool 1 to share nonprofit1's wallet
      await mockStaking.setPool(1, nonprofit1.address);
      await startCycle();

      const ballot = await governance.getBallot(1);
      // Ballot should have [nonprofit1, nonprofit3] — nonprofit2 slot was reused for nonprofit1
      const unique = [...new Set(ballot)];
      expect(unique.length).to.equal(ballot.length, "ballot contains duplicates");
      expect(ballot.length).to.equal(2); // pools 0 and 1 both point to nonprofit1 → 1 entry; pool 2 → nonprofit3
    });

    it("reverts startAnnualCycle if a ballot address is not approved in ExtendOliveBranch", async function () {
      // Revoke approval for nonprofit2
      await mockExtend.setApproved(nonprofit2.address, false);

      await expect(startCycle()).to.be.revertedWith(
        "ballot address not approved in ExtendOliveBranch"
      );
    });
  });

  // ─── UUPS initializer safety ──────────────────────────────────────────────────

  describe("UUPS initializer safety", function () {
    it("T1: bare implementation cannot be initialized", async function () {
      const Factory = await ethers.getContractFactory("AnnualGovernance");
      const impl = await Factory.deploy();
      await impl.waitForDeployment();

      await expect(
        impl.initialize(
          await obn.getAddress(),
          await mockStaking.getAddress(),
          await mockOffering.getAddress(),
          await mockExtend.getAddress(),
          timelockOwner.address,
          voteAdmin.address,
          100
        )
      ).to.be.revertedWithCustomError(impl, "InvalidInitialization");
    });

    it("T3: proxy initialize() cannot be replayed", async function () {
      await expect(
        governance.initialize(
          await obn.getAddress(),
          await mockStaking.getAddress(),
          await mockOffering.getAddress(),
          await mockExtend.getAddress(),
          timelockOwner.address,
          voteAdmin.address,
          100
        )
      ).to.be.revertedWithCustomError(governance, "InvalidInitialization");
    });

    it("_authorizeUpgrade reverts mid-cycle", async function () {
      await startCycle();
      const [, , , , , , , , , , upgrader] = await ethers.getSigners();

      // Deploy a dummy new implementation to pass as the upgrade target
      const Factory  = await ethers.getContractFactory("AnnualGovernance");
      const newImpl  = await Factory.deploy();
      await newImpl.waitForDeployment();

      // timelockOwner is the owner — upgrade should be blocked while PHASE1_OPEN
      await expect(
        governance.connect(timelockOwner).upgradeToAndCall(await newImpl.getAddress(), "0x")
      ).to.be.revertedWith("upgrade: cycle in progress");
    });

    it("_authorizeUpgrade succeeds after cycle completes", async function () {
      await startCycle();
      await executePhase1();
      await executePhase2();

      const Factory = await ethers.getContractFactory("AnnualGovernance");
      const newImpl = await Factory.deploy();
      await newImpl.waitForDeployment();

      // Should not revert — cycle is COMPLETED
      await governance.connect(timelockOwner).upgradeToAndCall(await newImpl.getAddress(), "0x");
    });
  });

  // ─── 13. getVotingPowerForCycle ──────────────────────────────────────────────

  describe("13. getVotingPowerForCycle", function () {
    it("returns (0, false) for cycleId 0", async function () {
      const [power, bootstrapped] = await governance.getVotingPowerForCycle(0, staker1.address);
      expect(power).to.equal(0n);
      expect(bootstrapped).to.equal(false);
    });

    it("returns (0, false) for a cycleId that has not been started", async function () {
      const [power, bootstrapped] = await governance.getVotingPowerForCycle(99, staker1.address);
      expect(power).to.equal(0n);
      expect(bootstrapped).to.equal(false);
    });

    it("returns correct power for a bootstrapped staker during an active cycle", async function () {
      // Mock returns checkpointCount = 1 by default (not uninitialized)
      await startCycle();

      const [power, bootstrapped] = await governance.getVotingPowerForCycle(1, staker1.address);
      expect(bootstrapped).to.equal(true);
      expect(power).to.equal(ethers.parseEther("100"));
    });

    it("returns bootstrapped=false for an unbootstrapped staker", async function () {
      // setUninitialized makes checkpointCount return 0 for this staker
      await mockStaking.setUninitialized(staker2.address, true);
      await startCycle();

      const [, bootstrapped] = await governance.getVotingPowerForCycle(1, staker2.address);
      expect(bootstrapped).to.equal(false);
      // On-chain the real staking contract returns power=0 when no checkpoints exist.
      // The mock returns the flat configured value — the bootstrapped flag is what matters
      // for the frontend to show the "will be calculated at first vote" warning.
    });

    it("returns correct power for a completed cycle (historical lookup)", async function () {
      // staker1 is bootstrapped by default (checkpointCount returns 1)
      await startCycle();
      await executePhase1();
      await executePhase2();

      const [power, bootstrapped] = await governance.getVotingPowerForCycle(1, staker1.address);
      expect(bootstrapped).to.equal(true);
      expect(power).to.equal(ethers.parseEther("100"));
    });
  });
});
