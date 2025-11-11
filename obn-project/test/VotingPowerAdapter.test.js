const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VotingPowerAdapter", function () {
  let votingPowerAdapter;
  let stakingPools;
  let owner, alice, bob, charlie;

  // Mock StakingPools for testing
  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    // Deploy mock StakingPools
    const MockStakingPools = await ethers.getContractFactory("MockStakingPoolsForGovernance");
    stakingPools = await MockStakingPools.deploy();
    await stakingPools.waitForDeployment();

    // Deploy VotingPowerAdapter
    const VotingPowerAdapter = await ethers.getContractFactory("VotingPowerAdapter");
    votingPowerAdapter = await VotingPowerAdapter.deploy(await stakingPools.getAddress());
    await votingPowerAdapter.waitForDeployment();

    // Setup mock pools
    await stakingPools.addPool(owner.address); // Pool 0
    await stakingPools.addPool(owner.address); // Pool 1
    await stakingPools.addPool(owner.address); // Pool 2
  });

  describe("Deployment", function () {
    it("Should set staking pools address", async function () {
      expect(await votingPowerAdapter.stakingPools()).to.equal(await stakingPools.getAddress());
    });

    it("Should have correct maturity period", async function () {
      expect(await votingPowerAdapter.MATURITY_PERIOD()).to.equal(14 * 24 * 60 * 60);
    });

    it("Should reject zero address", async function () {
      const VotingPowerAdapter = await ethers.getContractFactory("VotingPowerAdapter");
      await expect(
        VotingPowerAdapter.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("VotingPowerAdapter: zero address");
    });
  });

  describe("Voting Power Calculation", function () {
    it("Should return 0 voting power for users who never staked", async function () {
      const snapshot = await time.latest();
      const [totalPower, eligiblePids] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      expect(totalPower).to.equal(0);
      expect(eligiblePids.length).to.equal(0);
    });

    it("Should return 0 voting power for users without 14-day maturity", async function () {
      const stakeAmount = ethers.parseEther("100000");

      // Alice stakes
      await stakingPools.mockStake(alice.address, 0, stakeAmount);

      // Immediately check voting power
      const snapshot = await time.latest();
      const [totalPower, eligiblePids] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      expect(totalPower).to.equal(0);
      expect(eligiblePids.length).to.equal(0);
    });

    it("Should return correct voting power after 14-day maturity", async function () {
      const stakeAmount = ethers.parseEther("100000");

      // Alice stakes
      await stakingPools.mockStake(alice.address, 0, stakeAmount);

      // Fast-forward 14 days + 1 second
      await time.increase(14 * 24 * 60 * 60 + 1);

      // Check voting power
      const snapshot = await time.latest();
      const [totalPower, eligiblePids] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      expect(totalPower).to.equal(stakeAmount);
      expect(eligiblePids.length).to.equal(1);
      expect(eligiblePids[0]).to.equal(0);
    });

    it("Should aggregate voting power across multiple pools", async function () {
      const stake1 = ethers.parseEther("100000");
      const stake2 = ethers.parseEther("50000");
      const stake3 = ethers.parseEther("75000");

      // Alice stakes in 3 pools
      await stakingPools.mockStake(alice.address, 0, stake1);
      await stakingPools.mockStake(alice.address, 1, stake2);
      await stakingPools.mockStake(alice.address, 2, stake3);

      // Fast-forward 14 days
      await time.increase(14 * 24 * 60 * 60 + 1);

      // Check voting power
      const snapshot = await time.latest();
      const [totalPower, eligiblePids] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      const expectedTotal = stake1 + stake2 + stake3;
      expect(totalPower).to.equal(expectedTotal);
      expect(eligiblePids.length).to.equal(3);
      expect(eligiblePids).to.deep.equal([0, 1, 2]);
    });

    it("Should use snapshot time for maturity check", async function () {
      const stakeAmount = ethers.parseEther("100000");

      // Alice stakes at T=0
      await stakingPools.mockStake(alice.address, 0, stakeAmount);
      const stakeTime = await time.latest();

      // Fast-forward 7 days
      await time.increase(7 * 24 * 60 * 60);
      const snapshot7Days = await time.latest();

      // Check at 7 days: should have 0 power
      const [power7Days] = await votingPowerAdapter.getVotingPower(alice.address, snapshot7Days);
      expect(power7Days).to.equal(0);

      // Fast-forward another 7 days (total 14 days)
      await time.increase(7 * 24 * 60 * 60 + 1);
      const snapshot14Days = await time.latest();

      // Check at 14 days: should have power
      const [power14Days] = await votingPowerAdapter.getVotingPower(alice.address, snapshot14Days);
      expect(power14Days).to.equal(stakeAmount);

      // But checking with old snapshot (7 days) should still return 0
      const [powerAtOldSnapshot] = await votingPowerAdapter.getVotingPower(alice.address, snapshot7Days);
      expect(powerAtOldSnapshot).to.equal(0);
    });

    it("Should reject future snapshots", async function () {
      const futureTime = (await time.latest()) + 1000;

      await expect(
        votingPowerAdapter.getVotingPower(alice.address, futureTime)
      ).to.be.revertedWith("VotingPowerAdapter: future snapshot");
    });
  });

  describe("getCurrentVotingPower", function () {
    it("Should return current voting power using block.timestamp", async function () {
      const stakeAmount = ethers.parseEther("100000");

      // Alice stakes
      await stakingPools.mockStake(alice.address, 0, stakeAmount);

      // Immediately: should have 0 power
      const [powerBefore] = await votingPowerAdapter.getCurrentVotingPower(alice.address);
      expect(powerBefore).to.equal(0);

      // Fast-forward 14 days
      await time.increase(14 * 24 * 60 * 60 + 1);

      // Now: should have power
      const [powerAfter] = await votingPowerAdapter.getCurrentVotingPower(alice.address);
      expect(powerAfter).to.equal(stakeAmount);
    });
  });

  describe("hasMaturity", function () {
    it("Should return false for users who never staked", async function () {
      const snapshot = await time.latest();
      expect(await votingPowerAdapter.hasMaturity(alice.address, snapshot)).to.be.false;
    });

    it("Should return false before 14 days", async function () {
      await stakingPools.mockStake(alice.address, 0, ethers.parseEther("100000"));

      const snapshot = await time.latest();
      expect(await votingPowerAdapter.hasMaturity(alice.address, snapshot)).to.be.false;
    });

    it("Should return true after 14 days", async function () {
      await stakingPools.mockStake(alice.address, 0, ethers.parseEther("100000"));

      await time.increase(14 * 24 * 60 * 60 + 1);

      const snapshot = await time.latest();
      expect(await votingPowerAdapter.hasMaturity(alice.address, snapshot)).to.be.true;
    });
  });

  describe("getQuorum", function () {
    it("Should return fixed 1M OBN quorum", async function () {
      const quorum = await votingPowerAdapter.getQuorum();
      const expected = ethers.parseEther("1000000"); // 1M OBN

      expect(quorum).to.equal(expected);
    });

    it("Should remain constant regardless of global total", async function () {
      await stakingPools.setGlobalTotalStaked(ethers.parseEther("10000000"));
      const quorum1 = await votingPowerAdapter.getQuorum();

      await stakingPools.setGlobalTotalStaked(ethers.parseEther("20000000"));
      const quorum2 = await votingPowerAdapter.getQuorum();

      expect(quorum1).to.equal(quorum2);
      expect(quorum1).to.equal(ethers.parseEther("1000000"));
    });
  });

  describe("getProposalThreshold", function () {
    it("Should return fixed 10k OBN threshold", async function () {
      const threshold = await votingPowerAdapter.getProposalThreshold();
      const expected = ethers.parseEther("10000"); // 10k OBN

      expect(threshold).to.equal(expected);
    });

    it("Should remain constant regardless of global total", async function () {
      await stakingPools.setGlobalTotalStaked(ethers.parseEther("10000000"));
      const threshold1 = await votingPowerAdapter.getProposalThreshold();

      await stakingPools.setGlobalTotalStaked(ethers.parseEther("50000000"));
      const threshold2 = await votingPowerAdapter.getProposalThreshold();

      expect(threshold1).to.equal(threshold2);
      expect(threshold1).to.equal(ethers.parseEther("10000"));
    });
  });

  describe("getVotingPowerDetails", function () {
    it("Should return complete details for user with maturity", async function () {
      const stakeAmount = ethers.parseEther("100000");

      await stakingPools.mockStake(alice.address, 0, stakeAmount);
      const stakeTime = await time.latest();

      await time.increase(14 * 24 * 60 * 60 + 1);

      const snapshot = await time.latest();
      const [totalPower, poolCount, meetsMaturity, stakedSince] =
        await votingPowerAdapter.getVotingPowerDetails(alice.address, snapshot);

      expect(totalPower).to.equal(stakeAmount);
      expect(poolCount).to.equal(1);
      expect(meetsMaturity).to.be.true;
      expect(stakedSince).to.equal(stakeTime);
    });

    it("Should return details showing no maturity before 14 days", async function () {
      const stakeAmount = ethers.parseEther("100000");

      await stakingPools.mockStake(alice.address, 0, stakeAmount);
      const stakeTime = await time.latest();

      const snapshot = await time.latest();
      const [totalPower, poolCount, meetsMaturity, stakedSince] =
        await votingPowerAdapter.getVotingPowerDetails(alice.address, snapshot);

      expect(totalPower).to.equal(0);
      expect(poolCount).to.equal(0);
      expect(meetsMaturity).to.be.false;
      expect(stakedSince).to.equal(stakeTime);
    });
  });

  // No events in VotingPowerAdapter (view functions only)

  describe("Gas Optimization", function () {
    it("Should handle many pools efficiently", async function () {
      // Add 10 more pools
      for (let i = 0; i < 10; i++) {
        await stakingPools.addPool(owner.address);
      }

      // Alice stakes in 5 pools
      for (let i = 0; i < 5; i++) {
        await stakingPools.mockStake(alice.address, i, ethers.parseEther("10000"));
      }

      await time.increase(14 * 24 * 60 * 60 + 1);

      const snapshot = await time.latest();
      const tx = await votingPowerAdapter.getVotingPower.staticCall(alice.address, snapshot);

      // Should complete without excessive gas
      expect(tx[1].length).to.equal(5); // 5 eligible pools
    });
  });

  describe("Edge Cases", function () {
    it("Should handle user with 0 stake in some pools", async function () {
      await stakingPools.mockStake(alice.address, 0, ethers.parseEther("100000"));
      // Pool 1: 0 stake
      await stakingPools.mockStake(alice.address, 2, ethers.parseEther("50000"));

      await time.increase(14 * 24 * 60 * 60 + 1);

      const snapshot = await time.latest();
      const [totalPower, eligiblePids] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      expect(totalPower).to.equal(ethers.parseEther("150000"));
      expect(eligiblePids.length).to.equal(2);
      expect(eligiblePids).to.deep.equal([0, 2]); // Pool 1 excluded
    });

    it("Should handle exactly 14 days maturity", async function () {
      await stakingPools.mockStake(alice.address, 0, ethers.parseEther("100000"));
      const stakeTime = await time.latest();

      // Advance exactly 14 days (to the second)
      await time.increaseTo(stakeTime + 14 * 24 * 60 * 60);

      const snapshot = await time.latest();
      const [totalPower] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      // Exactly 14 days should PASS (>= 14 days)
      expect(totalPower).to.equal(ethers.parseEther("100000"));
    });

    it("Should handle 14 days minus 1 second (should fail)", async function () {
      await stakingPools.mockStake(alice.address, 0, ethers.parseEther("100000"));
      const stakeTime = await time.latest();

      // Advance 14 days - 1 second
      await time.increaseTo(stakeTime + 14 * 24 * 60 * 60 - 1);

      const snapshot = await time.latest();
      const [totalPower] = await votingPowerAdapter.getVotingPower(alice.address, snapshot);

      // Just shy of 14 days should FAIL
      expect(totalPower).to.equal(0);
    });
  });
});
