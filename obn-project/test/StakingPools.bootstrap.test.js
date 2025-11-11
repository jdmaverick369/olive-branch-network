const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingPools v8.10.0 - Bootstrap Migration & ForceExit", function () {
  let stakingPools;
  let token;
  let owner, nonprofit1, nonprofit2, user1, user2, treasury, charityFund;

  beforeEach(async function () {
    [owner, nonprofit1, nonprofit2, user1, user2, treasury, charityFund] = await ethers.getSigners();

    // Deploy OBNToken
    const OBNToken = await ethers.getContractFactory("OBNToken");
    token = await upgrades.deployProxy(
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
    await token.waitForDeployment();

    // Set owner as minter
    await token.setMinterOnce(owner.address);

    // Deploy StakingPools
    const StakingPoolsFactory = await ethers.getContractFactory("OBNStakingPools");
    const poolsProxy = await upgrades.deployProxy(
      StakingPoolsFactory,
      [await token.getAddress(), treasury.address, charityFund.address],
      { kind: "uups" }
    );
    await poolsProxy.waitForDeployment();
    stakingPools = poolsProxy;

    // Add a pool
    await stakingPools.addPool(nonprofit1.address);

    // Mint tokens for testing
    const TEN_MILLION = ethers.parseEther("10000000");
    await token.mint(owner.address, TEN_MILLION);
    await token.mint(nonprofit1.address, TEN_MILLION);
    await token.mint(nonprofit2.address, TEN_MILLION);
    await token.mint(user1.address, TEN_MILLION);
    await token.mint(user2.address, TEN_MILLION);
    await token.mint(charityFund.address, TEN_MILLION);

    // Approve token transfers
    await token.approve(await stakingPools.getAddress(), ethers.parseEther("1000000000"));
    await token.connect(nonprofit1).approve(await stakingPools.getAddress(), ethers.parseEther("1000000000"));
    await token.connect(nonprofit2).approve(await stakingPools.getAddress(), ethers.parseEther("1000000000"));
    await token.connect(user1).approve(await stakingPools.getAddress(), ethers.parseEther("1000000000"));
    await token.connect(user2).approve(await stakingPools.getAddress(), ethers.parseEther("1000000000"));
    await token.connect(charityFund).approve(await stakingPools.getAddress(), ethers.parseEther("1000000000"));
  });

  describe("migrateBootstrap", function () {
    it("Should migrate bootstrap from old nonprofit to new nonprofit", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1 (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Verify bootstrap was set up
      let [staked, locked] = await Promise.all([
        stakingPools.userAmount(pid, nonprofit1.address),
        stakingPools.lockedAmount(pid, nonprofit1.address),
      ]);
      expect(staked).to.equal(bootstrapAmount);
      expect(locked).to.equal(bootstrapAmount);

      // Migrate to nonprofit2
      await stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit2.address);

      // Verify old nonprofit has no balance
      let oldBalance = await stakingPools.userAmount(pid, nonprofit1.address);
      expect(oldBalance).to.equal(0);

      // Verify new nonprofit has the bootstrap
      let newBalance = await stakingPools.userAmount(pid, nonprofit2.address);
      expect(newBalance).to.equal(bootstrapAmount);

      // Verify new nonprofit's lock is set
      let newLocked = await stakingPools.lockedAmount(pid, nonprofit2.address);
      expect(newLocked).to.equal(bootstrapAmount);

      // Verify charity wallet was updated
      let [charityWallet] = await stakingPools.getPoolInfo(pid);
      expect(charityWallet).to.equal(nonprofit2.address);
    });

    it("Should preserve pending rewards to new nonprofit during migration", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1 (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Wait some time for rewards to accumulate
      await time.increase(30 * 24 * 60 * 60); // 30 days

      // Get pending rewards before migration
      const pendingBefore = await stakingPools.pendingRewards(pid, nonprofit1.address);
      expect(pendingBefore).to.be.gt(0);

      // Migrate to nonprofit2 (does NOT mint, just transfers the position)
      const tx = await stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit2.address);

      // Verify old nonprofit has no balance or pending
      const balanceOld = await stakingPools.userAmount(pid, nonprofit1.address);
      expect(balanceOld).to.equal(0);
      const pendingAfterOld = await stakingPools.pendingRewards(pid, nonprofit1.address);
      expect(pendingAfterOld).to.equal(0);

      // Verify new nonprofit has the bootstrap balance AND preserved pending
      const balanceNew = await stakingPools.userAmount(pid, nonprofit2.address);
      expect(balanceNew).to.equal(bootstrapAmount);
      const pendingAfterNew = await stakingPools.pendingRewards(pid, nonprofit2.address);
      // Allow small variation due to time progression during migration tx
      expect(pendingAfterNew).to.be.closeTo(pendingBefore, ethers.parseEther("1000")); // ±1k tolerance
    });

    it("Should revert if old nonprofit is not the pool's charity wallet", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1 (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Try to migrate using wrong old address
      await expect(
        stakingPools.migrateBootstrap(pid, user1.address, nonprofit2.address)
      ).to.be.revertedWith("oldNonprofit not pool charity");
    });

    it("Should revert if new nonprofit already has stake", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1 (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Make nonprofit2 deposit some tokens
      await token.transfer(nonprofit2.address, ethers.parseEther("100000"));
      await stakingPools.connect(nonprofit2).deposit(pid, ethers.parseEther("1000"));

      // Try to migrate to nonprofit2 (already staked)
      await expect(
        stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit2.address)
      ).to.be.revertedWith("newNonprofit already staked");
    });

    it("Should revert if trying to migrate same address", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1 (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Try to migrate to same address
      await expect(
        stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit1.address)
      ).to.be.revertedWith("Same address");
    });

    it("Should revert if no bootstrap to migrate", async function () {
      const pid = 0;

      // Try to migrate when nonprofit1 has no bootstrap
      await expect(
        stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit2.address)
      ).to.be.revertedWith("no bootstrap at old");
    });

    it("Should correctly handle active staker tracking during migration", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1 (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Verify nonprofit1 is active
      let [, , , , activeCount1] = await stakingPools.getUserStats(nonprofit1.address);
      expect(activeCount1).to.equal(1);

      // Migrate to nonprofit2
      await stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit2.address);

      // Verify nonprofit1 is no longer active
      let [, , , , activeCount1After] = await stakingPools.getUserStats(nonprofit1.address);
      expect(activeCount1After).to.equal(0);

      // Verify nonprofit2 is now active
      let [, , , , activeCount2] = await stakingPools.getUserStats(nonprofit2.address);
      expect(activeCount2).to.equal(1);
    });
  });

  describe("forceExitUserToSelf", function () {
    it("Should force exit user and return principal to themselves", async function () {
      const pid = 0;
      const stakeAmount = ethers.parseEther("100000");

      // User1 deposits
      const balanceBefore = await token.balanceOf(user1.address);
      await stakingPools.connect(user1).deposit(pid, stakeAmount);

      // Verify balance in pool
      const poolBalance = await stakingPools.userAmount(pid, user1.address);
      expect(poolBalance).to.equal(stakeAmount);

      // Force exit to self
      await stakingPools.forceExitUserToSelf(pid, user1.address, false);

      // Verify pool balance is zero
      const poolBalanceAfter = await stakingPools.userAmount(pid, user1.address);
      expect(poolBalanceAfter).to.equal(0);

      // Verify user received tokens (should have original balance back)
      const userTokenBalanceAfter = await token.balanceOf(user1.address);
      expect(userTokenBalanceAfter).to.equal(balanceBefore);
    });

    it("Should accumulate pending rewards that are preserved after migration", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap with nonprofit1
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Wait for rewards to accumulate
      await time.increase(30 * 24 * 60 * 60); // 30 days

      // Get pending before migration
      const pendingBefore = await stakingPools.pendingRewards(pid, nonprofit1.address);
      expect(pendingBefore).to.be.gt(0);

      // Migrate to nonprofit2
      await stakingPools.migrateBootstrap(pid, nonprofit1.address, nonprofit2.address);

      // Pending should be preserved at new address (may differ slightly due to time progression)
      const pendingAfterNew = await stakingPools.pendingRewards(pid, nonprofit2.address);
      // Allow small variation due to time progression during migration tx
      expect(pendingAfterNew).to.be.closeTo(pendingBefore, ethers.parseEther("1000")); // ±1k tolerance

      // Old address should have zero pending
      const pendingAfterOld = await stakingPools.pendingRewards(pid, nonprofit1.address);
      expect(pendingAfterOld).to.equal(0);
    });

    it("Should return principal to user without rewards when claimRewards=false", async function () {
      const pid = 0;
      const stakeAmount = ethers.parseEther("100000");

      // User1 deposits
      const balanceBefore = await token.balanceOf(user1.address);
      await stakingPools.connect(user1).deposit(pid, stakeAmount);

      // Wait for rewards
      await time.increase(30 * 24 * 60 * 60); // 30 days

      // Get pending before exit
      const pendingBefore = await stakingPools.pendingRewards(pid, user1.address);
      expect(pendingBefore).to.be.gt(0);

      // Force exit without rewards claim
      await stakingPools.forceExitUserToSelf(pid, user1.address, false);

      // Verify user received principal back but not rewards
      // Balance should be: (initial - staked) + principal back = initial - staked + staked = initial
      const userTokenBalanceAfter = await token.balanceOf(user1.address);
      expect(userTokenBalanceAfter).to.equal(balanceBefore); // Should have original balance back
    });

    it("Should ignore locks during forceExitUserToSelf", async function () {
      const pid = 0;
      const bootstrapAmount = ethers.parseEther("1000000");

      // Bootstrap creates a lock (charityFund must be the caller)
      await stakingPools.connect(charityFund).charityFundBootstrap(pid, bootstrapAmount, nonprofit1.address);

      // Verify locked amount
      const lockedBefore = await stakingPools.lockedAmount(pid, nonprofit1.address);
      expect(lockedBefore).to.equal(bootstrapAmount);

      // Force exit the nonprofit (ignoring lock)
      await stakingPools.forceExitUserToSelf(pid, nonprofit1.address, false);

      // Verify balance is zero (lock was ignored)
      const balanceAfter = await stakingPools.userAmount(pid, nonprofit1.address);
      expect(balanceAfter).to.equal(0);

      // Verify lock was cleared
      const lockedAfter = await stakingPools.lockedAmount(pid, nonprofit1.address);
      expect(lockedAfter).to.equal(0);
    });

    it("Should revert if user not found", async function () {
      const pid = 0;

      // Try to force exit non-existent user
      await expect(
        stakingPools.forceExitUserToSelf(pid, ethers.ZeroAddress, false)
      ).to.be.revertedWith("user=0");
    });

    it("Should handle gracefully when user has no balance", async function () {
      const pid = 0;

      // Force exit user with no balance (should return gracefully)
      const tx = await stakingPools.forceExitUserToSelf(pid, user1.address, true);
      // Should not revert, just return

      expect(tx).to.not.be.undefined;
    });
  });

  describe("Version", function () {
    it("Should have correct version 9.0", async function () {
      const version = await stakingPools.version();
      expect(version).to.equal("9.0");
    });
  });
});
