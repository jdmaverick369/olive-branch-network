const {expect}=require('chai');
const {ethers,network}=require('hardhat');
const release=require('../scripts/governance/assembly_release.cjs');
describe('Governance release dependency guard audit',function(){
 this.timeout(120000);
 it('demonstrates that a changed staking implementation is not rejected by the current preflight',async function(){
  expect(network.name).to.equal('hardhat');expect((await ethers.provider.getNetwork()).chainId).to.equal(31337n);
  const inspect={getNetwork:async()=>({chainId:8453n}),getBlockNumber:()=>ethers.provider.getBlockNumber(),getStorage:(...a)=>ethers.provider.getStorage(...a),getCode:(...a)=>ethers.provider.getCode(...a),call:(...a)=>ethers.provider.call(...a)};
  const staking=release.PIN.stakingPools,original=await ethers.provider.getStorage(staking,release.SLOT);
  const candidate=await(await ethers.getContractFactory('OBNStakingPoolsV932')).deploy();await candidate.waitForDeployment();
  // Local fault injection only: emulate a separate staking upgrade between checks.
  try{
   await network.provider.send('hardhat_setStorageAt',[staking,release.SLOT,ethers.zeroPadValue(candidate.target,32)]);
   await network.provider.send('evm_mine');
   expect(await ethers.provider.getStorage(staking,release.SLOT)).to.equal(ethers.zeroPadValue(candidate.target,32));
   const result=await release.preflight(inspect);
   expect(result.cycle).to.equal('0');
   console.log('CONFIRMED GAP: existing preflight accepted the V932 implementation with unchanged migration marker; no reinitializer was called.');
  }finally{await network.provider.send('hardhat_setStorageAt',[staking,release.SLOT,original]);await network.provider.send('evm_mine');}
 });
});
