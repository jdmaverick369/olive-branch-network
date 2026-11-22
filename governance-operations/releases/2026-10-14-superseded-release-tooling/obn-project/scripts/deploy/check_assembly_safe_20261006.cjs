'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {ethers}=require('ethers');require('dotenv').config({quiet:true});
const r=require('../governance/assembly_release.cjs');
const dir=path.resolve(__dirname,'../../../governance-operations/releases/assembly-2026-10-06-remediation/mainnet-deployment');
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f)));
(async()=>{
 const plan=read('plan.json'),schedule=read('safe/01-schedule.safe.json'),execute=read('safe/02-execute-direct.json');
 assert.equal(schedule.chainId,'8453');assert.equal(schedule.meta.createdFromSafeAddress,r.PIN.voteAdmin);
 assert.equal(schedule.transactions.length,1);
 const tx=schedule.transactions[0];assert.equal(tx.to,r.PIN.owner);assert.equal(tx.value,'0');
 assert.equal(execute.to,r.PIN.owner);assert.equal(execute.value,'0');assert.equal(execute.chainId,'8453');
 const abi=['function scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)','function executeBatch(address[],uint256[],bytes[],bytes32,bytes32)','function hashOperationBatch(address[],uint256[],bytes[],bytes32,bytes32) view returns(bytes32)','function getMinDelay() view returns(uint256)','function hasRole(bytes32,address) view returns(bool)','function isOperation(bytes32) view returns(bool)'];
 const i=new ethers.Interface(abi),s=i.decodeFunctionData('scheduleBatch',tx.data),e=i.decodeFunctionData('executeBatch',execute.data);
 assert.equal(s[5],86400n);assert.equal(s[3],ethers.ZeroHash);
 assert.deepEqual(Array.from(s[0]),[r.PIN.governance,plan.addresses.assemblyProxy]);
 assert.deepEqual(Array.from(s[1]),[0n,0n]);
 assert.equal(i.encodeFunctionData('executeBatch',Array.from(s).slice(0,5)),execute.data);
 const gov=new ethers.Interface(r.artifact('AnnualGovernanceV2').a.abi);
 const upgrade=gov.decodeFunctionData('upgradeToAndCall',s[2][0]);
 assert.equal(upgrade[0],plan.addresses.governanceImplementation);
 assert.equal(gov.decodeFunctionData('initializeNFTVoting',upgrade[1])[0],plan.addresses.assemblyProxy);
 const assembly=new ethers.Interface(r.artifact('OliveAssembly').a.abi);
 assert.equal(assembly.decodeFunctionData('bindGovernance',s[2][1])[0],r.PIN.governance);
 const request=new ethers.FetchRequest(process.env.BASE_MAINNET_URL);request.timeout=20000;
 const p=new ethers.JsonRpcProvider(request,undefined,{batchMaxCount:1});
 try{
  const checked=await r.preflight(p,{assembly:plan.addresses.assemblyProxy,implementation:plan.addresses.governanceImplementation});
  const tl=new ethers.Contract(r.PIN.owner,abi,p);
  const id=await tl.hashOperationBatch(...s.toArray(true).slice(0,5));
  assert.equal(id,execute.operationId);assert.equal(await tl.getMinDelay(),86400n);
  assert(await tl.hasRole(ethers.id('PROPOSER_ROLE'),r.PIN.voteAdmin));
  assert(await tl.hasRole(ethers.id('EXECUTOR_ROLE'),ethers.ZeroAddress));
  assert.equal(await tl.isOperation(id),false);
  const result={status:'SAFE CALLDATA CHECKED; NOT SCHEDULED',operationId:id,delaySeconds:86400,openExecution:true,...checked,assembly:plan.addresses.assemblyProxy,governanceImplementation:plan.addresses.governanceImplementation};
  fs.writeFileSync(path.join(dir,'safe-calldata-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{p.destroy();}
})().catch(e=>{console.error('Safe check failed:',e.code||e.name);if(e.code==='ERR_ASSERTION')console.error(JSON.stringify({actual:e.actual,expected:e.expected},(_,v)=>typeof v==='bigint'?String(v):v));process.exitCode=1;});
