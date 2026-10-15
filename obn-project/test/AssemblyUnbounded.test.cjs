const {expect}=require('chai');
const {ethers,upgrades}=require('hardhat');
const {time}=require('@nomicfoundation/hardhat-network-helpers');
const {fixture}=require('./AssemblyAdversarialAudit.test.js');
describe('Uncapped governance preparation',function(){
 it('freezes processed recipients while reading unprocessed wallets and removals at their batch',async()=>{
  const f=await fixture();for(let i=1;i<103;i++)await f.pools.addPool(f.nonprofit.address);
  await f.gov.connect(f.admin).startAnnualCycle(2592000,2592000);
  await f.extend.setApprovedNonprofit(f.outsider.address,true);
  await f.pools.updateCharityWallet(0,f.outsider.address); // already processed: cannot rewrite
  await f.pools.updateCharityWallet(100,f.outsider.address); // unprocessed: new wallet is used
  await f.pools.removePool(101);
  await f.gov.prepareBallot(1,3);
  expect(await f.gov.getBallot(1)).to.deep.equal([f.nonprofit.address,f.outsider.address]);
  expect(await f.gov.getCyclePreparation(1)).to.deep.equal([103n,103n,true,2n]);
 });
 it('prepares 350 distinct recipients with bounded calls, excludes new pool IDs and blocks premature settlement',async()=>{
  const f=await fixture();const charities=[f.nonprofit.address];
  for(let i=1;i<350;i++){
   const addr=ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(400000+i),20));charities.push(addr);
   await f.pools.addPool(addr);await f.extend.setApprovedNonprofit(addr,true);
  }
  await f.gov.setMaxBallotSize(1);
  await f.gov.connect(f.admin).startAnnualCycle(2592000,2592000);
  expect(await f.gov.getCyclePreparation(1)).to.deep.equal([100n,350n,false,100n]);
  await f.pools.addPool(f.outsider.address); // excluded even if subsequently approved
  await f.extend.setApprovedNonprofit(f.outsider.address,true);
  await f.gov.connect(f.alice).castOfferingVote(1,false);
  await time.increaseTo((await f.gov.getCycleSummary(1)).phase1End);
  await expect(f.gov.executePhase1(1)).to.be.revertedWith('ballot preparation incomplete');
  await f.extend.setApprovedNonprofit(charities[150],false);
  await expect(f.gov.prepareBallot(1,100)).to.be.revertedWith('ballot address not approved in ExtendOliveBranch');
  expect((await f.gov.getCyclePreparation(1))[0]).to.equal(100);
  await f.extend.setApprovedNonprofit(charities[150],true);
  for(let i=0;i<3;i++)await f.gov.executeCurrentCycle();
  expect(await f.gov.getCyclePreparation(1)).to.deep.equal([350n,350n,true,350n]);
  expect(await f.gov.getBallot(1)).to.deep.equal(charities);
  expect(await f.gov.getBallotPage(1,300,100)).to.deep.equal(charities.slice(300));
  expect(await f.gov.getBallotPage(1,ethers.MaxUint256,100)).to.deep.equal([]);
  await expect(f.gov.getBallotPage(1,0,101)).to.be.revertedWith('invalid page size');
  const opened=await(await f.gov.executeCurrentCycle()).wait();const block=await ethers.provider.getBlock(opened.blockNumber);
  expect((await f.gov.getCycleSummary(1)).phase2End).to.equal(block.timestamp+2592000);
  // The later ballot entry reaches a tally first; the earlier index must win a tie.
  await f.gov.connect(f.bob).castNonprofitVote(1,charities[349]);
  await f.gov.connect(f.alice).castNonprofitVote(1,charities[0]);
  await time.increaseTo((await f.gov.getCycleSummary(1)).phase2End);
  const gas=await f.gov.executeCurrentCycle.estimateGas();expect(gas).to.be.lessThan(1000000n);
  await f.gov.executeCurrentCycle();expect((await f.gov.getPhase2Result(1))[0]).to.equal(charities[0]);
 });
 it('permits cancellation and custody withdrawal during preparation, but forbids upgrades and later preparation',async()=>{
  const f=await fixture();for(let i=1;i<101;i++)await f.pools.addPool(f.nonprofit.address);
  await f.gov.connect(f.admin).startAnnualCycle(2592000,2592000);
  const candidate=await(await ethers.getContractFactory('OliveAssembly')).deploy();
  await expect(f.assembly.upgradeToAndCall(candidate.target,'0x')).to.be.revertedWithCustomError(f.assembly,'CycleInProgress');
  await f.assembly.connect(f.alice).withdraw();
  await f.gov.cancelCycle(1);
  await expect(f.gov.prepareBallot(1,100)).to.be.revertedWith('not preparing phase1');
  expect(await f.nft.ownerOf(1)).to.equal(f.alice.address);
 });
});
