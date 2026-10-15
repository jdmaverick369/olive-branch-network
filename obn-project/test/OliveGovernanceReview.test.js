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

// Accepted economic behavior plus regressions for the reviewed security fixes.
describe('NFT governance security review reproductions', function () {
  it('one controller can double weight by splitting 400 OBN across four registered wallets', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    const signers = await ethers.getSigners();
    const carol = signers[5], dan = signers[6];
    await f.nft.connect(f.alice).transferFrom(f.alice.address, carol.address, 2);
    await f.nft.ownerMint(dan.address, 1);
    for (const voter of [carol, dan]) {
      await f.token.transfer(voter.address, amount('100'));
      await f.token.connect(voter).approve(f.pools.target, amount('100'));
      await f.pools.connect(voter).deposit(0, amount('100'));
      await f.nft.connect(voter).setApprovalForAll(f.vault.target, true);
    }
    const voters = [f.alice, f.bob, carol, dan];
    for (const [i, tokenId] of [1, 3, 2, 4].entries()) {
      await f.vault.connect(voters[i]).deposit(tokenId);
    }
    await start(f, gov);
    for (const voter of voters) await gov.connect(voter).castOfferingVote(1, true);
    const consolidatedWeight = await gov.squareRootVotingPower(amount('400'));
    expect(consolidatedWeight).to.equal(amount('20'));
    expect((await gov.getCycleSummary(1)).burnVotes).to.equal(consolidatedWeight * 2n);
  });

  it('blocks both vault and governance upgrades during an active cycle', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    const nextGov = await (await ethers.getContractFactory('AnnualGovernanceV2')).deploy();
    await expect(gov.upgradeToAndCall(nextGov.target, '0x')).to.be.revertedWith('upgrade: cycle in progress');
    const nextVault = await (await ethers.getContractFactory('OliveAssembly')).deploy();
    await expect(f.vault.upgradeToAndCall(nextVault.target, '0x')).to.be.revertedWithCustomError(f.vault, 'CycleInProgress');
    expect(await gov.getCycleState(1)).to.equal(1);
  });

  it('recovers an unsafe transfer through owner review without creating voting rights', async function () {
    const f = await loadFixture(fixture);
    await f.nft.connect(f.alice).transferFrom(f.alice.address, f.vault.target, 1);
    expect(await f.nft.ownerOf(1)).to.equal(f.vault.target);
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(0);
    expect(await f.vault.depositorOf(1)).to.equal(ethers.ZeroAddress);
    await expect(f.vault.connect(f.alice).withdraw()).to.be.revertedWithCustomError(f.vault, 'NotRegistered');
    await expect(f.vault.connect(f.alice).withdrawTo(f.alice.address)).to.be.revertedWithCustomError(f.vault, 'NotRegistered');
    await expect(f.vault.connect(f.alice).deposit(1)).to.be.revertedWithCustomError(f.vault, 'NotTokenOwner');
    await f.vault.recoverUnregisteredNFT(f.nft.target, 1, f.alice.address, ethers.id('transfer evidence'));
    expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
    expect(await f.vault.checkpointCount(f.alice.address)).to.equal(0);
  });

  it('rejects zero-registration cycles and preserves the zero-participation burn policy', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.token.transfer(f.offering.target, amount('100'));
    const supply = await f.token.totalSupply();
    await expect(start(f, gov)).to.be.revertedWith('no registrations at snapshot');
    await f.vault.connect(f.bob).deposit(3);
    await start(f, gov);
    await expect(gov.connect(f.alice).castOfferingVote(1, false)).to.be.revertedWith('NFT not registered at snapshot');
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    await gov.executePhase1(1);
    expect(await f.token.balanceOf(f.offering.target)).to.equal(0);
    expect(await f.token.totalSupply()).to.equal(supply - amount('100'));
  });

  it('permits direct mint while registered but still returns the deposited NFT safely', async function () {
    const f = await loadFixture(fixture);
    await f.nft.setSaleActive(true);
    await f.vault.connect(f.bob).deposit(3);
    await f.nft.connect(f.bob).mint({ value: await f.nft.MINT_PRICE() });
    expect(await f.nft.balanceOf(f.bob.address)).to.equal(1);
    await f.vault.connect(f.bob).withdraw();
    expect(await f.nft.balanceOf(f.bob.address)).to.equal(2);
    expect(await f.nft.ownerOf(3)).to.equal(f.bob.address);
  });
});



