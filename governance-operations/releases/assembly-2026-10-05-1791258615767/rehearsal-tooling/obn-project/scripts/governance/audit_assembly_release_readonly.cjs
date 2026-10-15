'use strict';
const fs=require('fs'),path=require('path');
const {ethers}=require('ethers');
require('dotenv').config({quiet:true});
const release=require('./assembly_release.cjs');
const root=path.resolve(__dirname,'../../../governance-operations/releases/assembly-2026-10-05-1791258615767');
async function main(){
 release.verifyManifest(JSON.parse(fs.readFileSync(path.join(root,'reviewed-manifest.json'))));
 const req=new ethers.FetchRequest(process.env.BASE_MAINNET_URL||'https://mainnet.base.org');req.timeout=20000;
 const p=new ethers.JsonRpcProvider(req,undefined,{batchMaxCount:1});
 try{
  const checks=await release.preflight(p),block=checks.block,pin=release.PIN;
  const result={checks,blockHash:(await p.getBlock(block)).hash,dependencies:{}};
  for(const [name,address] of Object.entries({staking:pin.stakingPools,offering:pin.theOffering,extend:pin.extendOliveBranch})){
   const code=await p.getCode(address,block),slot=await p.getStorage(address,release.SLOT,block);
   const impl=ethers.getAddress('0x'+slot.slice(-40));
   result.dependencies[name]={address,proxyOrContractCodeHash:ethers.keccak256(code),implementation:impl};
   if(impl!==ethers.ZeroAddress)result.dependencies[name].implementationCodeHash=ethers.keccak256(await p.getCode(impl,block));
   if(name==='staking')result.dependencies[name].version=await new ethers.Contract(address,['function version() view returns(string)'],p).version({blockTag:block});
  }
  const tl=new ethers.Contract(pin.owner,['function hasRole(bytes32,address) view returns(bool)','function getMinDelay() view returns(uint256)'],p);
  result.timelock={openExecutor:await tl.hasRole(ethers.id('EXECUTOR_ROLE'),ethers.ZeroAddress,{blockTag:block}),safeProposer:await tl.hasRole(ethers.id('PROPOSER_ROLE'),pin.voteAdmin,{blockTag:block}),delay:String(await tl.getMinDelay({blockTag:block}))};
  const {Etherscan}=require('@nomicfoundation/hardhat-verify/internal/etherscan');
  const dummy=Etherscan.fromChainConfig('DUMMY-NOT-A-KEY',{network:'base',chainId:8453,urls:{apiURL:'https://api.basescan.org/v2/api',browserURL:'https://basescan.org'}});
  result.verificationTransport={packageVersion:require('@nomicfoundation/hardhat-verify/package.json').version,effectiveApiUrl:dummy.apiUrl,chainId:dummy.chainId,credentialValidityTested:false};
  const old=JSON.parse(fs.readFileSync(path.join(root,'preflight.json')));
  result.matchesRehearsedStaking=result.dependencies.staking.implementation===old.dependencies.staking.implementation&&result.dependencies.staking.version==='9.3.1';
  const file=path.join(root,'final-audit-live-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({file,block,matchesRehearsedStaking:result.matchesRehearsedStaking,timelock:result.timelock,verificationTransport:result.verificationTransport}));
 }finally{p.destroy();}
}
main().catch(e=>{console.error('Read-only audit failed:',e.code||e.name);process.exitCode=1;});
