const { expect } = require("chai");
const { ethers, upgrades, artifacts } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const V93 = "contracts/StakingPoolsV93.sol:OBNStakingPools";
async function fixture() {
  const [owner, executor, user, other, charity, treasury, fund] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("OBNToken");
  const token = await upgrades.deployProxy(Token, [owner.address, ethers.parseEther("1000000000"),
    owner.address, owner.address, owner.address, owner.address, owner.address], { kind: "uups" });
  const Old = await ethers.getContractFactory(V93);
  const old = await upgrades.deployProxy(Old, [token.target, treasury.address, fund.address], { kind: "uups" });
  await token.setMinterOnce(old.target);
  await old.addPool(charity.address);
  await old.addPool(charity.address);
  await token.transfer(user.address, ethers.parseEther("10000"));
  await token.connect(user).approve(old.target, ethers.MaxUint256);
  await old.connect(user).deposit(0, ethers.parseEther("1000"));
  await old.connect(user).deposit(1, ethers.parseEther("1000"));
  await old.migrateV93(treasury.address, fund.address, owner.address);
  await old.batchBootstrap([user.address]);
  const checkpoint = await old.upgradeBlock();
  const New = await ethers.getContractFactory("OBNStakingPoolsV931");
  await upgrades.validateUpgrade(Old, New, { kind: "uups" });
  const staking = await upgrades.upgradeProxy(old.target, New, {
    call: { fn: "initializeV931", args: [executor.address] },
  });
  return { owner, executor, user, other, charity, treasury, fund, token, staking, checkpoint, Old, New };
}

