const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { loadFixture, time, mine } = require('@nomicfoundation/hardhat-network-helpers');
const amount = ethers.parseEther;
const DAY = 86400;

async function fixture() {
  const [owner, admin, alice, bob, nonprofit, outsider] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory('OliveNFT')).deploy('Olive', 'OLIVE', '');
  const assembly = await upgrades.deployProxy(await ethers.getContractFactory('OliveAssembly'), [nft.target, owner.address], { kind: 'uups' });
  const token = await upgrades.deployProxy(await ethers.getContractFactory('OBNToken'), [
    owner.address, amount('1000000000'), ...Array(5).fill(owner.address),
  ], { kind: 'uups' });
  const extend = await (await ethers.getContractFactory('ExtendOliveBranch')).deploy(token.target, owner.address);
  const offering = await (await ethers.getContractFactory('TheOffering')).deploy(token.target, extend.target, owner.address);
  let pools = await upgrades.deployProxy(await ethers.getContractFactory('contracts/StakingPools.sol:OBNStakingPools'), [
    token.target, offering.target, extend.target,
  ], { kind: 'uups' });
  await token.setMinterOnce(pools.target);
  await pools.addPool(nonprofit.address);
  for (const voter of [alice, bob]) {
    await token.transfer(voter.address, amount('10000'));
    await token.connect(voter).approve(pools.target, ethers.MaxUint256);
    await pools.connect(voter).deposit(0, amount('100'));
    await nft.ownerMint(voter.address, 1);
    await nft.connect(voter).setApprovalForAll(assembly.target, true);
  }
  // Genuine lazy-checkpoint migration: the stake existed before checkpoint support.
  pools = await upgrades.upgradeProxy(pools.target, await ethers.getContractFactory('OBNStakingPoolsV931'), {
    kind: 'uups', call: { fn: 'migrateV93', args: [offering.target, extend.target, owner.address] },
  });
  const legacy = await upgrades.deployProxy(await ethers.getContractFactory('AnnualGovernance'), [
    token.target, pools.target, offering.target, extend.target, owner.address, admin.address, 50,
  ], { kind: 'uups' });
  await offering.setGovernance(legacy.target);
  await extend.setGovernance(legacy.target);
  await extend.setApprovedNonprofit(nonprofit.address, true);
  const gov = await upgrades.upgradeProxy(legacy.target, await ethers.getContractFactory('AnnualGovernanceV2'), {
    kind: 'uups', call: { fn: 'initializeNFTVoting', args: [assembly.target] },
  });
  await assembly.bindGovernance(gov.target);
  await assembly.connect(alice).deposit(1);
  await assembly.connect(bob).deposit(2);
  return { owner, admin, alice, bob, nonprofit, outsider, nft, assembly, token, extend, offering, pools, gov };
}