describe('NFT governance recovery and rollout hardening', function () {
  const evidence = ethers.id('reviewed original transfer transaction');
  it('owner rotates the direct-start voteAdmin without giving that role upgrade or owner privileges', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    await expect(gov.connect(f.admin).setVoteAdmin(f.bob.address))
      .to.be.revertedWithCustomError(gov, 'OwnableUnauthorizedAccount');
    const next = await (await ethers.getContractFactory('AnnualGovernanceV2')).deploy();
    await expect(gov.connect(f.admin).upgradeToAndCall(next.target, '0x'))
      .to.be.revertedWithCustomError(gov, 'OwnableUnauthorizedAccount');
    await gov.setVoteAdmin(f.bob.address);
    await expect(start(f, gov)).to.be.revertedWith('not voteAdmin');
    await expect(gov.startAnnualCycle(30 * DAY, 30 * DAY)).to.be.revertedWith('not voteAdmin');
    // No activation, Timelock scheduling, or time increase before the new admin starts.
    await expect(gov.connect(f.bob).startAnnualCycle(30 * DAY, 30 * DAY)).to.emit(gov, 'CycleStarted');
    expect(await gov.currentCycleId()).to.equal(1);
  });
  it('one direct voteAdmin start permits keeper execution of both phases, fixed allocation, and persistent registration next year', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    await time.increase(365 * DAY);
    expect(await gov.currentCycleId()).to.equal(0); // The annual period is not an open ballot.
    await f.token.transfer(f.extend.target, amount('100'));
    for (const caller of [f.owner, f.alice]) {
      await expect(gov.connect(caller).startAnnualCycle(30 * DAY, 30 * DAY))
        .to.be.revertedWith('not voteAdmin');
    }
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('10'));
    await gov.connect(f.alice).castOfferingVote(1, true);
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    expect((await gov.getCycleSummary(1)).phase2End).to.equal(0);
    await time.increase(2 * DAY); // Delayed keeper execution preserves the full Phase 2 window.
    const transition = await (await gov.connect(f.bob).executeCurrentCycle()).wait();
    const block = await ethers.provider.getBlock(transition.blockNumber);
    expect((await gov.getCycleSummary(1)).phase2End).to.equal(block.timestamp + 30 * DAY);
    expect(await gov.getPhase2Allocation(1)).to.deep.equal([amount('100'), true]);
    await f.token.transfer(f.extend.target, amount('50'));
    await gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address);
    await time.increaseTo((await gov.getCycleSummary(1)).phase2End);
    await gov.connect(f.bob).executeCurrentCycle(); // Final settlement remains permissionless.
    expect(await f.token.balanceOf(f.nonprofit.address)).to.equal(amount('100'));
    expect(await f.token.balanceOf(f.extend.target)).to.equal(amount('50'));
    await f.pools.connect(f.alice).deposit(0, amount('300'));
    await time.increase(365 * DAY);
    expect(await gov.currentCycleId()).to.equal(1);
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(1);
    expect(await f.vault.checkpointCount(f.alice.address)).to.equal(1);
    await start(f, gov);
    expect(await gov.isNFTEligibleForCycle(2, f.alice.address)).to.equal(true);
    expect((await gov.getVotingPowerForCycle(2, f.alice.address))[0]).to.equal(amount('20'));
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('10'));
    await gov.connect(f.alice).castOfferingVote(2, false);
  });
  it('restricts recovery to owner and excludes registered OliveNFTs even with a claimed evidence hash', async function () {
    const f = await loadFixture(fixture);
    await f.vault.connect(f.alice).deposit(1);
    await expect(f.vault.connect(f.bob).recoverUnregisteredNFT(f.nft.target, 1, f.bob.address, evidence))
      .to.be.revertedWithCustomError(f.vault, 'OwnableUnauthorizedAccount');
    await expect(f.vault.recoverUnregisteredNFT(f.nft.target, 1, f.owner.address, evidence))
      .to.be.revertedWithCustomError(f.vault, 'RegisteredToken');
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(1);
    expect(await f.vault.depositorOf(1)).to.equal(f.alice.address);
    await f.vault.connect(f.alice).withdraw();
    expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
  });

  it('validates recovery custody, recipient and evidence; rejected receipts do not lose custody', async function () {
    const f = await loadFixture(fixture);
    await expect(f.vault.recoverUnregisteredNFT(f.nft.target, 1, f.alice.address, evidence))
      .to.be.revertedWithCustomError(f.vault, 'NotTokenOwner');
    const transfer = await f.nft.connect(f.alice).transferFrom(f.alice.address, f.vault.target, 1);
    for (const recipient of [ethers.ZeroAddress, f.vault.target]) {
      await expect(f.vault.recoverUnregisteredNFT(f.nft.target, 1, recipient, transfer.hash))
        .to.be.revertedWithCustomError(f.vault, 'InvalidRecipient');
    }
    await expect(f.vault.recoverUnregisteredNFT(f.nft.target, 1, f.alice.address, ethers.ZeroHash))
      .to.be.revertedWithCustomError(f.vault, 'MissingTransferEvidence');
    const rejector = await (await ethers.getContractFactory('GovernanceVaultReceiver')).deploy();
    await rejector.setReject(true);
    await expect(f.vault.recoverUnregisteredNFT(f.nft.target, 1, rejector.target, transfer.hash)).to.be.revertedWith('receiver rejected');
    expect(await f.nft.ownerOf(1)).to.equal(f.vault.target);
    await expect(f.vault.recoverUnregisteredNFT(f.nft.target, 1, f.alice.address, transfer.hash))
      .to.emit(f.vault, 'UnregisteredNFTRecovered').withArgs(f.nft.target, 1, f.alice.address, transfer.hash);
    await mine();
    expect(await f.vault.getPastRegisteredCount((await ethers.provider.getBlockNumber()) - 1)).to.equal(0);
  });

  it('recovers a foreign collection with the same token ID without touching a registered OliveNFT', async function () {
    const f = await loadFixture(fixture);
    await f.vault.connect(f.alice).deposit(1);
    const other = await (await ethers.getContractFactory('OliveNFT')).deploy('Other', 'OTHER', '');
    await other.ownerMint(f.alice.address, 1);
    const transfer = await other.connect(f.alice).transferFrom(f.alice.address, f.vault.target, 1);
    await f.vault.recoverUnregisteredNFT(other.target, 1, f.alice.address, transfer.hash);
    expect(await other.ownerOf(1)).to.equal(f.alice.address);
    expect(await f.nft.ownerOf(1)).to.equal(f.vault.target);
    expect(await f.vault.depositorOf(1)).to.equal(f.alice.address);
  });

  it('requires only one-time vault binding, with no separate activation or waiting period', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrades.upgradeProxy(f.legacy.target, await ethers.getContractFactory('AnnualGovernanceV2'), {
      kind: 'uups', call: { fn: 'initializeNFTVoting', args: [f.vault.target] },
    });
    await expect(start(f, gov)).to.be.revertedWith('vault not bound');
    await expect(f.vault.connect(f.bob).bindGovernance(gov.target)).to.be.revertedWithCustomError(f.vault, 'OwnableUnauthorizedAccount');
    await expect(f.vault.bindGovernance(f.alice.address)).to.be.revertedWithCustomError(f.vault, 'InvalidGovernance');
    await f.vault.bindGovernance(gov.target);
    await expect(f.vault.bindGovernance(gov.target)).to.be.revertedWithCustomError(f.vault, 'GovernanceAlreadyBound');
    await f.vault.connect(f.alice).deposit(1);
    await f.vault.connect(f.alice).withdraw();
    await expect(start(f, gov)).to.be.revertedWith('no registrations at snapshot');
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    await f.vault.connect(f.alice).withdraw();
    await gov.connect(f.alice).castOfferingVote(1, true);
  });

  it('blocks vault upgrades in all four active states and permits them after completion/cancellation', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    const next = await (await ethers.getContractFactory('OliveAssembly')).deploy();
    await start(f, gov);
    const blocked = async state => {
      expect(await gov.getCycleState(await gov.currentCycleId())).to.equal(state);
      await expect(f.vault.upgradeToAndCall(next.target, '0x')).to.be.revertedWithCustomError(f.vault, 'CycleInProgress');
    };
    await blocked(1);
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    await blocked(2);
    await gov.executePhase1(1);
    await blocked(3);
    await f.vault.connect(f.alice).withdraw();
    await f.vault.connect(f.alice).deposit(1);
    await gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address);
    await time.increaseTo((await gov.getCycleSummary(1)).phase2End);
    await blocked(4);
    await gov.executePhase2(1);
    await expect(f.vault.upgradeToAndCall(next.target, '0x')).to.emit(f.vault, 'Upgraded');
    await start(f, gov);
    await gov.cancelCycle(2);
    await expect(f.vault.upgradeToAndCall(next.target, '0x')).to.emit(f.vault, 'Upgraded');
    expect(await f.vault.governance()).to.equal(gov.target);
    expect(await gov.isNFTEligibleForCycle(1, f.alice.address)).to.equal(true);
  });

  it('fails closed on unavailable governance for upgrades while allowing depositor withdrawal', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.vault.connect(f.alice).deposit(1);
    const next = await (await ethers.getContractFactory('OliveAssembly')).deploy();
    await ethers.provider.send('hardhat_setCode', [gov.target, '0x']);
    await expect(f.vault.upgradeToAndCall(next.target, '0x')).to.be.reverted;
    await f.vault.connect(f.alice).withdraw();
    expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
  });

  it('counts end-of-block registrations and never lets an empty same-block registration start a cycle', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await ethers.provider.send('evm_setAutomine', [false]);
    try {
      const deposit = await f.vault.connect(f.alice).deposit(1, { gasLimit: 600000 });
      const cycle = await gov.connect(f.admin).startAnnualCycle(30 * DAY, 30 * DAY, { gasLimit: 1000000 });
      await mine();
      await deposit.wait();
      expect((await ethers.provider.getTransactionReceipt(cycle.hash)).status).to.equal(0);
      expect(await gov.currentCycleId()).to.equal(0);
    } finally { await ethers.provider.send('evm_setAutomine', [true]); }
    const registeredBlock = await ethers.provider.getBlockNumber();
    await f.vault.connect(f.alice).withdraw();
    await mine();
    expect(await f.vault.getPastRegisteredCount(registeredBlock)).to.equal(1);
    expect(await f.vault.getPastRegisteredCount(registeredBlock + 1)).to.equal(0);
    await expect(start(f, gov)).to.be.revertedWith('no registrations at snapshot');
  });
});


