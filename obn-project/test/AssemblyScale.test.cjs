const {expect}=require('chai');
const {ethers}=require('hardhat');
const {time}=require('@nomicfoundation/hardhat-network-helpers');
const {fixture}=require('./AssemblyAdversarialAudit.test.js');

// Explicit opt-in: 20,000 real registrations/stakes and 40,000 votes are expensive to simulate.
// No storage injection, synthetic checkpoint seeding, or mocked governance/staking.
(process.env.RUN_ASSEMBLY_SCALE==='true'?describe:describe.skip)('Assembly full collection scale',function(){
 this.timeout(3600000);
 it('settles 300 active pools and 300 distinct nonprofits with 20,000 eligible voters',async function(){
  const f=await fixture();
  await f.gov.setMaxBallotSize(1); // legacy configuration cannot cap membership
  const charities=[f.nonprofit.address];
  for(let i=1;i<300;i++){
   const charity=ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(300000+i),20));
   charities.push(charity);await f.extend.setApprovedNonprofit(charity,true);
  }
  for(let i=1;i<300;i++)await f.pools.addPool(charities[i]);
  const actors=await(await ethers.getContractFactory('AssemblyScaleActors')).deploy();
  await f.nft.transferOwnership(actors.target);
  await f.token.transfer(actors.target,ethers.parseEther('19998'));
  for(let i=0;i<19998;i+=10){
   await(await actors.create(Math.min(10,19998-i),f.token.target,f.pools.target,f.nft.target,f.assembly.target,{gasLimit:16000000})).wait();
   if(i%2000===0)console.log(`    real registered/staked wallets: ${Math.min(i+12,20000)}`);
  }
  expect(await f.nft.totalSupply()).to.equal(20000);
  expect(await f.nft.balanceOf(f.assembly.target)).to.equal(20000);
  expect(await f.assembly.registeredCount()).to.equal(20000);
  await f.token.transfer(f.extend.target,ethers.parseEther('20'));
  const estimate=await f.gov.connect(f.admin).startAnnualCycle.estimateGas(2592000,2592000);
  expect(estimate).to.be.lessThan(16000000n);
  const start=await(await f.gov.connect(f.admin).startAnnualCycle(2592000,2592000,{gasLimit:16000000})).wait();
  console.log(`    20k voter start: estimatedRequired=${estimate}, receiptGas=${start.gasUsed}`);
  expect((await f.gov.getCycleParticipation(1))[0]).to.equal(20000);
  expect((await f.gov.getCyclePreparation(1))[2]).to.equal(false);
  while (!(await f.gov.getCyclePreparation(1))[2]) {
   const gas=await f.gov.executeCurrentCycle.estimateGas();expect(gas).to.be.lessThan(16000000n);
   await f.gov.executeCurrentCycle();
  }
  expect(await f.gov.getBallot(1)).to.deep.equal(charities);
  await actors.withdraw(0,f.assembly.target);
  expect(await f.assembly.registeredCount()).to.equal(19999);
  expect((await f.gov.getVotingPowerForCycle(1,await actors.actors(0)))[0]).to.equal(ethers.parseEther('1'));
  for(const phase2 of [false,true]){
   for(const voter of [f.alice,f.bob]){
    if(phase2)await f.gov.connect(voter).castNonprofitVote(1,f.nonprofit.address);
    else await f.gov.connect(voter).castOfferingVote(1,false);
   }
   for(let i=0;i<19998;i+=100){
    await(await actors.voteBatch(i,Math.min(i+100,19998),f.gov.target,1,f.nonprofit.address,phase2,{gasLimit:16000000})).wait();
    if(i%5000===0)console.log(`    phase ${phase2?2:1} votes processed: ${Math.min(i+102,20000)}`);
   }
   const participation=await f.gov.getCycleParticipation(1);
   expect(participation[phase2?2:1]).to.equal(20000);
   const summary=await f.gov.getCycleSummary(1);
   await time.increaseTo(phase2?summary.phase2End:summary.phase1End);
   await f.gov.executeCurrentCycle();
  }
  expect((await f.gov.getCycleParticipation(1))[3]).to.equal(ethers.parseEther('20018'));
  const result=await f.gov.getPhase2Result(1);
  expect(result[0]).to.equal(f.nonprofit.address);expect(result[3]).to.equal(true);
  console.log('    all 20,000 distinct registered wallets voted in both phases; withdrawn wallet retained frozen eligibility');
 });
});
