const {expect}=require('chai');
const {ethers,network}=require('hardhat');
const release=require('../scripts/governance/assembly_release.cjs');
describe('Governance release dependency guard audit',function(){
 this.timeout(120000);
 it('rejects a changed staking implementation and altered runtime at the reviewed address',async function(){
  expect(network.name).to.equal('hardhat');expect((await ethers.provider.getNetwork()).chainId).to.equal(31337n);
  const inspect={getNetwork:async()=>({chainId:8453n}),getBlockNumber:()=>ethers.provider.getBlockNumber(),getStorage:(...a)=>ethers.provider.getStorage(...a),getCode:(...a)=>ethers.provider.getCode(...a),call:(...a)=>ethers.provider.call(...a)};
  const staking=release.PIN.stakingPools,original=await ethers.provider.getStorage(staking,release.SLOT);
  const candidate=await(await ethers.getContractFactory('OBNStakingPoolsV932')).deploy();await candidate.waitForDeployment();
  // Local fault injection only: emulate a separate staking upgrade between checks.
  try{
   await network.provider.send('hardhat_setStorageAt',[staking,release.SLOT,ethers.zeroPadValue(candidate.target,32)]);
   await network.provider.send('evm_mine');
   expect(await ethers.provider.getStorage(staking,release.SLOT)).to.equal(ethers.zeroPadValue(candidate.target,32));
   let failure;try{await release.preflight(inspect);}catch(e){failure=e;}
   expect(failure?.message).to.equal('Unexpected staking implementation');
  }finally{await network.provider.send('hardhat_setStorageAt',[staking,release.SLOT,original]);await network.provider.send('evm_mine');}
  const impl=release.PIN.stakingImplementation,code=await ethers.provider.getCode(impl);
  try{
   await network.provider.send('hardhat_setCode',[impl,await ethers.provider.getCode(candidate.target)]);
   await network.provider.send('evm_mine');
   let failure;try{await release.preflight(inspect);}catch(e){failure=e;}
   expect(failure?.message).to.equal('Staking implementation runtime hash mismatch');
  }finally{await network.provider.send('hardhat_setCode',[impl,code]);await network.provider.send('evm_mine');}
  expect((await release.preflight(inspect)).cycle).to.equal('0');
 });
});