describe('Minimum aggregate snapshot stake of 1 OBN', function () {
  it('rejects one wei below the minimum in both phases; a later top-up qualifies only next cycle without re-registration', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.pools.connect(f.alice).withdraw(0, amount('99') + 1n);
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    expect(await gov.isNFTEligibleForCycle(1, f.alice.address)).to.equal(true);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(0);
    await f.pools.connect(f.alice).deposit(0, 1n);
    await expect(gov.connect(f.alice).castOfferingVote(1, false)).to.be.revertedWith('no voting power at snapshot');
    expect(await gov.hasVotedPhase1(1, f.alice.address)).to.equal(false);
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    await gov.connect(f.bob).executeCurrentCycle();
    await expect(gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address)).to.be.revertedWith('no voting power at snapshot');
    expect(await gov.hasVotedPhase2(1, f.alice.address)).to.equal(false);
    await time.increaseTo((await gov.getCycleSummary(1)).phase2End);
    await gov.connect(f.bob).executeCurrentCycle();
    expect(await f.vault.registeredTokenId(f.alice.address)).to.equal(1);
    expect(await f.vault.checkpointCount(f.alice.address)).to.equal(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(2, f.alice.address))[0]).to.equal(amount('1'));
    await gov.connect(f.alice).castOfferingVote(2, false);
  });

  it('qualifies exactly 1 OBN summed across pools and preserves power after post-snapshot withdrawals', async function () {
    const f = await loadFixture(fixture);
    const gov = await upgrade(f);
    await f.pools.connect(f.alice).withdraw(0, amount('99.6'));
    await f.pools.addPool(f.nonprofit.address);
    await f.pools.connect(f.alice).deposit(1, amount('0.6'));
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('1'));
    await f.pools.connect(f.alice).withdraw(0, amount('0.4'));
    await f.pools.connect(f.alice).withdraw(1, amount('0.6'));
    await expect(gov.connect(f.alice).castOfferingVote(1, true)).to.emit(gov, 'OfferingVoteCast').withArgs(1, f.alice.address, true, amount('1'));
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    await gov.connect(f.bob).executeCurrentCycle();
    await expect(gov.connect(f.alice).castNonprofitVote(1, f.nonprofit.address)).to.emit(gov, 'NonprofitVoteCast').withArgs(1, f.alice.address, f.nonprofit.address, amount('1'));
  });

  it('does not reinterpret fractional stake or recorded votes in historical linear cycles', async function () {
    const f = await loadFixture(fixture);
    await f.pools.connect(f.alice).withdraw(0, amount('99.5'));
    await start(f, f.legacy);
    await f.legacy.connect(f.alice).castOfferingVote(1, true);
    await f.legacy.cancelCycle(1);
    const gov = await upgrade(f);
    expect((await gov.getVotingPowerForCycle(1, f.alice.address))[0]).to.equal(amount('0.5'));
    expect((await gov.getCycleSummary(1)).burnVotes).to.equal(amount('0.5'));
    await f.vault.connect(f.alice).deposit(1);
    await start(f, gov);
    expect((await gov.getVotingPowerForCycle(2, f.alice.address))[0]).to.equal(0);
  });
});
