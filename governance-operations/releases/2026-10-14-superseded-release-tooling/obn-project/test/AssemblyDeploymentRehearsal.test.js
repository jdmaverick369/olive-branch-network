const { expect } = require('chai');
const { ethers, upgrades, network, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const GOV = '0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270';
const TIMELOCK = '0x86396526286769ace21982E798Df5eef2389f51c';
const SAFE = '0x066e2FABb036deab7DC58bAde428F819AC3542DD';
const NFT = '0xB66F67444b09f509D72d832567C2df84Edeb80F8';
const EXPECTED_IMPL = '0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3';
const DAY = 86400;

// Opt-in only. Never select a live Hardhat network for this test.
const forkDescribe = network.name === 'hardhat' && network.config.forking ? describe : describe.skip;
forkDescribe('OliveAssembly pinned Base fork deployment rehearsal (local only)', function () {
  this.timeout(240000);
  it('upgrades and binds atomically through the actual Timelock, then settles both phases with the same proxy', async function () {
    expect((await ethers.provider.getNetwork()).chainId).to.equal(31337n);
    expect(network.config.forking.blockNumber).to.equal(52015686);
    const [deployer, voter, keeper] = await ethers.getSigners();
    const legacy = await ethers.getContractAt('AnnualGovernance', GOV);
    expect(await upgrades.erc1967.getImplementationAddress(GOV)).to.equal(EXPECTED_IMPL);
    expect(await legacy.owner()).to.equal(TIMELOCK);
    expect(await legacy.voteAdmin()).to.equal(SAFE);
    expect(await legacy.currentCycleId()).to.equal(0);
    const baseline = await ethers.getContractFactory('AnnualGovernance');
    const candidate = await ethers.getContractFactory('AnnualGovernanceV2');
    await upgrades.validateUpgrade(baseline, candidate, { kind: 'uups' });
    // Check executable baseline, including the UUPS immutable address.
    const { executableBytecode } = require('../scripts/governance/annual_allocation_upgrade_checks');
    const artifact = await artifacts.readArtifact('AnnualGovernance');
    const build = await artifacts.getBuildInfo('contracts/AnnualGovernance.sol:AnnualGovernance');
    let expectedCode = artifact.deployedBytecode;
    for (const refs of Object.values(build.output.contracts['contracts/AnnualGovernance.sol'].AnnualGovernance.evm.deployedBytecode.immutableReferences)) {
      for (const { start, length } of refs) expectedCode = expectedCode.slice(0, 2 + start * 2) + EXPECTED_IMPL.slice(2).toLowerCase().padStart(length * 2, '0') + expectedCode.slice(2 + (start + length) * 2);
    }
    expect(executableBytecode(await ethers.provider.getCode(EXPECTED_IMPL))).to.equal(executableBytecode(expectedCode));
    const assembly = await upgrades.deployProxy(await ethers.getContractFactory('OliveAssembly'), [NFT, TIMELOCK], { kind: 'uups' });
    const implementation = await candidate.deploy();
    const gov = candidate.attach(GOV);
    const timelock = await ethers.getContractAt('OBNTimeLock', TIMELOCK);
    async function impersonate(address) {
      await network.provider.send('hardhat_setBalance', [address, '0x56BC75E2D63100000']);
      return ethers.getImpersonatedSigner(address);
    }
    const safe = await impersonate(SAFE);
    const targets = [GOV, assembly.target];
    const values = [0, 0];
    const data = [gov.interface.encodeFunctionData('upgradeToAndCall', [implementation.target, gov.interface.encodeFunctionData('initializeNFTVoting', [assembly.target])]), assembly.interface.encodeFunctionData('bindGovernance', [GOV])];
    const salt = ethers.id('local-assembly-readiness');
    const delay = await timelock.getMinDelay();
    await timelock.connect(safe).scheduleBatch(targets, values, data, ethers.ZeroHash, salt, delay);
    await expect(timelock.connect(safe).executeBatch(targets, values, data, ethers.ZeroHash, salt)).to.be.reverted;
    await time.increase(delay);
    await timelock.connect(safe).executeBatch(targets, values, data, ethers.ZeroHash, salt);
    expect(await gov.owner()).to.equal(TIMELOCK);
    expect(await gov.voteAdmin()).to.equal(SAFE);
    expect(await gov.nftVault()).to.equal(assembly.target);
    expect(await assembly.governance()).to.equal(GOV);
    expect(await gov.firstNFTCycleId()).to.equal(1);

    const nft = await ethers.getContractAt('OliveNFT', NFT);
    const nftOwner = await impersonate(await nft.owner());
    const minted = await (await nft.connect(nftOwner).ownerMint(voter.address, 1)).wait();
    const transfer = minted.logs.map(log => { try { return nft.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'Transfer' && log.args.to === voter.address);
    expect(transfer).to.not.equal(undefined);
    const tokenId = transfer.args.tokenId;
    await nft.connect(voter).approve(assembly.target, tokenId);
    await assembly.connect(voter).deposit(tokenId);
    const stakingAddress = await gov.stakingPools();
    const token = await ethers.getContractAt('OBNToken', await gov.obn());
    // Local-only stake funding: borrow one OBN from the staking proxy and immediately redeposit.
    const stake = ethers.parseEther('1');
    await token.connect(await impersonate(stakingAddress)).transfer(voter.address, stake);
    const staking = new ethers.Contract(stakingAddress, ['function deposit(uint256,uint256)', 'function withdraw(uint256,uint256)'], voter);
    await token.connect(voter).approve(stakingAddress, stake);
    await staking.deposit(0, stake);
    const offering = await gov.theOffering();
    const extend = await gov.extendOliveBranch();
    const offeringBefore = await token.balanceOf(offering);
    const extendBefore = await token.balanceOf(extend);
    await gov.connect(safe).startAnnualCycle(30 * DAY, 30 * DAY);
    expect(await gov.getCycleFundSnapshot(1)).to.deep.equal([offeringBefore, extendBefore, true]);
    expect((await gov.getVotingPowerForCycle(1, voter.address))[0]).to.equal(stake);
    await assembly.connect(voter).withdraw();
    await staking.withdraw(0, stake);
    await gov.connect(voter).castOfferingVote(1, false);
    await time.increaseTo((await gov.getCycleSummary(1)).phase1End);
    await gov.connect(keeper).executeCurrentCycle();
    expect(await gov.getPhase2Allocation(1)).to.deep.equal([offeringBefore + extendBefore, true]);
    const winner = (await gov.getBallot(1))[0];
    await gov.connect(voter).castNonprofitVote(1, winner);
    const winnerBefore = await token.balanceOf(winner);
    await time.increaseTo((await gov.getCycleSummary(1)).phase2End);
    await gov.connect(keeper).executeCurrentCycle();
    expect(await token.balanceOf(winner)).to.equal(winnerBefore + offeringBefore + extendBefore);
    expect(await gov.getCycleState(1)).to.equal(5);
    expect(await nft.ownerOf(tokenId)).to.equal(voter.address);
    expect(await upgrades.erc1967.getImplementationAddress(GOV)).to.equal(implementation.target);
    console.log('Local fork: Timelock upgrade/bind, direct Safe start, post-snapshot withdrawals, GIVE, and Phase 2 payout passed.');
  });
});
