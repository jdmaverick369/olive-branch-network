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

describe("Nonprofit monthly payout investigation", function () {
  it("an empty keeper claim does not settle other stakers' nonprofit shares", async function () {
    const { staking, executor, user, charity, token } = await loadFixture(fixture);
    await time.increase(30 * 86400);
    const before = await token.balanceOf(charity.address);
    await staking.connect(executor).claim(0);
    expect(await token.balanceOf(charity.address)).to.equal(before);
    await staking.connect(user).claim(0);
    expect(await token.balanceOf(charity.address)).to.be.gt(before);
  });

  it("owner can settle nonprofit bootstrap rewards without nonprofit consent", async function () {
    const { staking, executor, charity, token } = await loadFixture(fixture);
    await token.approve(staking.target, ethers.MaxUint256);
    await staking.charityFundBootstrap(0, ethers.parseEther("1000000"), charity.address);
    await time.increase(30 * 86400);
    expect((await staking.autoClaimPreference(charity.address))[0]).to.equal(false);
    await expect(staking.connect(executor).claimFor(0, charity.address))
      .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    const before = await token.balanceOf(charity.address);
    const stakeBefore = await staking.userAmount(0, charity.address);
    await expect(staking.claimFor(0, charity.address)).to.emit(staking, "CharityDistributed");
    expect(await token.balanceOf(charity.address)).to.be.gt(before);
    expect(await staking.userAmount(0, charity.address)).to.equal(stakeBefore);
    expect((await staking.autoClaimPreference(charity.address))[0]).to.equal(false);
  });
});

