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

describe('Olive governance vault and NFT upgrade', function () {
  it('makes the vault owner-upgradeable, locks implementations, and preserves custody/history across upgrade', async function () {
    const f = await loadFixture(fixture);
    await f.vault.connect(f.alice).deposit(1);
    const block = await ethers.provider.getBlockNumber();
    const factory = await ethers.getContractFactory('OliveAssembly');
    const next = await factory.deploy();
    await upgrades.validateUpgrade(f.vault.target, factory, { kind: 'uups' });
    await expect(next.initialize(f.nft.target, f.owner.address)).to.be.revertedWithCustomError(next, 'InvalidInitialization');
    await expect(f.vault.connect(f.bob).upgradeToAndCall(next.target, '0x')).to.be.revertedWithCustomError(f.vault, 'OwnableUnauthorizedAccount');
    await f.vault.upgradeToAndCall(next.target, '0x');
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(1);
    expect(await f.vault.depositorOf(1)).to.equal(f.alice.address);
    expect(await f.vault.getPastRegistration(f.alice.address, block)).to.equal(1);
    expect(await f.vault.oliveNFT()).to.equal(f.nft.target);
    await f.vault.connect(f.alice).withdraw();
    expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
  });

  it('prevents withdrawal reentry and rolls back rejected transfers; depositor can choose a receiver', async function () {
    const f = await loadFixture(fixture);
    const wallet = await (await ethers.getContractFactory('GovernanceVaultReceiver')).deploy();
    await f.nft.ownerMint(wallet.target, 1);
    await wallet.register(f.vault.target, 4);
    await wallet.setReject(true);
    await expect(wallet.withdraw()).to.be.revertedWith('receiver rejected');
    expect(await f.vault.registeredTokenId(wallet.target)).to.equal(4);
    expect(await f.nft.ownerOf(4)).to.equal(f.vault.target);
    await wallet.setReject(false);
    await wallet.withdraw();
    expect(await wallet.reentrySucceeded()).to.equal(false);
    await wallet.register(f.vault.target, 4);
    await wallet.setReject(true);
    await wallet.withdrawTo(f.alice.address);
    expect(await f.nft.ownerOf(4)).to.equal(f.alice.address);
  });

  it('keeps cycle start, registration and voting bounded at the full 20,000 NFT supply', async function () {
    this.timeout(120000);
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.bob).deposit(3);
    const small = await (await start(f, gov)).wait();
    await gov.cancelCycle(1);
    for (let n = 3; n < 20000; n += 100) {
      await f.nft.ownerMint(f.owner.address, Math.min(100, 20000 - n), { gasLimit: 15000000 });
    }
    expect(await f.nft.totalSupply()).to.equal(20000);
    const deposit = await (await f.vault.connect(f.alice).deposit(1)).wait();
    const large = await (await start(f, gov)).wait();
    const vote = await (await gov.connect(f.alice).castOfferingVote(2, true)).wait();
    expect(large.gasUsed).to.be.lessThan(small.gasUsed + 10000n);
    expect(deposit.gasUsed).to.be.lessThan(500000n);
    expect(vote.gasUsed).to.be.lessThan(500000n);
    console.log(`    Full-supply gas: register=${deposit.gasUsed}, start=${large.gasUsed}, vote=${vote.gasUsed}`);
  });

  it('permits one registration, owner-only withdrawal, and return to a wallet holding other NFTs', async function () {
    const f = await loadFixture(fixture);
    await f.vault.connect(f.alice).deposit(1);
    const block = await ethers.provider.getBlockNumber();
    await mine();
    expect(await f.vault.getPastRegistration(f.alice.address, block)).to.equal(1);
    await expect(f.vault.connect(f.alice).deposit(2)).to.be.revertedWithCustomError(f.vault, 'AlreadyRegistered');
    await expect(f.vault.connect(f.bob).withdraw()).to.be.revertedWithCustomError(f.vault, 'NotRegistered');
    await f.vault.connect(f.alice).withdraw();
    expect(await f.nft.balanceOf(f.alice.address)).to.equal(2);
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(0);
    expect(await f.vault.getPastRegistration(f.alice.address, block)).to.equal(1);
    await f.vault.connect(f.alice).deposit(2);
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(2);
  });

  it('rejects unsolicited safe transfers, other collections, and approved operators claiming ownership', async function () {
    const f = await loadFixture(fixture);
    await expect(f.nft.connect(f.alice)['safeTransferFrom(address,address,uint256)'](f.alice.address, f.vault.target, 1))
      .to.be.revertedWithCustomError(f.vault, 'UnexpectedTransfer');
    const other = await (await ethers.getContractFactory('OliveNFT')).deploy('Other', 'NO', '');
    await other.ownerMint(f.alice.address, 1);
    await expect(other.connect(f.alice)['safeTransferFrom(address,address,uint256)'](f.alice.address, f.vault.target, 1))
      .to.be.revertedWithCustomError(f.vault, 'UnexpectedTransfer');
    await f.nft.connect(f.alice).approve(f.bob.address, 1);
    await expect(f.vault.connect(f.bob).deposit(1)).to.be.revertedWithCustomError(f.vault, 'NotTokenOwner');
    await expect(f.vault.getPastRegistration(f.alice.address, await ethers.provider.getBlockNumber()))
      .to.be.revertedWithCustomError(f.vault, 'FutureLookup');
  });

  it('rolls back custody and checkpoints if NFT approval is missing', async function () {
    const f = await loadFixture(fixture);
    await f.nft.connect(f.alice).setApprovalForAll(f.vault.target, false);
    await expect(f.vault.connect(f.alice).deposit(1)).to.be.reverted;
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(0);
    expect(await f.vault.checkpointCount(f.alice.address)).to.equal(0);
    expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
  });

  it('validates storage layout and retains proxy/configuration; initialization is owner-only and one-time', async function () {
    const f = await loadFixture(fixture);
    const factory = await ethers.getContractFactory('AnnualGovernanceV2');
    const gov = await upgrades.upgradeProxy(f.legacy.target, factory, { kind: 'uups' });
    await expect(start(f, gov)).to.be.revertedWith('NFT voting not initialized');
    await expect(gov.connect(f.bob).initializeNFTVoting(f.vault.target)).to.be.revertedWithCustomError(gov, 'OwnableUnauthorizedAccount');
    await expect(gov.initializeNFTVoting(f.bob.address)).to.be.revertedWith('vault has no code');
    const wrongOwnerVault = await upgrades.deployProxy(await ethers.getContractFactory('OliveAssembly'), [f.nft.target, f.bob.address], { kind: 'uups' });
    await expect(gov.initializeNFTVoting(wrongOwnerVault.target)).to.be.revertedWith('vault owner mismatch');
    await gov.initializeNFTVoting(f.vault.target);
    await expect(gov.initializeNFTVoting(f.vault.target)).to.be.revertedWithCustomError(gov, 'InvalidInitialization');
    expect(gov.target).to.equal(f.legacy.target);
    expect(await gov.voteAdmin()).to.equal(f.admin.address);
    expect(await gov.owner()).to.equal(f.owner.address);
    expect(await gov.nftVault()).to.equal(f.vault.target);
    expect(await gov.firstNFTCycleId()).to.equal(1);
  });

  it('requires registered NFT AND stake and uses the same sqrt weight after NFT/stake withdrawals in both phases', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('10'));
    expect((await gov.getVotingPowerForCycle(1, f.bob.address))[0]).to.equal(0);
    await expect(gov.connect(f.bob).castOfferingVote(1, true)).to.be.revertedWith('NFT not registered at snapshot');
    await f.vault.connect(f.alice).withdraw();
    await f.pools.connect(f.alice).withdraw(0, amount('100'));
    await f.nft.connect(f.alice).transferFrom(f.alice.address, f.bob.address, 1);
    await f.vault.connect(f.bob).deposit(1);
    expect(await gov.isNFTEligibleForCycle(1, f.alice.address)).to.equal(true);
    expect(await gov.isNFTEligibleForCycle(1, f.bob.address)).to.equal(false);
    await expect(gov.connect(f.alice).castOfferingVote(1, false)).to.emit(gov, 'OfferingVoteCast').withArgs(1, f.alice.address, false, amount('10'));
    await expect(gov.connect(f.alice).castOfferingVote(1, false)).to.be.revertedWith('already voted phase1');
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    await gov.executePhase1(1);
    await expect(gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address)).to.emit(gov, 'NonprofitVoteCast').withArgs(1, f.alice.address, f.nonprofit.address, amount('10'));
    await expect(gov.connect(f.bob).castNonprofitVote(1, f.nonprofit.address)).to.be.revertedWith('NFT not registered at snapshot');
    await time.increaseTo((await gov.getCycleSummary(1)).phase2End);
    await gov.executePhase2(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(2, f.alice.address))[0]).to.equal(0);
    expect((await gov.getVotingPowerForCycle(2, f.bob.address))[0]).to.equal(amount('10'));
  });

  it('rejects a registered wallet with no stake and a holder withdrawn before the snapshot', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    await f.vault.connect(f.alice).withdraw();
    await f.vault.connect(f.bob).deposit(3);
    await f.pools.connect(f.bob).withdraw(0, amount('100'));
    await start(f, gov);
    await expect(gov.connect(f.alice).castOfferingVote(1, true)).to.be.revertedWith('NFT not registered at snapshot');
    await expect(gov.connect(f.bob).castOfferingVote(1, true)).to.be.revertedWith('no voting power at snapshot');
  });

  it('excludes deposits in the cycle-start block and collapses same-block checkpoint changes', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.bob).deposit(3);
    await ethers.provider.send('evm_setAutomine', [false]);
    try {
      const deposit = await f.vault.connect(f.alice).deposit(1, { gasLimit: 500000 });
      const cycle = await gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY, { gasLimit: 1000000 });
      await mine();
      const receipt = await cycle.wait();
      await deposit.wait();
      expect((await gov.getCycleSummary(1)).snapshotBlock).to.equal(receipt.blockNumber - 1);
      expect(await gov.isNFTEligibleForCycle(1, f.alice.address)).to.equal(false);
    } finally { await ethers.provider.send('evm_setAutomine', [true]); }
    await ethers.provider.send('evm_setAutomine', [false]);
    try {
      const withdrawal = await f.vault.connect(f.alice).withdraw({ gasLimit: 500000 });
      const deposit = await f.vault.connect(f.alice).deposit(2, { gasLimit: 500000 });
      await mine();
      const receipt = await deposit.wait();
      await withdrawal.wait();
      await mine();
      expect(await f.vault.getPastRegistration(f.alice.address, receipt.blockNumber)).to.equal(1);
      expect(await f.vault.checkpointCount(f.alice.address)).to.equal(2);
    } finally { await ethers.provider.send('evm_setAutomine', [true]); }
  });

  it('preserves historical linear power and allocation state, and blocks mid-cycle upgrades', async function () {
    const f = await loadFixture(fixture);
    await start(f, f.legacy);
    await f.legacy.connect(f.alice).castOfferingVote(1, true);
    await expect(upgrade(f)).to.be.revertedWith('upgrade: cycle in progress');
    await time.increaseTo((await f.legacy.getCycleSummary(1)).phase1End);
    await f.legacy.executePhase1(1);
    const allocation = await f.legacy.getPhase2Allocation(1);
    await f.legacy.connect(f.alice).castNonprofitVote(1, f.nonprofit.address);
    await time.increaseTo((await f.legacy.getCycleSummary(1)).phase2End);
    await f.legacy.executePhase2(1);
    const gov = await upgrade(f);
    expect(await gov.firstNFTCycleId()).to.equal(2);
    expect(await gov.getCycleFundSnapshot(1)).to.deep.equal([0n, 0n, false]);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('100'));
    expect((await gov.getCycleSummary(1)).burnVotes).to.equal(amount('100'));
    expect(await gov.getPhase2Allocation(1)).to.deep.equal(allocation);
    expect(await gov.hasVotedPhase2(1, f.alice.address)).to.equal(true);
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(2, f.alice.address))[0]).to.equal(amount('10'));
  });

  it('computes fractional and extreme stake without overflow, with square root applied to aggregate stake', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    expect(await gov.squareRootVotingPower(0)).to.equal(0);
    expect(await gov.squareRootVotingPower(1)).to.equal(0);
    expect(await gov.squareRootVotingPower(amount('0.25'))).to.equal(0);
    expect(await gov.squareRootVotingPower(amount('1') - 1n)).to.equal(0);
    expect(await gov.squareRootVotingPower(amount('1'))).to.equal(amount('1'));
    expect(await gov.MIN_VOTING_STAKE()).to.equal(amount('1'));
    expect(await gov.squareRootVotingPower(amount('10000'))).to.equal(amount('100'));
    // Floor rounding, not nearest rounding, at the smallest square-root increment.
    expect(await gov.squareRootVotingPower(amount('1') + 2000000000n)).to.equal(amount('1'));
    expect(await gov.squareRootVotingPower(amount('1') + 2000000001n)).to.equal(amount('1') + 1000000000n);
    expect(await gov.squareRootVotingPower(ethers.MaxUint256)).to.equal(((1n << 128n) - 1n) * 1000000000n);
    await f.pools.addPool(f.nonprofit.address);
    await f.pools.connect(f.alice).deposit(1, amount('300'));
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('20'));
  });
});