describe('Assembly adversarial integration audit', function () {
  for (const compact of [false, true]) it(`prepares bounded ballot batches across removed history (removed=${compact})`, async function () {
    const f = await loadFixture(fixture);
    await f.gov.setMaxBallotSize(100);
    const charities = [f.nonprofit.address];
    for (let i = 1; i < 100; i++) {
      const address = ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(200000 + i), 20));
      charities.push(address);
      await f.extend.setApprovedNonprofit(address, true);
      await f.pools.addPool(address);
    }
    await f.gov.syncPoolIndex(100);
    if (compact) {
      for (const charity of charities) await f.pools.addPool(charity);
      await f.gov.syncPoolIndex(100);
      for (let i = 1; i <= 100; i++) await f.pools.removePool(i);
    }
    for (const charity of charities) await f.pools.addPool(charity);
    const estimate = await f.gov.connect(f.admin).startAnnualCycle.estimateGas(30 * DAY, 30 * DAY);
    expect(estimate).to.be.lessThan(16000000n);
    const receipt = await (await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY, {gasLimit: 16000000})).wait();
    expect(receipt.gasUsed).to.be.lessThan(16000000n); // local regression budget, not a claim about chain limits
    while (!(await f.gov.getCyclePreparation(1))[2]) await f.gov.executeCurrentCycle();
    expect(await f.gov.getBallot(1)).to.deep.equal(charities);
    console.log(`    expanded gas: compaction=${compact}, start=${receipt.gasUsed}, estimatedRequired=${estimate}`);
  });
  it('reports live registration and power independently from snapshot participation', async function () {
    const f = await loadFixture(fixture);
    expect(await f.assembly.registeredCount()).to.equal(2);
    expect(await f.gov.getCurrentVoterInfo(f.alice.address)).to.deep.equal([1n, amount('100'), amount('10'), true]);
    expect(await f.pools.checkpointCount(f.alice.address)).to.equal(0);
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    expect(await f.gov.getCycleParticipation(1)).to.deep.equal([2n, 0n, 0n, 0n, true]);
    await f.gov.connect(f.alice).castOfferingVote(1, false);
    await f.pools.connect(f.alice).deposit(0, amount('300'));
    expect((await f.gov.getCurrentVoterInfo(f.alice.address))[2]).to.equal(amount('20'));
    expect((await f.gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('10'));
    await f.assembly.connect(f.alice).withdrawExpected(1, f.alice.address);
    expect(await f.assembly.registeredCount()).to.equal(1);
    expect((await f.gov.getCurrentVoterInfo(f.alice.address))[2]).to.equal(0);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
    await f.gov.executeCurrentCycle();
    await f.gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address);
    expect(await f.gov.getCycleParticipation(1)).to.deep.equal([2n, 1n, 1n, amount('10'), true]);
    expect((await f.gov.getPhase2Result(1))[3]).to.equal(false);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase2End);
    await f.gov.executeCurrentCycle();
    const result = await f.gov.getPhase2Result(1);
    expect(result[0]).to.equal(f.nonprofit.address);
    expect(result.slice(2)).to.deep.equal([false, true, true]);
    expect((await f.gov.getCycleParticipation(0))[4]).to.equal(false);
  });

  it('rejects a stale token-specific withdrawal after an authorized registration changes', async function () {
    const f = await loadFixture(fixture);
    await f.nft.ownerMint(f.alice.address, 1);
    await f.assembly.connect(f.alice).withdrawExpected(1, f.alice.address);
    await f.assembly.connect(f.alice).deposit(3);
    await expect(f.assembly.connect(f.alice).withdrawExpected(1, f.bob.address))
      .to.be.revertedWithCustomError(f.assembly, 'RegistrationChanged');
    expect(await f.nft.ownerOf(3)).to.equal(f.assembly.target);
    expect(await f.assembly.registeredCount()).to.equal(2);
  });

  it('indexes historical pools in bounded batches without changing ballot order', async function () {
    const f = await loadFixture(fixture);
    for (let i = 0; i < 105; i++) {
      await f.pools.addPool(f.nonprofit.address);
      await f.pools.removePool(i + 1);
    }
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    await expect(f.gov.syncPoolIndex(101)).to.be.revertedWith('invalid index batch');
    await f.gov.connect(f.outsider).prepareBallot(1,100);
    expect((await f.gov.getCyclePreparation(1))[0]).to.equal(106);
    expect(await f.gov.getBallot(1)).to.deep.equal([f.nonprofit.address]);
  });

  it('permits more than 200 active pools without any ballot cap setting', async function () {
    const f = await loadFixture(fixture);
    for (let i = 1; i < 301; i++) await f.pools.addPool(f.nonprofit.address);
    await f.gov.setMaxBallotSize(1); // legacy setting cannot truncate the new ballot
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY,30 * DAY);
    expect((await f.gov.getCyclePreparation(1))[0]).to.equal(100);
    while (!(await f.gov.getCyclePreparation(1))[2]) await f.gov.executeCurrentCycle();
    expect((await f.gov.getCyclePreparation(1))[0]).to.equal(301);
    expect(await f.gov.getBallot(1)).to.deep.equal([f.nonprofit.address]);
  });

  it('preserves genuine pre-migration stake for lazy voting and a first post-snapshot balance change', async function () {
    const f = await loadFixture(fixture);
    expect(await f.pools.checkpointCount(f.alice.address)).to.equal(0);
    expect(await f.pools.checkpointCount(f.bob.address)).to.equal(0);
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    expect(await f.gov.getVotingPowerForCycle(1, f.alice.address)).to.deep.equal([0n, false]);
    await expect(f.gov.connect(f.alice).castOfferingVote(1, false))
      .to.emit(f.gov, 'OfferingVoteCast').withArgs(1, f.alice.address, false, amount('10'));
    await f.pools.connect(f.bob).withdraw(0, amount('25'));
    await f.pools.connect(f.bob).deposit(0, amount('300'));
    await expect(f.gov.connect(f.bob).castOfferingVote(1, false))
      .to.emit(f.gov, 'OfferingVoteCast').withArgs(1, f.bob.address, false, amount('10'));
    await f.assembly.connect(f.alice).withdraw();
    await f.pools.connect(f.alice).withdraw(0, amount('100'));
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
    await f.gov.executeCurrentCycle();
    for (const voter of [f.alice, f.bob]) {
      await expect(f.gov.connect(voter).castNonprofitVote(1, f.nonprofit.address))
        .to.emit(f.gov, 'NonprofitVoteCast').withArgs(1, voter.address, f.nonprofit.address, amount('10'));
    }
  });

  it('cannot recycle snapshot stake between registered wallets or use post-snapshot deposits as historical power', async function () {
    const f = await loadFixture(fixture);
    await f.pools.connect(f.bob).withdraw(0, amount('100'));
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    await f.pools.connect(f.alice).withdraw(0, amount('100'));
    await f.token.connect(f.alice).transfer(f.bob.address, amount('100'));
    await f.pools.connect(f.bob).deposit(0, amount('100'));
    await expect(f.gov.connect(f.alice).castOfferingVote(1, false))
      .to.emit(f.gov, 'OfferingVoteCast').withArgs(1, f.alice.address, false, amount('10'));
    await expect(f.gov.connect(f.bob).castOfferingVote(1, false)).to.be.revertedWith('no voting power at snapshot');
    expect(await f.gov.hasVotedPhase1(1, f.bob.address)).to.equal(false);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
    await f.gov.executeCurrentCycle();
    await expect(f.gov.connect(f.bob).castNonprofitVote(1, f.nonprofit.address)).to.be.revertedWith('no voting power at snapshot');
    expect(await f.gov.hasVotedPhase2(1, f.bob.address)).to.equal(false);
  });

  it('freezes a single recipient when one NFT changes registrants several times in the snapshot block', async function () {
    const f = await loadFixture(fixture);
    await f.assembly.connect(f.bob).withdraw();
    await ethers.provider.send('evm_setAutomine', [false]);
    try {
      const withdrawals = await f.assembly.connect(f.alice).withdrawTo(f.bob.address, { gasLimit: 500000 });
      const deposit = await f.assembly.connect(f.bob).deposit(1, { gasLimit: 500000 });
      await mine();
      await withdrawals.wait();
      const receipt = await deposit.wait();
      await mine();
      expect(await f.assembly.getPastRegistration(f.alice.address, receipt.blockNumber)).to.equal(0);
      expect(await f.assembly.getPastRegistration(f.bob.address, receipt.blockNumber)).to.equal(1);
      expect(await f.assembly.getPastRegisteredCount(receipt.blockNumber)).to.equal(1);
    } finally {
      await ethers.provider.send('evm_setAutomine', [true]);
    }
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    await expect(f.gov.connect(f.alice).castOfferingVote(1, true)).to.be.revertedWith('NFT not registered at snapshot');
    await expect(f.gov.connect(f.bob).castOfferingVote(1, true))
      .to.emit(f.gov, 'OfferingVoteCast').withArgs(1, f.bob.address, true, amount('10'));
  });

  it('enforces exact phase deadlines and rolls back vote flags on late or premature votes', async function () {
    const f = await loadFixture(fixture);
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    await expect(f.gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address)).to.be.revertedWith('phase2 not open');
    expect(await f.gov.hasVotedPhase2(1, f.alice.address)).to.equal(false);
    await time.setNextBlockTimestamp((await f.gov.getCycleSummary(1)).phase1End);
    await expect(f.gov.connect(f.alice).castOfferingVote(1, true)).to.be.revertedWith('phase1 not open');
    expect(await f.gov.hasVotedPhase1(1, f.alice.address)).to.equal(false);
    await f.gov.connect(f.outsider).executeCurrentCycle();
    await time.setNextBlockTimestamp((await f.gov.getCycleSummary(1)).phase2End);
    await expect(f.gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address)).to.be.revertedWith('phase2 not open');
    expect(await f.gov.hasVotedPhase2(1, f.alice.address)).to.equal(false);
    await f.gov.connect(f.outsider).executeCurrentCycle();
    expect(await f.gov.getCycleState(1)).to.equal(5);
    await expect(f.gov.executeCurrentCycle()).to.be.revertedWith('cycle not ready for execution');
  });

  it('documents that dependency upgrades remain an owner trust boundary during active voting', async function () {
    const f = await loadFixture(fixture);
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    const assemblyNext = await (await ethers.getContractFactory('OliveAssembly')).deploy();
    await expect(f.assembly.upgradeToAndCall(assemblyNext.target, '0x')).to.be.revertedWithCustomError(f.assembly, 'CycleInProgress');
    const poolsNext = await (await ethers.getContractFactory('OBNStakingPoolsV931')).deploy();
    const tokenNext = await (await ethers.getContractFactory('OBNToken')).deploy();
    await expect(f.pools.connect(f.outsider).upgradeToAndCall(poolsNext.target, '0x')).to.be.revertedWithCustomError(f.pools, 'OwnableUnauthorizedAccount');
    await expect(f.token.connect(f.outsider).upgradeToAndCall(tokenNext.target, '0x')).to.be.revertedWithCustomError(f.token, 'OwnableUnauthorizedAccount');
    await expect(f.pools.upgradeToAndCall(poolsNext.target, '0x')).to.emit(f.pools, 'Upgraded');
    await expect(f.token.upgradeToAndCall(tokenNext.target, '0x')).to.emit(f.token, 'Upgraded');
    expect(await f.gov.getCycleState(1)).to.equal(1);
    await expect(f.gov.connect(f.alice).castOfferingVote(1, true))
      .to.emit(f.gov, 'OfferingVoteCast').withArgs(1, f.alice.address, true, amount('10'));
  });

  it('starts and settles a 100-nonprofit ballot within the local block budget and uses the first tied recipient', async function () {
    const f = await loadFixture(fixture);
    await f.gov.setMaxBallotSize(100);
    const ballot = [f.nonprofit.address];
    for (let i = 1; i < 100; i++) {
      const address = ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(100000 + i), 20));
      ballot.push(address);
      await f.pools.addPool(address);
      await f.extend.setApprovedNonprofit(address, true);
    }
    await f.token.transfer(f.extend.target, amount('30'));
    const start = await (await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY)).wait();
    expect(start.gasUsed).to.be.lessThan(15000000n);
    expect(await f.gov.getBallot(1)).to.deep.equal(ballot);
    await f.gov.connect(f.alice).castOfferingVote(1, false);
    await f.gov.connect(f.bob).castOfferingVote(1, false);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
    await f.gov.executeCurrentCycle();
    await f.gov.connect(f.alice).castNonprofitVote(1, ballot[0]);
    await f.gov.connect(f.bob).castNonprofitVote(1, ballot[99]);
    const [allocation] = await f.gov.getPhase2Allocation(1);
    await f.token.transfer(f.extend.target, amount('20'));
    const before = await f.token.balanceOf(ballot[0]);
    await time.increaseTo((await f.gov.getCycleSummary(1)).phase2End);
    const settlement = await (await f.gov.executeCurrentCycle()).wait();
    expect(settlement.gasUsed).to.be.lessThan(15000000n);
    expect(await f.token.balanceOf(ballot[0]) - before).to.equal(allocation);
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount('20'));
    console.log(`    100-ballot gas: start=${start.gasUsed}, settle=${settlement.gasUsed}`);
  });

  it('rejects millisecond durations while preserving withdrawals', async function () {
    const f = await loadFixture(fixture);
    for (const invalid of [0, DAY, 30 * DAY - 1, 30 * DAY + 1]) {
      await expect(f.gov.connect(f.admin).startAnnualCycle(invalid, 30 * DAY)).to.be.revertedWith('phase1 must be 30 days');
      await expect(f.gov.connect(f.admin).startAnnualCycle(30 * DAY, invalid)).to.be.revertedWith('phase2 must be 30 days');
    }
    await expect(f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY * 1000)).to.be.revertedWith('phase2 must be 30 days');
    await expect(f.gov.connect(f.admin).startAnnualCycle(30 * DAY + 1, 30 * DAY)).to.be.revertedWith('phase1 must be 30 days');
    await f.gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY);
    const startBlock = await ethers.provider.getBlock('latest');
    expect((await f.gov.getCycleSummary(1)).phase1End).to.equal(startBlock.timestamp + 30 * DAY);
    await f.assembly.connect(f.alice).withdrawExpected(1, f.alice.address);
    expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
  });
});

module.exports = { fixture };
