const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { loadFixture, mine, time } = require('@nomicfoundation/hardhat-network-helpers');
const DAY = 86400;
const amount = ethers.parseEther;

async function fixture() {
  const [owner, admin, alice, bob, nonprofit] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory('OliveNFT')).deploy('Olive', 'OLIVE', '');
  const vault = await upgrades.deployProxy(await ethers.getContractFactory('OliveAssembly'), [nft.target, owner.address], { kind: 'uups' });
  await nft.ownerMint(alice.address, 2);
  await nft.ownerMint(bob.address, 1);
  await nft.connect(alice).setApprovalForAll(vault.target, true);
  await nft.connect(bob).setApprovalForAll(vault.target, true);
  const token = await upgrades.deployProxy(await ethers.getContractFactory('OBNToken'), [
    owner.address, amount('1000000000'), ...Array(5).fill(owner.address),
  ], { kind: 'uups' });
  const extend = await (await ethers.getContractFactory('ExtendOliveBranch')).deploy(token.target, owner.address);
  const offering = await (await ethers.getContractFactory('TheOffering')).deploy(token.target, extend.target, owner.address);
  const pools = await upgrades.deployProxy(await ethers.getContractFactory('contracts/StakingPoolsV93.sol:OBNStakingPools'), [
    token.target, offering.target, extend.target,
  ], { kind: 'uups' });
  await token.setMinterOnce(pools.target);
  await pools.migrateV93(offering.target, extend.target, owner.address);
  await pools.addPool(nonprofit.address);
  for (const voter of [alice, bob]) {
    await token.transfer(voter.address, amount('10000'));
    await token.connect(voter).approve(pools.target, ethers.MaxUint256);
    await pools.connect(voter).deposit(0, amount('100'));
  }
  const legacy = await upgrades.deployProxy(await ethers.getContractFactory('AnnualGovernance'), [
    token.target, pools.target, offering.target, extend.target, owner.address, admin.address, 50,
  ], { kind: 'uups' });
  await offering.setGovernance(legacy.target);
  await extend.setGovernance(legacy.target);
  await extend.setApprovedNonprofit(nonprofit.address, true);
  return { owner, admin, alice, bob, nonprofit, nft, vault, token, extend, offering, pools, legacy };
}
async function upgrade(f) {
  const factory = await ethers.getContractFactory('AnnualGovernanceV2');
  await upgrades.validateUpgrade(f.legacy.target, factory, { kind: 'uups' });
  const gov = await upgrades.upgradeProxy(f.legacy.target, factory, {
    kind: 'uups', call: { fn: 'initializeNFTVoting', args: [f.vault.target] },
  });
  await f.vault.bindGovernance(gov.target);
  return gov;
}
async function start(f, governance) {
  return governance.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
}

async function ready() {
  const f = await fixture(); f.gov = await upgrade(f);
  await f.vault.connect(f.alice).deposit(1);
  return f;
}
async function finishPhase1(f, burn) {
  const id = await f.gov.currentCycleId();
  await f.gov.connect(f.alice).castOfferingVote(id, burn);
  await time.increaseTo((await f.gov.getCycleSummary(id)).phase1End + BigInt(DAY));
  await f.gov.connect(f.bob).executeCurrentCycle();
}
async function finishPhase2(f) {
  const id = await f.gov.currentCycleId();
  await f.gov.connect(f.alice).castNonprofitVote(id, f.nonprofit.address);
  await time.increaseTo((await f.gov.getCycleSummary(id)).phase2End);
  await f.gov.connect(f.bob).executeCurrentCycle();
}