describe("V9.3.1 monthly autoclaim", function () {
  it("worker selection matches the real lens and rounded payout at one and two gross wei", async function () {
    const { staking, executor, user } = await loadFixture(fixture);
    const { network } = require("hardhat");
    const { findEligiblePools } = await import("../../obn-frontend/scripts/autoclaim/core.mjs");
    const Lens = await ethers.getContractFactory("OBNStakingLens");
    const lens = await upgrades.deployProxy(Lens, [staking.target, executor.address], {kind:"uups"});
    await staking.connect(user).setAutoClaimEnabled(true);
    await time.increase(86400);
    await staking.connect(user).claim(0);
    const month = await staking.currentAutoClaimMonth();
    const artifact = await artifacts.readArtifact("OBNStakingPoolsV931");
    const build = await artifacts.getBuildInfo(`${artifact.sourceName}:${artifact.contractName}`);
    const slot = build.output.contracts[artifact.sourceName][artifact.contractName].storageLayout.storage
      .find(item => item.label === "userRewardDebt").slot;
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const outer = ethers.keccak256(coder.encode(["uint256","uint256"],[0,slot]));
    const debtSlot = ethers.keccak256(coder.encode(["address","bytes32"],[user.address,outer]));
    const accrued = await staking.userAmount(0,user.address) * await staking.accRewardPerShare(0) / 1000000000000n;
    // Fix the exact boundary without mining another block (and accruing more rewards).
    await network.provider.send("hardhat_setStorageAt",[staking.target,debtSlot,ethers.toBeHex(accrued-1n,32)]);
    expect(await lens.pendingRewards(0,user.address)).to.equal(1n);
    expect(await findEligiblePools(user.address,2,month,staking,lens)).to.deep.equal([1]);
    await expect(staking.connect(executor).autoClaimFor.staticCall([0],user.address,month,1))
      .to.be.revertedWithCustomError(staking,"NoClaimableRewards");
    await network.provider.send("hardhat_setStorageAt",[staking.target,debtSlot,ethers.toBeHex(accrued-2n,32)]);
    expect(await lens.pendingRewards(0,user.address)).to.equal(2n);
    expect(await findEligiblePools(user.address,2,month,staking,lens)).to.deep.equal([0,1]);
    await staking.connect(executor).autoClaimFor.staticCall([0,1],user.address,month,1);
  });

  it("keeps contract wallets as distinct stakers and claims while their owners are offline", async function () {
    const { staking, token, user, other, executor } = await loadFixture(fixture);
    const Wallet = await ethers.getContractFactory("CampaignWalletHarness");
    const alice = await Wallet.deploy(user.address);
    const bob = await Wallet.deploy(other.address);
    const amount = ethers.parseEther("100");
    const beforeCount = await staking.uniqueStakersGlobal();
    for (const [wallet, signer] of [[alice, user], [bob, other]]) {
      await token.transfer(wallet.target, amount * 2n);
      await wallet.connect(signer).executeBatch(
        [token.target, staking.target, staking.target, staking.target],
        [token.interface.encodeFunctionData("approve", [staking.target, amount * 2n]),
          staking.interface.encodeFunctionData("deposit", [0, amount]),
          staking.interface.encodeFunctionData("deposit", [1, amount]),
          staking.interface.encodeFunctionData("setAutoClaimEnabled", [true])]);
      expect(await staking.userAmount(0, wallet.target)).to.equal(amount);
      expect(await staking.autoClaimPreference(wallet.target)).to.deep.equal([true, 1n]);
    }
    expect(await staking.uniqueStakersGlobal()).to.equal(beforeCount + 2n);
    expect(await staking.userAmount(0, other.address)).to.equal(0);
    await time.increase(86400);
    const month = await staking.currentAutoClaimMonth();
    const ownerBalance = await token.balanceOf(user.address);
    // Neither wallet nor its owner participates in these scheduled claims.
    await staking.connect(executor).autoClaimFor([0, 1], alice.target, month, 1);
    await staking.connect(executor).autoClaimFor([0, 1], bob.target, month, 1);
    expect(await token.balanceOf(alice.target)).to.be.greaterThan(0);
    expect(await token.balanceOf(bob.target)).to.be.greaterThan(0);
    expect(await token.balanceOf(user.address)).to.equal(ownerBalance);
    expect(await token.balanceOf(executor.address)).to.equal(0);
    await alice.connect(user).executeBatch([staking.target],
      [staking.interface.encodeFunctionData("setAutoClaimEnabled", [false])]);
    await expect(staking.connect(executor).autoClaimFor([0, 1], alice.target, month, 1))
      .to.be.revertedWithCustomError(staking, "AutoClaimDisabled");
  });

  it("preserves V9.3 storage and locks initialization", async function () {
    const { staking, user, executor, checkpoint, New } = await loadFixture(fixture);
    expect(await staking.version()).to.equal("9.3.1");
    expect(await staking.autoClaimExecutor()).to.equal(executor.address);
    expect(await staking.userAmount(0, user.address)).to.equal(ethers.parseEther("1000"));
    expect(await staking.getPastVotingPower(user.address, checkpoint)).to.equal(ethers.parseEther("2000"));
    await expect(staking.initializeV931(executor.address)).to.be.reverted;
    const impl = await New.deploy();
    await expect(impl.initializeV931(executor.address)).to.be.reverted;
    const artifact = await artifacts.readArtifact("OBNStakingPoolsV931");
    expect((artifact.deployedBytecode.length - 2) / 2).to.be.lessThan(24577);
  });

  it("lets only stakers enable themselves and emits discoverable consent", async function () {
    const { staking, user, other } = await loadFixture(fixture);
    await expect(staking.connect(other).setAutoClaimEnabled(true)).to.be.revertedWithCustomError(staking, "NotStaker");
    await staking.connect(user).setAutoClaimEnabled(true);
    expect(await staking.autoClaimPreference(user.address)).to.deep.equal([true, 1n]);
    await staking.connect(user).setAutoClaimEnabled(false);
    expect(await staking.autoClaimPreference(user.address)).to.deep.equal([false, 2n]);
  });

  it("does not delegate ownership, ordinary claimFor, or preference changes", async function () {
    const { staking, executor, user, other } = await loadFixture(fixture);
    const month = await staking.currentAutoClaimMonth();
    await expect(staking.connect(other).autoClaimFor([0], user.address, month, 0)).to.be.revertedWithCustomError(staking, "NotAutoClaimExecutor");
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 0)).to.be.revertedWithCustomError(staking, "AutoClaimDisabled");
    await expect(staking.connect(executor).claimFor(0, user.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    await expect(staking.connect(executor).setAutoClaimExecutor(other.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    await expect(staking.connect(executor).addPool(other.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
  });

  it("rejects revoked consent and stale queued operations after re-enabling", async function () {
    const { staking, executor, user } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    const month = await staking.currentAutoClaimMonth();
    await staking.connect(user).setAutoClaimEnabled(false);
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 1)).to.be.revertedWithCustomError(staking, "AutoClaimDisabled");
    await staking.connect(user).setAutoClaimEnabled(true);
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 1)).to.be.revertedWithCustomError(staking, "StaleConsent");
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month - 1n, 3)).to.be.revertedWithCustomError(staking, "WrongMonth");
    await staking.setAutoClaimExecutor(ethers.ZeroAddress);
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 3)).to.be.revertedWithCustomError(staking, "NotAutoClaimExecutor");
  });

  it("matches UTC months across leap years, December and century boundaries", async function () {
    const { staking } = await loadFixture(fixture);
    for (const date of ["2060-02-29T23:59:59Z", "2060-03-01T00:00:00Z", "2060-12-31T23:59:59Z", "2061-01-01T00:00:00Z", "2100-03-01T00:00:00Z", "2400-02-29T00:00:00Z"]) {
      const d = new Date(date);
      await time.increaseTo(d.getTime() / 1000);
      expect(await staking.currentAutoClaimMonth()).to.equal(BigInt(d.getUTCFullYear() * 12 + d.getUTCMonth() + 1));
    }
  });

  it("claims into original recipients once per pool/month without changing stake or voting", async function () {
    const { staking, executor, user, charity, treasury, fund, token, checkpoint } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    await time.increase(86400);
    const month = await staking.currentAutoClaimMonth();
    const recipients = [user, charity, treasury, fund];
    const balances = await Promise.all(recipients.map(s => token.balanceOf(s.address)));
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 1)).to.emit(staking, "MonthlyAutoClaimed");
    for (let i = 0; i < recipients.length; i++) expect(await token.balanceOf(recipients[i].address)).to.be.greaterThan(balances[i]);
    expect(await token.balanceOf(executor.address)).to.equal(0);
    expect(await staking.userAmount(0, user.address)).to.equal(ethers.parseEther("1000"));
    expect(await staking.getPastVotingPower(user.address, checkpoint)).to.equal(ethers.parseEther("2000"));
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 1)).to.be.revertedWithCustomError(staking, "NoClaimableRewards");
    await staking.connect(executor).autoClaimFor([1], user.address, month, 1);
    await staking.connect(user).claim(0); // manual claims are independent
    await staking.connect(user).setAutoClaimEnabled(false);
    await staking.connect(user).setAutoClaimEnabled(true);
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 3)).to.be.revertedWithCustomError(staking, "NoClaimableRewards");
    const now = new Date(Number(await time.latest()) * 1000);
    const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000;
    await time.increaseTo(nextMonth);
    await expect(staking.connect(executor).autoClaimFor([0], user.address, month, 3)).to.be.revertedWithCustomError(staking, "WrongMonth");
    await staking.connect(executor).autoClaimFor([0], user.address, month + 1n, 3);
  });

  it("rolls back monthly accounting on failure and allows shutdown-pool claims", async function () {
    const { staking, executor, user } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    const month = await staking.currentAutoClaimMonth();
    await expect(staking.connect(executor).autoClaimFor([999], user.address, month, 1)).to.be.revertedWith("Invalid pool");
    expect(await staking.lastAutoClaimMonth(999, user.address)).to.equal(0);
    await staking.connect(user).withdraw(1, ethers.parseEther("1000"));
    await expect(staking.connect(executor).autoClaimFor([1], user.address, month, 1)).to.be.revertedWithCustomError(staking, "NoClaimableRewards");
    expect(await staking.lastAutoClaimMonth(1, user.address)).to.equal(0);
    await staking.shutdownPool(0);
    await staking.connect(executor).autoClaimFor([0], user.address, month, 1);
    await staking.connect(user).withdraw(0, ethers.parseEther("1000"));
    await staking.connect(user).setAutoClaimEnabled(false); // can always revoke after exit
  });

  it("batches every eligible pool in one transaction and skips completed/empty positions", async function () {
    const { staking, executor, user } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    const month = await staking.currentAutoClaimMonth();
    const tx = await staking.connect(executor).autoClaimFor([0, 1], user.address, month, 1);
    const receipt = await tx.wait();
    const claims = receipt.logs.map(l => { try { return staking.interface.parseLog(l); } catch { return null; } })
      .filter(l => l?.name === "MonthlyAutoClaimed");
    expect(claims.map(l => l.args.pid)).to.deep.equal([0n, 1n]);
    expect(await staking.lastAutoClaimMonth(0, user.address)).to.equal(month);
    expect(await staking.lastAutoClaimMonth(1, user.address)).to.equal(month);
    await expect(staking.connect(executor).autoClaimFor([0, 1], user.address, month, 1)).to.be.revertedWithCustomError(staking, "NoClaimableRewards");
  });

  it("rejects unbounded, duplicate or unsorted batches atomically", async function () {
    const { staking, executor, user } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    const month = await staking.currentAutoClaimMonth();
    for (const pids of [[], [0, 0], [1, 0], Array.from({length: 33}, (_, i) => i)]) {
      await expect(staking.connect(executor).autoClaimFor(pids, user.address, month, 1)).to.be.revertedWithCustomError(staking, "InvalidAutoClaimPools");
      expect(await staking.lastAutoClaimMonth(0, user.address)).to.equal(0);
    }
    await staking.connect(user).withdraw(0, ethers.parseEther("1000"));
    await staking.connect(executor).autoClaimFor([0, 1], user.address, month, 1);
    expect(await staking.lastAutoClaimMonth(0, user.address)).to.equal(0);
    expect(await staking.lastAutoClaimMonth(1, user.address)).to.equal(month);
  });

  it("rotates executor without resetting preferences or monthly limits", async function () {
    const { staking, executor, user, other } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    const month = await staking.currentAutoClaimMonth();
    await staking.connect(executor).autoClaimFor([0], user.address, month, 1);
    await staking.setAutoClaimExecutor(other.address);
    await expect(staking.connect(executor).autoClaimFor([1], user.address, month, 1)).to.be.revertedWithCustomError(staking, "NotAutoClaimExecutor");
    await staking.connect(other).autoClaimFor([0, 1], user.address, month, 1);
    expect(await staking.lastAutoClaimMonth(0, user.address)).to.equal(month);
    expect(await staking.lastAutoClaimMonth(1, user.address)).to.equal(month);
    expect(await staking.autoClaimPreference(user.address)).to.deep.equal([true, 1n]);
  });

  it("rolls back all earlier pools when a later pool in the batch reverts", async function () {
    const { staking, executor, user, token, charity, treasury, fund } = await loadFixture(fixture);
    await staking.connect(user).setAutoClaimEnabled(true);
    const month = await staking.currentAutoClaimMonth();
    const recipients = [user.address, charity.address, treasury.address, fund.address];
    const balances = await Promise.all(recipients.map(a => token.balanceOf(a)));
    const debt = await staking.userRewardDebt(0, user.address);
    await expect(staking.connect(executor).autoClaimFor([0, 999], user.address, month, 1)).to.be.revertedWith("Invalid pool");
    expect(await Promise.all(recipients.map(a => token.balanceOf(a)))).to.deep.equal(balances);
    expect(await staking.userRewardDebt(0, user.address)).to.equal(debt);
    expect(await staking.lastAutoClaimMonth(0, user.address)).to.equal(0);
  });

  it("executes the V9.3 -> V9.3.1 initialization atomically through a real Timelock", async function () {
    const { owner, executor, other, token, treasury, fund, Old, New } = await loadFixture(fixture);
    const old = await upgrades.deployProxy(Old, [token.target, treasury.address, fund.address], { kind: "uups" });
    await old.migrateV93(treasury.address, fund.address, owner.address);
    const Timelock = await ethers.getContractFactory("OBNTimeLock");
    const timelock = await Timelock.deploy(60, [owner.address], [ethers.ZeroAddress], owner.address);
    await old.transferOwnership(timelock.target);
    const candidate = await New.deploy();
    const init = New.interface.encodeFunctionData("initializeV931", [executor.address]);
    const data = New.interface.encodeFunctionData("upgradeToAndCall", [candidate.target, init]);
    const salt = ethers.id("V9.3.1 test upgrade");
    await expect(old.connect(executor).upgradeToAndCall(candidate.target, init)).to.be.revertedWithCustomError(old, "OwnableUnauthorizedAccount");
    await timelock.scheduleBatch([old.target], [0], [data], ethers.ZeroHash, salt, 60);
    await expect(timelock.connect(other).executeBatch([old.target], [0], [data], ethers.ZeroHash, salt)).to.be.reverted;
    await time.increase(60);
    await timelock.connect(other).executeBatch([old.target], [0], [data], ethers.ZeroHash, salt);
    const next = New.attach(old.target);
    expect(await next.version()).to.equal("9.3.1");
    expect(await next.owner()).to.equal(timelock.target);
    expect(await next.autoClaimExecutor()).to.equal(executor.address);
  });
});
