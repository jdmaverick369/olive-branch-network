const { expect } = require('chai');
const { ethers, network, artifacts, upgrades } = require('hardhat');
const { impersonateAccount, setBalance, time } = require('@nomicfoundation/hardhat-network-helpers');
const fs = require('node:fs');
const path = require('node:path');

// Uses only an in-memory Hardhat fork. Never sends a transaction to Base.
(process.env.FORK_MAINNET === 'true' ? describe : describe.skip)('Exact V9.3.1 Safe release rehearsal', function () {
  this.timeout(600000);
  it('preserves live state and legacy behavior through the exact scheduled deployed implementation', async function () {
    expect(network.name).to.equal('hardhat');
    const record = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../governance-operations/2026-09-24-staking-v931-autoclaim-record.json')));
    const schedule = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../governance-operations/2026-09-24-staking-v931-autoclaim-schedule.json')));
    const { proxy, implementation, timelock, safe, executor } = record;
    const forkBlock = await ethers.provider.getBlockNumber();
    expect(forkBlock).to.be.greaterThan(record.deployment.blockNumber);
    const oldArtifact = await artifacts.readArtifact('contracts/StakingPoolsV93.sol:OBNStakingPools');
    const nextArtifact = await artifacts.readArtifact('OBNStakingPoolsV931');
    const oldInterface = new ethers.Interface(oldArtifact.abi), nextInterface = new ethers.Interface(nextArtifact.abi);
    for (const fn of oldInterface.fragments.filter(f => ['function','event','error'].includes(f.type))) {
      const matching = nextInterface.fragments.find(f => f.type === fn.type && f.format('sighash') === fn.format('sighash'));
      expect(matching, `preserved ABI: ${fn.format('sighash')}`).to.not.equal(undefined);
      expect(matching.format('full')).to.equal(fn.format('full'));
    }
    expect(ethers.keccak256(await ethers.provider.getCode(implementation))).to.equal(record.verification.runtimeCodeHash);
    await upgrades.validateUpgrade(await ethers.getContractFactory('contracts/StakingPoolsV93.sol:OBNStakingPools'), await ethers.getContractFactory('OBNStakingPoolsV931'), {kind:'uups'});
    const staking = new ethers.Contract(proxy, nextArtifact.abi, ethers.provider);
    expect(await staking.version()).to.equal('9.3');
    const token = await ethers.getContractAt('OBNToken', await staking.stakingToken());
    const lens = await ethers.getContractAt('OBNStakingLens', '0x2ae4df523040c0245a6F84342E4B06850c5bdb9b');
    const annual = await ethers.getContractAt('AnnualGovernance', '0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270');
    expect(await lens.stakingPools()).to.equal(proxy);
    expect(await annual.stakingPools()).to.equal(proxy);
    const tl = new ethers.Contract(timelock, [
      'function scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)',
      'function executeBatch(address[],uint256[],bytes[],bytes32,bytes32) payable',
      'function isOperationDone(bytes32) view returns(bool)',
      'function getTimestamp(bytes32) view returns(uint256)',
    ], ethers.provider);
    expect(schedule.chainId).to.equal('8453');
    expect(schedule.transactions.length).to.equal(1);
    expect(schedule.transactions[0].to).to.equal(timelock);
    expect(schedule.transactions[0].value).to.equal('0');
    const [targets,values,data,pred,salt,delay] = tl.interface.parseTransaction(schedule.transactions[0]).args;
    expect([...targets]).to.deep.equal([proxy]);
    expect([...values]).to.deep.equal([0n]);
    expect(pred).to.equal(ethers.ZeroHash); expect(delay).to.equal(86400n);
    const upgrade = nextInterface.parseTransaction({data:data[0]});
    expect(upgrade.name).to.equal('upgradeToAndCall'); expect(upgrade.args[0]).to.equal(implementation);
    expect(nextInterface.parseTransaction({data:upgrade.args[1]}).args[0]).to.equal(executor);
    const count = Number(await staking.poolLength());
    const pools = await Promise.all(Array.from({length:count},(_,i)=>staking.poolInfo(i)));
    const [freshUser] = await ethers.getSigners();
    const treasury = await staking.treasury(), charityFund = await staking.charityFund();
    const users = [...new Set([...pools.map(p=>p.charityWallet),safe,treasury,charityFund,record.deployment.from,freshUser.address])];
    let charityPid;
    for (let pid=0;pid<count;pid++) if (await staking.userAmount(pid,pools[pid].charityWallet)>0n) { charityPid=pid; break; }
    expect(charityPid).to.not.equal(undefined);
    const charityUser=pools[charityPid].charityWallet;
    const openPids=[];
    for(let pid=0;pid<count;pid++) if(!await staking.poolRemoved(pid))openPids.push(pid);
    expect(openPids.length).to.be.greaterThan(1);
    for (const address of [safe,executor,charityUser]) { await impersonateAccount(address); await setBalance(address,ethers.parseEther('10')); }
    const safeSigner=await ethers.getSigner(safe), charitySigner=await ethers.getSigner(charityUser), executorSigner=await ethers.getSigner(executor);
    const serialize = value => JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
    const userFields=['activePoolCount','totalStakedByUser','totalClaimedByUser','totalDepositedByUser','totalWithdrawnByUser','totalCharityContributedByUser','checkpointCount','stakedSince','cumulativeStakeSeconds'];
    const pairFields=['userAmount','userRewardDebt','lockedAmount','charityContributedByUserInPool'];
    const poolFields=['poolInfo','accRewardPerShare','lastRewardTime','charityAccrued','totalDepositedByPool','totalWithdrawnByPool','totalCharityMintedByPool','uniqueStakersByPool','poolRemoved','poolFullyRemoved'];
    async function snapshotState() {
      const result={globals:{},pools:[],users:{},balances:{}};
      for(const name of ['owner','stakingToken','treasury','charityFund','charityFundOperator','upgradeBlock','globalTotalStaked','uniqueStakersGlobal','poolLength'])result.globals[name]=await staking[name]();
      result.globals.totalSupply=await token.totalSupply();
      result.globals.lens=await lens.getGlobalStats();
      result.globals.annualCycle=await annual.currentCycleId();
      for(let pid=0;pid<count;pid++) {
        const row={};for(const name of poolFields)row[name]=await staking[name](pid);
        row.lens=await lens.getPoolStats(pid); result.pools.push(row);
      }
      for(const user of users) {
        const row={};for(const name of userFields)row[name]=await staking[name](user);
        row.voting=await staking.getPastVotingPower(user,forkBlock-1);
        row.annualVoting=await annual.getVotingPowerForCycle(result.globals.annualCycle,user);
        row.lens=await lens.getUserStats(user); row.positions=[];
        for(let pid=0;pid<count;pid++) {
          const position={};for(const name of pairFields)position[name]=await staking[name](pid,user);
          position.lens=await lens.getUserPoolView(pid,user);row.positions.push(position);
        }
        result.users[user]=row;
      }
      for(const account of [...users,proxy,executor])result.balances[account]=await token.balanceOf(account);
      return serialize(result);
    }
    const root = await network.provider.send('evm_snapshot');
    const startTime = Number((await ethers.provider.getBlock('latest')).timestamp);
    async function branch(upgraded) {
      await network.provider.send('evm_setNextBlockTimestamp',[startTime+1]);
      await (await safeSigner.sendTransaction({to:timelock,data:schedule.transactions[0].data})).wait();
      const ready = Number(await tl.getTimestamp(record.schedule.operationId));
      await network.provider.send('evm_setNextBlockTimestamp',[ready]);
      if(upgraded) {
        await (await tl.connect(freshUser).executeBatch([...targets],[...values],[...data],pred,salt)).wait();
        expect(await tl.isOperationDone(record.schedule.operationId)).to.equal(true);
        expect(await staking.version()).to.equal('9.3.1');
        expect(await staking.autoClaimExecutor()).to.equal(executor);
        expect(await staking.owner()).to.equal(timelock);
        for(const user of users) expect(await staking.autoClaimPreference(user)).to.deep.equal([false,0n]);
      } else await network.provider.send('evm_mine');
      const initial=await snapshotState();
      const receipts=[];
      let logicalTimestamp=ready;
      async function run(send) {
        await network.provider.send('evm_setNextBlockTimestamp',[++logicalTimestamp]);
        const r=await (await send()).wait();
        expect(Number((await ethers.provider.getBlock(r.blockNumber)).timestamp)).to.equal(logicalTimestamp);
        receipts.push(r.logs.map(l=>({address:l.address,topics:[...l.topics],data:l.data})));
      }
      // Legacy manual claims for a real, locked bootstrap position.
      await run(()=>staking.connect(charitySigner).claim(charityPid));
      await expect(staking.connect(charitySigner).withdraw.staticCall(charityPid,1)).to.be.revertedWith('amount exceeds unlocked');
      expect(await token.balanceOf(charityUser)).to.be.greaterThan(ethers.parseEther('4'));
      await run(()=>token.connect(charitySigner).transfer(freshUser.address,ethers.parseEther('4')));
      await run(()=>token.connect(freshUser).approve(proxy,ethers.MaxUint256));
      await run(()=>staking.connect(freshUser).deposit(openPids[0],ethers.parseEther('1')));
      await run(()=>staking.connect(freshUser).deposit(openPids[1],ethers.parseEther('1')));
      logicalTimestamp+=3600;
      await run(()=>staking.connect(freshUser).claim(openPids[0]));
      await run(()=>staking.connect(freshUser).claimMultiple(openPids.slice(0,2)));
      await run(()=>staking.connect(freshUser).withdraw(openPids[0],ethers.parseEther('0.5')));
      await run(()=>staking.connect(freshUser).withdraw(openPids[1],ethers.parseEther('1')));
      expect(await staking.userAmount(openPids[0],freshUser.address)).to.equal(ethers.parseEther('0.5'));
      expect(await staking.userAmount(openPids[1],freshUser.address)).to.equal(0);
      expect(await token.balanceOf(proxy)).to.be.at.least(await staking.globalTotalStaked());
      return {initial,final:await snapshotState(),receipts};
    }
    console.log(`Fork block ${forkBlock}: comparing ${count} pools and ${users.length} representative wallets`);
    const baseline=await branch(false);
    console.log('Baseline transactions and state capture complete');
    await network.provider.send('evm_revert',[root]);
    const upgraded=await branch(true);
    fs.writeFileSync(path.resolve(__dirname,'../cache/v931-preschedule-comparison.json'),JSON.stringify({baseline,upgraded},null,2));
    expect(upgraded.initial,'state immediately after upgrade versus unchanged V9.3 at the same timestamp').to.deep.equal(baseline.initial);
    expect(upgraded.final,'state after identical legacy transactions').to.deep.equal(baseline.final);
    expect(upgraded.receipts,'legacy events and mint destinations').to.deep.equal(baseline.receipts);
    console.log('Exact Safe upgrade and differential legacy state/events passed');
    // New entry point on the actual deployed implementation, with the real executor address.
    await staking.connect(freshUser).deposit(openPids[1],ethers.parseEther('0.5'));
    await staking.connect(freshUser).setAutoClaimEnabled(true);
    await time.increase(3600);
    const month=await staking.currentAutoClaimMonth();
    const beforeStake=await staking.totalStakedByUser(freshUser.address);
    const executorBalance=await token.balanceOf(executor);
    await expect(staking.connect(freshUser).autoClaimFor(openPids.slice(0,2),freshUser.address,month,1)).to.be.revertedWithCustomError(staking,'NotAutoClaimExecutor');
    const autoReceipt=await (await staking.connect(executorSigner).autoClaimFor(openPids.slice(0,2),freshUser.address,month,1)).wait();
    for(const pid of openPids.slice(0,2)) expect(await staking.lastAutoClaimMonth(pid,freshUser.address)).to.equal(month);
    expect(await staking.totalStakedByUser(freshUser.address)).to.equal(beforeStake);
    expect(await token.balanceOf(executor)).to.equal(executorBalance);
    await expect(staking.connect(executorSigner).autoClaimFor(openPids.slice(0,2),freshUser.address,month,1)).to.be.revertedWithCustomError(staking,'NoClaimableRewards');
    await staking.connect(freshUser).setAutoClaimEnabled(false);
    await expect(staking.connect(executorSigner).autoClaimFor(openPids.slice(0,2),freshUser.address,month,1)).to.be.revertedWithCustomError(staking,'AutoClaimDisabled');
    await staking.connect(freshUser).claimMultiple(openPids.slice(0,2));
    await staking.connect(freshUser).withdraw(openPids[0],ethers.parseEther('0.5'));
    await staking.connect(freshUser).withdraw(openPids[1],ethers.parseEther('0.5'));
    expect(await staking.activePoolCount(freshUser.address)).to.equal(0);
    const result={checkedAt:new Date().toISOString(),forkBlock,implementation,scheduleOperationId:record.schedule.operationId,poolsCompared:count,walletsCompared:users.length,legacyAbiPreserved:true,exactSafeUpgradePassed:true,differentialStateAndEventsEqual:true,lockedWithdrawalRejected:true,manualClaimDepositWithdrawPassed:true,autoClaimMultiPoolPassed:true,optOutEnforced:true,fullExitAfterAutoClaimPassed:true,autoClaimGas:String(autoReceipt.gasUsed),transactionsSentToMainnet:0};
    fs.writeFileSync(path.resolve(__dirname,'../../governance-operations/v931-preschedule-fork-review.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  });
});