describe('Phase 1 start is the monetary cutoff for both funds', function () {
  for (const burn of [true, false]) {
    it(`${burn ? 'BURN' : 'GIVE'} excludes receipts during both phases and delayed execution; next cycle captures leftovers`, async function () {
      const f = await loadFixture(ready);
      await f.token.transfer(f.offering.target, amount('100'));
      await f.token.transfer(f.extend.target, amount('200'));
      await expect(start(f, f.gov)).to.emit(f.gov, 'CycleFundsSnapshotted').withArgs(1, amount('100'), amount('200'));
      expect(await f.gov.getCycleFundSnapshot(1)).to.deep.equal([amount('100'), amount('200'), true]);
      expect(await f.gov.getPhase2Allocation(1)).to.deep.equal([0n, false]);
      await f.token.transfer(f.offering.target, amount('17'));
      await f.token.transfer(f.extend.target, amount('23'));
      const supply = await f.token.totalSupply();
      await finishPhase1(f, burn);
      const payout = amount(burn ? '200' : '300');
      expect(await f.gov.getPhase2Allocation(1)).to.deep.equal([payout, true]);
      expect(await f.token.balanceOf(f.offering.target)).to.equal(amount('17'));
      expect(await f.token.totalSupply()).to.equal(supply - (burn ? amount('100') : 0n));
      await expect(f.gov.executePhase1(1)).to.be.revertedWith('not ready for phase1 execution');
      await f.token.transfer(f.offering.target, amount('11'));
      await f.token.transfer(f.extend.target, amount('13'));
      await finishPhase2(f);
      expect(await f.token.balanceOf(f.nonprofit.address)).to.equal(payout);
      expect(await f.token.balanceOf(f.offering.target)).to.equal(amount('28'));
      expect(await f.token.balanceOf(f.extend.target)).to.equal(amount('36'));
      await start(f, f.gov);
      expect(await f.gov.getCycleFundSnapshot(2)).to.deep.equal([amount('28'), amount('36'), true]);
      await finishPhase1(f, false); await finishPhase2(f);
      expect(await f.token.balanceOf(f.nonprofit.address)).to.equal(payout + amount('64'));
      expect(await f.token.balanceOf(f.offering.target)).to.equal(0);
      expect(await f.token.balanceOf(f.extend.target)).to.equal(0);
    });
    it(`${burn ? 'BURN' : 'GIVE'} preserves a zero start allocation despite later receipts`, async function () {
      const f = await loadFixture(ready);
      await start(f, f.gov);
      await f.token.transfer(f.offering.target, amount('20'));
      await f.token.transfer(f.extend.target, amount('30'));
      await finishPhase1(f, burn);
      expect(await f.gov.getCycleFundSnapshot(1)).to.deep.equal([0n, 0n, true]);
      expect(await f.gov.getPhase2Allocation(1)).to.deep.equal([0n, true]);
      await finishPhase2(f);
      expect(await f.token.balanceOf(f.nonprofit.address)).to.equal(0);
      expect(await f.token.balanceOf(f.offering.target)).to.equal(amount('20'));
      expect(await f.token.balanceOf(f.extend.target)).to.equal(amount('30'));
    });
  }
  it('rolls back shortfalls in both phases and retries the original allocations after replenishment', async function () {
    const f = await loadFixture(ready);
    await f.token.transfer(f.offering.target, amount('100'));
    await f.token.transfer(f.extend.target, amount('200'));
    await start(f, f.gov);
    await f.gov.connect(f.alice).castOfferingVote(1, false);
    await f.offering.emergencySweep(f.token.target, f.owner.address);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
    await expect(f.gov.connect(f.bob).executeCurrentCycle()).to.be.revertedWith('phase1 allocation underfunded');
    expect((await f.gov.getCycleSummary(1)).phase1Executed).to.equal(false);
    expect((await f.gov.getCycleSummary(1)).phase2End).to.equal(0);
    expect(await f.gov.getPhase2Allocation(1)).to.deep.equal([0n, false]);
    await f.token.transfer(f.offering.target, amount('107'));
    await f.gov.connect(f.bob).executeCurrentCycle();
    expect(await f.gov.getPhase2Allocation(1)).to.deep.equal([amount('300'), true]);
    expect(await f.token.balanceOf(f.offering.target)).to.equal(amount('7'));
    await f.gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address);
    await f.extend.emergencySweep(f.token.target, f.owner.address);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase2End);
    await expect(f.gov.connect(f.bob).executeCurrentCycle()).to.be.revertedWith('phase2 allocation underfunded');
    expect((await f.gov.getCycleSummary(1)).phase2Executed).to.equal(false);
    await f.token.transfer(f.extend.target, amount('309'));
    await f.gov.connect(f.bob).executeCurrentCycle();
    expect(await f.token.balanceOf(f.nonprofit.address)).to.equal(amount('300'));
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount('9'));
  });
  it('cancellation moves no funds and a replacement cycle snapshots all available balances', async function () {
    const f = await loadFixture(ready);
    await f.token.transfer(f.offering.target, amount('10'));
    await f.token.transfer(f.extend.target, amount('20'));
    await start(f, f.gov);
    await f.token.transfer(f.offering.target, amount('3'));
    await f.token.transfer(f.extend.target, amount('4'));
    await f.gov.cancelCycle(1);
    await expect(f.gov.executePhase1(1)).to.be.revertedWith('not ready for phase1 execution');
    await start(f, f.gov);
    expect(await f.gov.getCycleFundSnapshot(1)).to.deep.equal([amount('10'), amount('20'), true]);
    expect(await f.gov.getCycleFundSnapshot(2)).to.deep.equal([amount('13'), amount('24'), true]);
  });
  it('zero participation burns only the original Offering amount and rolls over all Extend funds', async function () {
    const f = await loadFixture(ready);
    await f.token.transfer(f.offering.target, amount('10'));
    await f.token.transfer(f.extend.target, amount('20'));
    await start(f, f.gov);
    await f.token.transfer(f.offering.target, amount('3'));
    await f.token.transfer(f.extend.target, amount('4'));
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
    await f.gov.connect(f.bob).executeCurrentCycle();
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase2End);
    await f.gov.connect(f.bob).executeCurrentCycle();
    await start(f, f.gov);
    expect(await f.gov.getCycleFundSnapshot(2)).to.deep.equal([amount('3'), amount('24'), true]);
  });
  it('uses transaction ordering at Phase 1 start for funds, not the previous-block voter snapshot', async function () {
    const f = await loadFixture(ready);
    await f.token.transfer(f.offering.target, amount('100'));
    await ethers.provider.send('evm_setAutomine', [false]);
    try {
      const opts = { gasLimit: 1000000, gasPrice: 2000000000n };
      const before = await f.token.connect(f.bob).transfer(f.offering.target, amount('10'), opts);
      const cycle = await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY, opts);
      const after = await f.token.connect(f.bob).transfer(f.offering.target, amount('20'), opts);
      await mine();
      await before.wait(); await cycle.wait(); await after.wait();
      expect((await f.gov.getCycleFundSnapshot(1))[0]).to.equal(amount('110'));
      expect(await f.token.balanceOf(f.offering.target)).to.equal(amount('130'));
    } finally { await ethers.provider.send('evm_setAutomine', [true]); }
  });
});

