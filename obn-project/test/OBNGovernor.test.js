// test/OBNGovernor.test.js
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OBNGovernor", function () {
  let governor, votingPowerAdapter, governanceExecutor, stakingPools, timelock;
  let owner, proposer, voter1, voter2, voter3, nonprofit1, nonprofit2, nonprofit3;
  let obnToken;

  const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
  const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
  const CANCELLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CANCELLER_ROLE"));
  const TIMELOCK_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEFAULT_ADMIN_ROLE"));

  const ONE_MILLION = ethers.parseEther("1000000");
  const TEN_MILLION = ethers.parseEther("10000000");

  beforeEach(async function () {
    [owner, proposer, voter1, voter2, voter3, nonprofit1, nonprofit2, nonprofit3] = await ethers.getSigners();

    // Deploy OBNToken
    const OBNToken = await ethers.getContractFactory("OBNToken");
    obnToken = await upgrades.deployProxy(
      OBNToken,
      [
        owner.address, // initialOwner
        ethers.parseEther("1000000000"), // initialSupply (1B tokens)
        owner.address, // liquidityAddress
        owner.address, // airdropAddress
        owner.address, // charityAddress
        owner.address, // treasuryAddress
        owner.address, // teamVestingAddress
      ],
      { kind: "uups" }
    );
    await obnToken.waitForDeployment();

    // Deploy OBNStakingPools
    const OBNStakingPools = await ethers.getContractFactory("OBNStakingPools");
    stakingPools = await upgrades.deployProxy(
      OBNStakingPools,
      [await obnToken.getAddress(), owner.address, owner.address], // token, treasury, charityFund
      { kind: "uups" }
    );
    await stakingPools.waitForDeployment();

    // Set owner as minter (so we can mint tokens for tests)
    await obnToken.setMinterOnce(owner.address);

    // Setup initial pools
    await stakingPools.addPool(nonprofit1.address);
    await stakingPools.addPool(nonprofit2.address);

    // Mint tokens and stake for voters
    await obnToken.mint(voter1.address, TEN_MILLION);
    await obnToken.mint(voter2.address, TEN_MILLION);
    await obnToken.mint(voter3.address, TEN_MILLION);

    await obnToken.connect(voter1).approve(await stakingPools.getAddress(), TEN_MILLION);
    await obnToken.connect(voter2).approve(await stakingPools.getAddress(), TEN_MILLION);
    await obnToken.connect(voter3).approve(await stakingPools.getAddress(), TEN_MILLION);

    await stakingPools.connect(voter1).deposit(0, ONE_MILLION);
    await stakingPools.connect(voter2).deposit(0, ONE_MILLION);
    await stakingPools.connect(voter3).deposit(1, ONE_MILLION);

    // Wait 14 days for maturity
    await time.increase(14 * 24 * 60 * 60);

    // Deploy VotingPowerAdapter
    const VotingPowerAdapter = await ethers.getContractFactory("VotingPowerAdapter");
    votingPowerAdapter = await VotingPowerAdapter.deploy(await stakingPools.getAddress());
    await votingPowerAdapter.waitForDeployment();

    // Deploy TimelockController (1 day delay)
    const TimelockController = await ethers.getContractFactory("TimelockControllerUpgradeable");
    timelock = await upgrades.deployProxy(TimelockController, [
      86400, // 1 day delay
      [], // proposers (will add governor)
      [], // executors (will add governor)
      owner.address, // admin
    ]);
    await timelock.waitForDeployment();

    // Deploy GovernanceExecutor
    const GovernanceExecutor = await ethers.getContractFactory("GovernanceExecutor");
    governanceExecutor = await GovernanceExecutor.deploy(
      await stakingPools.getAddress(),
      await timelock.getAddress()
    );
    await governanceExecutor.waitForDeployment();

    // Deploy OBNGovernor
    const OBNGovernor = await ethers.getContractFactory("OBNGovernor");
    governor = await upgrades.deployProxy(
      OBNGovernor,
      [
        await votingPowerAdapter.getAddress(),
        await governanceExecutor.getAddress(),
        await timelock.getAddress(),
        owner.address,
      ],
      { kind: "uups" }
    );
    await governor.waitForDeployment();

    // Grant roles to Governor
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
  });

  describe("Initialization", function () {
    it("should initialize with correct parameters", async function () {
      expect(await governor.name()).to.equal("OBN Governor");
      expect(await governor.votingDelay()).to.equal(1);
      expect(await governor.votingPeriod()).to.equal(50400);
      expect(await governor.votingPowerAdapter()).to.equal(await votingPowerAdapter.getAddress());
      expect(await governor.governanceExecutor()).to.equal(await governanceExecutor.getAddress());
    });

    it("should use VotingPowerAdapter for quorum", async function () {
      const quorum = await governor.quorum(await time.latest());
      const threshold = await governor.proposalThreshold();

      expect(quorum).to.equal(await votingPowerAdapter.getQuorum());
      expect(threshold).to.equal(0); // Centralized: only owner can propose, no threshold needed
    });

    it("should use timestamp-based clock", async function () {
      expect(await governor.CLOCK_MODE()).to.equal("mode=timestamp");
      const clockValue = await governor.clock();
      const currentTime = await time.latest();
      expect(clockValue).to.be.closeTo(currentTime, 2);
    });
  });

  describe("Add Pool Proposals - Single Choice", function () {
    it("should create single-choice add pool proposal", async function () {
      const nonprofits = [nonprofit3.address];
      const description = "Add Pool: Save the Whales";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();

      // Find ProposalCreated event
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "ProposalCreated"
      );
      expect(event).to.not.be.undefined;

      const proposalId = event.args[0];
      expect(await governor.proposalTypes(proposalId)).to.equal(0); // ADD_POOL
    });

    it("should allow voting for single-choice add pool", async function () {
      const nonprofits = [nonprofit3.address];
      const description = "Add Pool: Save the Whales";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      // Wait for voting delay
      await time.increase(2);

      // Vote FOR (support = 1)
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);

      // Vote AGAINST (support = 0)
      await governor.connect(voter3).castVote(proposalId, 0);

      const votes = await governor.proposalVotes(proposalId);
      expect(votes[1]).to.equal(ONE_MILLION * 2n); // forVotes = 2M
      expect(votes[0]).to.equal(ONE_MILLION); // againstVotes = 1M
    });

    it("should pass single-choice proposal with majority", async function () {
      const nonprofits = [nonprofit3.address];
      const description = "Add Pool: Save the Whales";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      // 2M FOR, 0 AGAINST
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);

      // Wait for voting period to end
      await time.increase(50400 + 1);

      // Check proposal succeeded
      const state = await governor.state(proposalId);
      expect(state).to.equal(4); // Succeeded
    });

    it("should fail single-choice proposal without majority", async function () {
      const nonprofits = [nonprofit3.address];
      const description = "Add Pool: Save the Whales";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      // 1M FOR, 2M AGAINST
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 0);
      await governor.connect(voter3).castVote(proposalId, 0);

      await time.increase(50400 + 1);

      const state = await governor.state(proposalId);
      expect(state).to.equal(3); // Defeated
    });
  });

  describe("Add Pool Proposals - Multi-Choice", function () {
    it("should create multi-choice add pool proposal", async function () {
      const nonprofits = [nonprofit1.address, nonprofit2.address, nonprofit3.address];
      const description = "Add Pool: Vote for your favorite charity";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      expect(await governor.proposalTypes(proposalId)).to.equal(0); // ADD_POOL
    });

    it("should allow voting for multi-choice add pool with nonprofit index", async function () {
      const nonprofits = [nonprofit1.address, nonprofit2.address, nonprofit3.address];
      const description = "Add Pool: Vote for your favorite charity";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      // Vote for nonprofit at index 0
      await governor.connect(voter1).castVote(proposalId, 0);

      // Vote for nonprofit at index 1
      await governor.connect(voter2).castVote(proposalId, 1);

      // Vote for nonprofit at index 2
      await governor.connect(voter3).castVote(proposalId, 2);

      // Check votes
      expect(await governor.addPoolVotes(proposalId, 0)).to.equal(ONE_MILLION);
      expect(await governor.addPoolVotes(proposalId, 1)).to.equal(ONE_MILLION);
      expect(await governor.addPoolVotes(proposalId, 2)).to.equal(ONE_MILLION);
    });

    it("should reject invalid nonprofit index", async function () {
      const nonprofits = [nonprofit1.address, nonprofit2.address, nonprofit3.address];
      const description = "Add Pool: Vote for your favorite charity";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      // Try to vote for index 3 (out of bounds)
      await expect(
        governor.connect(voter1).castVote(proposalId, 3)
      ).to.be.revertedWith("Invalid nonprofit index");
    });

    it("should always succeed if quorum met for multi-choice", async function () {
      const nonprofits = [nonprofit1.address, nonprofit2.address, nonprofit3.address];
      const description = "Add Pool: Vote for your favorite charity";

      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      // All voters vote for different options
      await governor.connect(voter1).castVote(proposalId, 0);
      await governor.connect(voter2).castVote(proposalId, 1);
      await governor.connect(voter3).castVote(proposalId, 2);

      await time.increase(50400 + 1);

      // Should succeed because quorum is met
      const state = await governor.state(proposalId);
      expect(state).to.equal(4); // Succeeded
    });
  });

  describe("Remove Pool Proposals", function () {
    it("should create remove pool proposal", async function () {
      const pid = 0;
      const users = [voter1.address];
      const description = "Remove Pool: Charity violated terms";

      const tx = await governor.connect(owner).proposeRemovePool(pid, users, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      expect(await governor.proposalTypes(proposalId)).to.equal(1); // REMOVE_POOL
    });

    it("should allow voting on remove pool proposals", async function () {
      const pid = 0;
      const users = [voter1.address];
      const description = "Remove Pool: Charity violated terms";

      const tx = await governor.connect(owner).proposeRemovePool(pid, users, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      await governor.connect(voter1).castVote(proposalId, 1); // FOR
      await governor.connect(voter2).castVote(proposalId, 0); // AGAINST

      const votes = await governor.proposalVotes(proposalId);
      expect(votes[1]).to.equal(ONE_MILLION); // forVotes
      expect(votes[0]).to.equal(ONE_MILLION); // againstVotes
    });
  });

  describe("Update APY Proposals", function () {
    it("should create update APY proposal", async function () {
      const starts = [1735689600]; // Jan 1, 2025
      const ends = [1767225600]; // Jan 1, 2026
      const bps = [500]; // 5% APY
      const description = "Update APY: Reduce to 5% for sustainability";

      const tx = await governor.connect(owner).proposeUpdateAPY(starts, ends, bps, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      expect(await governor.proposalTypes(proposalId)).to.equal(2); // UPDATE_APY
    });

    it("should reject mismatched array lengths", async function () {
      const starts = [1735689600, 1767225600];
      const ends = [1767225600]; // Mismatched
      const bps = [500];
      const description = "Update APY";

      await expect(
        governor.connect(owner).proposeUpdateAPY(starts, ends, bps, description)
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("Protocol Upgrade Proposals", function () {
    it("should create protocol upgrade proposal", async function () {
      const newImplementation = ethers.Wallet.createRandom().address;
      const version = "8.10.0";
      const description = "Upgrade to v8.10.0 with governance support";

      const tx = await governor.connect(owner).proposeProtocolUpgrade(newImplementation, version, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      expect(await governor.proposalTypes(proposalId)).to.equal(3); // PROTOCOL_UPGRADE
    });

    it("should reject zero address implementation", async function () {
      const newImplementation = ethers.ZeroAddress;
      const version = "8.10.0";
      const description = "Invalid upgrade";

      await expect(
        governor.connect(owner).proposeProtocolUpgrade(newImplementation, version, description)
      ).to.be.revertedWith("Invalid implementation");
    });

    it("should allow voting on protocol upgrade proposals", async function () {
      const newImplementation = ethers.Wallet.createRandom().address;
      const version = "8.10.0";
      const description = "Upgrade to v8.10.0";

      const tx = await governor.connect(owner).proposeProtocolUpgrade(newImplementation, version, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      await governor.connect(voter1).castVote(proposalId, 1); // FOR
      await governor.connect(voter2).castVote(proposalId, 1); // FOR
      await governor.connect(voter3).castVote(proposalId, 1); // FOR

      const votes = await governor.proposalVotes(proposalId);
      expect(votes[1]).to.equal(ONE_MILLION * 3n); // forVotes = 3M
    });
  });

  describe("Voting Power", function () {
    it("should calculate voting power from VotingPowerAdapter", async function () {
      const snapshot = await time.latest();
      const votingPower = await votingPowerAdapter.getVotingPower(voter1.address, snapshot);

      expect(votingPower[0]).to.equal(ONE_MILLION); // voter1 staked 1M in pool 0
    });

    it("should reject proposals from non-owner", async function () {
      const nonprofits = [nonprofit3.address];
      const description = "Add Pool";

      // voter1 is not the owner, so should be rejected
      await expect(
        governor.connect(voter1).proposeAddPool(nonprofits, description)
      ).to.be.revertedWithCustomError(governor, "OwnableUnauthorizedAccount");
    });

    it("should prevent voting without maturity", async function () {
      // Create new voter and stake (but don't wait for maturity)
      const [, , , , , , , , newVoter] = await ethers.getSigners();
      await obnToken.mint(newVoter.address, ONE_MILLION);
      await obnToken.connect(newVoter).approve(await stakingPools.getAddress(), ONE_MILLION);
      await stakingPools.connect(newVoter).deposit(0, ONE_MILLION);

      // Create proposal
      const nonprofits = [nonprofit3.address];
      const description = "Add Pool";
      const tx = await governor.connect(owner).proposeAddPool(nonprofits, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find((log) => log.fragment?.name === "ProposalCreated").args[0];

      await time.increase(2);

      // Try to vote (should have 0 voting power)
      await governor.connect(newVoter).castVote(proposalId, 1);

      // Check that vote had no weight
      const votes = await governor.proposalVotes(proposalId);
      expect(votes[1]).to.equal(0n); // No votes counted
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to update VotingPowerAdapter", async function () {
      const newAdapter = ethers.Wallet.createRandom().address;
      await governor.updateVotingPowerAdapter(newAdapter);
      expect(await governor.votingPowerAdapter()).to.equal(newAdapter);
    });

    it("should reject non-owner updating VotingPowerAdapter", async function () {
      const newAdapter = ethers.Wallet.createRandom().address;
      await expect(
        governor.connect(voter1).updateVotingPowerAdapter(newAdapter)
      ).to.be.revertedWithCustomError(governor, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to update GovernanceExecutor", async function () {
      const newExecutor = ethers.Wallet.createRandom().address;
      await governor.updateGovernanceExecutor(newExecutor);
      expect(await governor.governanceExecutor()).to.equal(newExecutor);
    });

    it("should reject non-owner updating GovernanceExecutor", async function () {
      const newExecutor = ethers.Wallet.createRandom().address;
      await expect(
        governor.connect(voter1).updateGovernanceExecutor(newExecutor)
      ).to.be.revertedWithCustomError(governor, "OwnableUnauthorizedAccount");
    });
  });

  describe("Proposal Limits", function () {
    it("should reject add pool with 0 nonprofits", async function () {
      const nonprofits = [];
      const description = "Invalid proposal";

      await expect(
        governor.connect(owner).proposeAddPool(nonprofits, description)
      ).to.be.revertedWith("1-4 nonprofits required");
    });

    it("should reject add pool with more than 4 nonprofits", async function () {
      const nonprofits = [
        nonprofit1.address,
        nonprofit2.address,
        nonprofit3.address,
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
      ];
      const description = "Too many options";

      await expect(
        governor.connect(owner).proposeAddPool(nonprofits, description)
      ).to.be.revertedWith("1-4 nonprofits required");
    });
  });

  describe("Clock and Timepoint", function () {
    it("should use block.timestamp for clock", async function () {
      const clock = await governor.clock();
      const currentTime = await time.latest();
      expect(clock).to.be.closeTo(currentTime, 2);
    });

    it("should return correct CLOCK_MODE", async function () {
      expect(await governor.CLOCK_MODE()).to.equal("mode=timestamp");
    });
  });
});
