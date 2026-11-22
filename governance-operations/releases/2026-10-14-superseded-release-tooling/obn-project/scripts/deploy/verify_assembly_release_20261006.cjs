'use strict';
// Explorer publication only: no signer, transaction, compilation or source edits.
const fs=require('fs'),path=require('path');
const {ethers}=require('ethers');
require('dotenv').config({quiet:true});
const release=require('../governance/assembly_release.cjs');
const root=path.resolve(__dirname,'../../../governance-operations/releases/assembly-2026-10-06-remediation');
const dir=path.join(root,'mainnet-deployment');
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
async function api(params){
 await new Promise(resolve=>setTimeout(resolve,600));
 const url=new URL('https://api.etherscan.io/v2/api');
 url.searchParams.set('chainid','8453');url.searchParams.set('apikey',process.env.BASESCAN_API_KEY);
 const response=await fetch(url,{method:'POST',body:new URLSearchParams({module:'contract',...params}),signal:AbortSignal.timeout(30000)});
 assert(response.ok,'Explorer HTTP failure');return response.json();
}
async function poll(action,guid){
 for(let attempt=0;attempt<12;attempt++){
  await new Promise(resolve=>setTimeout(resolve,5000));
  const result=await api({action,guid});
  if(result.status==='1')return;
  assert(/pending|queue/i.test(result.result),'Explorer verification failed: '+String(result.result).slice(0,400));
 }
 throw Error('Explorer verification pending; rerun safely');
}
async function main(){
 assert(process.env.BASESCAN_API_KEY,'Missing explorer credential');
 release.verifyManifest(JSON.parse(fs.readFileSync(path.join(root,'reviewed-manifest.json'))));
 const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));
 const jobs=[];
 for(const name of ['OliveAssembly','AnnualGovernanceV2']){
  const {a,build,sources}=release.artifact(name);
  const input={...build.input,sources:Object.fromEntries([...sources].map(s=>[s,build.input.sources[s]]))};
  jobs.push({name,address:plan.transactions.find(t=>t.name===name).address,input,compiler:build.solcLongVersion,contractname:a.sourceName+':'+name,args:''});
 }
 const b=require('../../node_modules/@openzeppelin/upgrades-core/artifacts/build-info-v5.json');
 const proxy=require('../../node_modules/@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts-v5/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json');
 const creation=plan.transactions.find(t=>t.name==='OliveAssemblyProxy').data;
 assert(creation.startsWith(proxy.bytecode),'Proxy creation mismatch');
 const expected=release.deploymentPlan(plan.addresses.assemblyImplementation).assemblyProxy.data;
 assert(creation===expected,'Proxy initialization mismatch');
 jobs.push({name:'ERC1967Proxy',address:plan.addresses.assemblyProxy,input:b.input,compiler:b.solcLongVersion,contractname:'@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',args:creation.slice(proxy.bytecode.length)});
 if(process.argv[2]==='prepare'){
  console.log(JSON.stringify(jobs.map(j=>({name:j.name,address:j.address,compiler:j.compiler,sources:Object.keys(j.input.sources).length}))));return;
 }
 assert(process.argv[2]==='verify','Mode must be prepare or verify');
 const req=new ethers.FetchRequest(process.env.BASE_MAINNET_URL);req.timeout=20000;
 const p=new ethers.JsonRpcProvider(req,undefined,{batchMaxCount:1});
 try{await release.preflight(p,{assembly:plan.addresses.assemblyProxy,implementation:plan.addresses.governanceImplementation});}finally{p.destroy();}
 const evidence={chainId:8453,checkedAt:new Date().toISOString(),contracts:[]};
 for(const j of jobs){
  let lookup=await api({action:'getsourcecode',address:j.address});
  if(!lookup.result?.[0]?.SourceCode){
   const result=await api({action:'verifysourcecode',contractaddress:j.address,sourceCode:JSON.stringify(j.input),codeformat:'solidity-standard-json-input',contractname:j.contractname,compilerversion:'v'+j.compiler,constructorArguements:j.args,constructorArguments:j.args});
   if(result.status==='1')await poll('checkverifystatus',result.result);
   else assert(/already verified/i.test(result.result),'Explorer submission failed: '+String(result.result).slice(0,400));
   lookup=await api({action:'getsourcecode',address:j.address});
  }
  const source=lookup.result?.[0];
  assert(lookup.status==='1'&&source?.SourceCode&&source.ContractName===j.name,'Explorer source confirmation failed');
  evidence.contracts.push({name:j.name,address:j.address,verified:true,compiler:source.CompilerVersion});
  fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({verified:j.name,address:j.address}));
 }
 const result=await api({action:'verifyproxycontract',address:plan.addresses.assemblyProxy,expectedimplementation:plan.addresses.assemblyImplementation});
 if(result.status==='1')await poll('checkproxyverification',result.result);
 else assert(/already verified/i.test(result.result),'Proxy association submission failed');
 const lookup=await api({action:'getsourcecode',address:plan.addresses.assemblyProxy});
 assert(lookup.result?.[0]?.Implementation?.toLowerCase()===plan.addresses.assemblyImplementation.toLowerCase(),'Explorer proxy association mismatch');
 evidence.assemblyProxyImplementationLinked=true;
 evidence.existingGovernanceProxyUpgradePending=true;
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log('All three sources verified; Assembly proxy linked to reviewed implementation.');
}
main().catch(e=>{const message=String(e.message||'');console.error(message.startsWith('Explorer')||message.startsWith('Proxy')?message:e.code||e.name);process.exitCode=1;});
