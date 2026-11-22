'use strict';
// Authorized scope: three CREATE transactions only. No proxy upgrade, Safe/Timelock
// scheduling, ownership changes, cycle start, or frontend deployment.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
require('dotenv').config({quiet:true});
process.env.HARDHAT_CONFIG=path.resolve(__dirname,'../../hardhat.nft-voting.config.cjs');
const hre=require('hardhat'),{ethers}=require('ethers');
const release=require('../governance/assembly_release.cjs');
const root=path.resolve(__dirname,'../../../governance-operations/releases/assembly-2026-10-06-remediation');
const dir=path.join(root,'mainnet-deployment');
const manifestFile=path.join(root,'reviewed-manifest.json');
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function save(file,value){const p=path.join(dir,file);fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(p+'.tmp',p);}
async function main(){
 const mode=process.argv[2];assert(['plan','deploy','check'].includes(mode),'Mode must be plan, deploy or check');
 release.verifyManifest(JSON.parse(fs.readFileSync(manifestFile)));
 const base=release.artifact('AnnualGovernance').a,v2=release.artifact('AnnualGovernanceV2').a,asm=release.artifact('OliveAssembly').a;
 await hre.upgrades.validateUpgrade(new ethers.ContractFactory(base.abi,base.bytecode),new ethers.ContractFactory(v2.abi,v2.bytecode),{kind:'uups'});
 await hre.upgrades.validateImplementation(new ethers.ContractFactory(asm.abi,asm.bytecode),{kind:'uups'});
 assert(process.env.BASE_MAINNET_URL&&process.env.PRIVATE_KEY,'Missing deployment RPC or signer configuration');
 const req=new ethers.FetchRequest(process.env.BASE_MAINNET_URL);req.timeout=20000;
 const p=new ethers.JsonRpcProvider(req,undefined,{batchMaxCount:1,cacheTimeout:-1});
 try{
  const checks=await release.preflight(p);
  const signer=new ethers.Wallet(process.env.PRIVATE_KEY.startsWith('0x')?process.env.PRIVATE_KEY:'0x'+process.env.PRIVATE_KEY,p);
  fs.mkdirSync(dir,{recursive:true});
  if(mode==='plan'){
   assert(!fs.existsSync(path.join(dir,'plan.json')),'Deployment plan already exists; inspect it rather than overwrite');
   const pending=await p.getTransactionCount(signer.address,'pending'),latest=await p.getTransactionCount(signer.address,'latest');
   assert(pending===latest,'Signer has pending transactions');
   const addresses={assemblyImplementation:ethers.getCreateAddress({from:signer.address,nonce:pending}),governanceImplementation:ethers.getCreateAddress({from:signer.address,nonce:pending+1}),assemblyProxy:ethers.getCreateAddress({from:signer.address,nonce:pending+2})};
   const deployment=release.deploymentPlan(addresses.assemblyImplementation);
   const transactions=[{name:'OliveAssembly',address:addresses.assemblyImplementation,data:asm.bytecode},{name:'AnnualGovernanceV2',address:addresses.governanceImplementation,data:v2.bytecode},{name:'OliveAssemblyProxy',address:addresses.assemblyProxy,data:deployment.assemblyProxy.data}].map((t,i)=>({...t,nonce:pending+i,chainId:8453,value:'0',creationHash:ethers.keccak256(t.data)}));
   const fee=await p.getFeeData(),balance=await p.getBalance(signer.address);
   // Test the existing explorer credential before spending gas. Never print it.
   assert(process.env.BASESCAN_API_KEY,'Missing explorer credential');
   const url=new URL('https://api.etherscan.io/v2/api');
   for(const [k,v]of Object.entries({apikey:process.env.BASESCAN_API_KEY,chainid:'8453',module:'contract',action:'getsourcecode',address:release.PIN.implementation}))url.searchParams.set(k,v);
   const response=await fetch(url,{signal:AbortSignal.timeout(20000)});const body=await response.json();
   assert(response.ok&&body.status==='1'&&Array.isArray(body.result),'Explorer credential/lookup unavailable; no deployment performed');
   const plan={status:'UNSENT CREATION PLAN',chainId:8453,manifestSha256:hash(fs.readFileSync(manifestFile)),signer:signer.address,checks,addresses,transactions,balanceWei:String(balance),maxFeePerGasWei:String(fee.maxFeePerGas||fee.gasPrice||0n),explorerCredentialReadCheck:true};
   save('plan.json',plan);
   console.log(JSON.stringify({status:plan.status,signer:signer.address,balanceETH:ethers.formatEther(balance),feeGwei:ethers.formatUnits(BigInt(plan.maxFeePerGasWei),9),addresses,block:checks.block}));return;
  }
  const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));
  assert(plan.manifestSha256===hash(fs.readFileSync(manifestFile))&&plan.signer===signer.address&&plan.chainId===8453,'Plan baseline/signer mismatch');
  const journalPath=path.join(dir,'receipts.json');const journal=fs.existsSync(journalPath)?JSON.parse(fs.readFileSync(journalPath)):{chainId:8453,transactions:[]};
  if(mode==='deploy'&&journal.transactions.length===0){
   // Check the WHOLE release budget before the first irreversible transaction.
   const fees=await p.getFeeData();let totalGas=500000n;
   assert(fees.maxFeePerGas&&fees.maxFeePerGas<=ethers.parseUnits('1','gwei'),'Unexpected gas price; review before sending');
   for(const item of plan.transactions.slice(0,2))totalGas+=(await signer.estimateGas({data:item.data,value:0n}))*120n/100n;
   assert(await p.getBalance(signer.address)>totalGas*fees.maxFeePerGas+ethers.parseEther('0.0001'),'Insufficient ETH for complete release including data-fee reserve');
  }
  for(const item of plan.transactions){
   const known=journal.transactions.find(t=>t.name===item.name);
   if(known){const receipt=await p.getTransactionReceipt(known.hash);assert(receipt&&receipt.status===1&&receipt.contractAddress===item.address,'Previously submitted transaction unresolved; do not resubmit');continue;}
   assert(mode==='deploy','Deployment incomplete');
   const expectedData=item.name==='OliveAssembly'?asm.bytecode:item.name==='AnnualGovernanceV2'?v2.bytecode:release.deploymentPlan(plan.addresses.assemblyImplementation).assemblyProxy.data;
   assert(item.data===expectedData&&item.creationHash===ethers.keccak256(expectedData)&&item.value==='0','Creation data drift');
   assert(item.address===ethers.getCreateAddress({from:signer.address,nonce:item.nonce}),'Unexpected predicted address');
   assert(await p.getTransactionCount(signer.address,'pending')===item.nonce,'Signer nonce changed');
   await release.preflight(p);
   const fee=await p.getFeeData();assert(fee.maxFeePerGas&&fee.maxFeePerGas<=ethers.parseUnits('1','gwei'),'Unexpected gas price; review before sending');
   const estimated=await signer.estimateGas({data:item.data,value:0n});const gasLimit=estimated*120n/100n;
   assert(gasLimit<16000000n&&gasLimit*fee.maxFeePerGas<ethers.parseEther('0.01'),'Creation exceeds release gas budget');
   assert(await p.getBalance(signer.address)>gasLimit*fee.maxFeePerGas+ethers.parseEther('0.0001'),'Insufficient ETH including data-fee reserve');
   const raw=await signer.signTransaction({type:2,chainId:8453,nonce:item.nonce,data:item.data,value:0n,gasLimit,maxFeePerGas:fee.maxFeePerGas,maxPriorityFeePerGas:fee.maxPriorityFeePerGas||0n});
   const txHash=ethers.keccak256(raw);journal.transactions.push({name:item.name,address:item.address,nonce:item.nonce,hash:txHash,status:'SIGNED; BROADCAST MAY BE PENDING'});save('receipts.json',journal);
   const tx=await p.broadcastTransaction(raw);assert(tx.hash===txHash,'Transaction hash mismatch');
   console.log(JSON.stringify({submitted:item.name,address:item.address,hash:txHash}));
   const receipt=await tx.wait(2,120000);assert(receipt&&receipt.status===1&&receipt.contractAddress===item.address,'Deployment receipt mismatch');
   Object.assign(journal.transactions.at(-1),{status:'CONFIRMED',blockNumber:receipt.blockNumber,gasUsed:String(receipt.gasUsed),feeWei:String(receipt.fee)});save('receipts.json',journal);
  }
  const final=await release.preflight(p,{assembly:plan.addresses.assemblyProxy,implementation:plan.addresses.governanceImplementation});
  save('post-deployment-check.json',{status:'ALL THREE DEPLOYED; EXISTING GOVERNANCE NOT UPGRADED',...final,addresses:plan.addresses});
  console.log(JSON.stringify({status:'DEPLOYED AND ON-CHAIN CHECKED',addresses:plan.addresses,block:final.block}));
 }finally{p.destroy();}
}
main().catch(e=>{const message=String(e.message||'');const safe=/^(Missing|Mode|Deployment|Signer|Explorer|Plan|Creation|Unexpected|Insufficient|Previously|Transaction)/.test(message)&&!message.includes('https:')?message:(e.code||e.name);console.error('Deployment stopped:',safe);process.exitCode=1;});
