'use strict';
// Read-only release preparation. This module never creates a signer or sends an RPC transaction.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ethers } = require('ethers');
const ROOT = path.resolve(__dirname, '../..');
const PIN = Object.freeze({ chainId:8453, governance:'0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270', implementation:'0xA6F3A7988ca98313e8aE5401b29CdEb830Fdd6B3',
  implementationHash:'0xf386a46ad43dd21f0ce677cc88341731638844ea02e3d11db230b6672626e9b1',
  baselineExecutableHash:'0xc988c6a6bf6edc5b733d200c2a51c365c9dfa8b363ace9f26cfd7feb4de1e294',
  owner:'0x86396526286769ace21982E798Df5eef2389f51c', voteAdmin:'0x066e2FABb036deab7DC58bAde428F819AC3542DD',
  obn:'0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685', stakingPools:'0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2',
  theOffering:'0xc75B2a5C7B8F88327D44C223769cFa19cc93E341', extendOliveBranch:'0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B',
  nft:'0xB66F67444b09f509D72d832567C2df84Edeb80F8', nftHash:'0xcabdc9aa078301feb3a3e471c4856e2162dc0c7ad176f119db189ca9319cb3a4' });
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const INIT='0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const same = (a,b) => String(a).toLowerCase()===String(b).toLowerCase();
const assert = (condition,message) => { if(!condition) throw Error(message); };
function proxyArtifacts() {
  return [
    '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json',
    '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts-v5/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json',
    '@openzeppelin/contracts/build/contracts/ERC1967Proxy.json',
  ].map(rel=>JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules',rel))));
}
function artifact(name) {
  const file=path.join(ROOT,`artifacts/contracts/${name}.sol/${name}.json`);
  const a=JSON.parse(fs.readFileSync(file));
  const dbg=JSON.parse(fs.readFileSync(file.replace('.json','.dbg.json')));
  const build=JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),dbg.buildInfo)));
  const sources=new Set();
  function visit(source){
    if(sources.has(source))return;
    sources.add(source);
    const ast=build.output.sources[source]?.ast;
    assert(ast,'Missing source AST for '+source);
    for(const node of ast.nodes)if(node.nodeType==='ImportDirective')visit(node.absolutePath);
  }
  visit(a.sourceName);
  for(const source of sources) {
    const input=build.input.sources[source];
    const disk=path.join(ROOT, source.startsWith('@')?'node_modules/'+source:source);
    assert(fs.existsSync(disk) && fs.readFileSync(disk,'utf8')===input.content, `Stale build input: ${source}`);
  }
  return {a,build,sources,output:build.output.contracts[a.sourceName][a.contractName]};
}
function runtime(name,address) {
  const {a,output}=artifact(name);let code=a.deployedBytecode;
  const refs=Object.values(output.evm.deployedBytecode.immutableReferences).flat();
  assert(refs.length>0,'Missing UUPS immutable');
  for(const {start,length}of refs){ assert(length===32,'Unexpected immutable size');const at=2+start*2;code=code.slice(0,at)+address.slice(2).padStart(64,'0')+code.slice(at+64); }
  return code.toLowerCase();
}
function buildManifest() {
  // Compiler metadata includes source line endings. Pin the executable baseline
  // here; preflight separately checks the FULL hash of the actual live runtime.
  const baseline=runtime('AnnualGovernance',PIN.implementation);
  const metadataBytes=parseInt(baseline.slice(-4),16)+2;
  assert(metadataBytes>2 && metadataBytes*2<baseline.length-2,'Invalid baseline metadata');
  assert(ethers.keccak256(baseline.slice(0,-metadataBytes*2))===PIN.baselineExecutableHash,'Local baseline does not match the pinned executable runtime');
  const files={}; const artifacts={};
  for(const name of ['AnnualGovernance','AnnualGovernanceV2','OliveAssembly']){
    const {a,build,sources}=artifact(name); artifacts[name]={creationHash:ethers.keccak256(a.bytecode),runtimeHash:ethers.keccak256(a.deployedBytecode),compiler:build.solcLongVersion,settings:build.input.settings};
    for(const source of sources){
      const rel=source.startsWith('@')?'node_modules/'+source:source;
      files[rel]=hash(fs.readFileSync(path.join(ROOT,rel)));
    }
  }
  for(const rel of ['package.json','package-lock.json','hardhat.config.js','hardhat.nft-voting.config.cjs','scripts/governance/addresses.js','scripts/governance/timelock_safe_helper.js','scripts/governance/check_assembly_readiness.cjs','../.github/workflows/execute_cycle.yml','../.github/workflows/governance-upgrade.yml','keeper/execute.test.cjs','scripts/governance/assembly_release.cjs','scripts/governance/prepare_assembly_upgrade.cjs','scripts/governance/gen_safe_startAnnualCycle.js','scripts/governance/prepare_annual_allocation_upgrade.js','keeper/package.json','keeper/package-lock.json','keeper/execute.cjs'])files[rel]=hash(fs.readFileSync(path.join(ROOT,rel)));
  artifacts.ERC1967Proxy=proxyArtifacts().map(a=>({creationHash:ethers.keccak256(a.bytecode),runtimeHash:ethers.keccak256(a.deployedBytecode)}));
  return {version:1,pins:PIN,files,artifacts};
}
function verifyManifest(manifest) {
  assert(JSON.stringify(manifest)===JSON.stringify(buildManifest()),'Release manifest drift: regenerate and review before proceeding');
}
async function retryRead(read, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      const code = error.info?.error?.code;
      const status = error.status ?? error.response?.statusCode;
      const transient = code === -32016 || code === 429 || status === 429 ||
        (error.code === 'SERVER_ERROR' && (status == null || status >= 500)) ||
        error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR';
      if (!transient || attempt >= 4) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}
async function preflight(provider,{assembly,implementation}={}) {
  assert((await retryRead(() => provider.getNetwork())).chainId===8453n,'Wrong chain');
  const block=await retryRead(() => provider.getBlockNumber());
  async function call(to,signature,args=[]) {
    const abi=new ethers.Interface(['function '+signature]); const fn=abi.fragments[0];
    try {
      const value = await retryRead(() => provider.call({to,data:abi.encodeFunctionData(fn,args),blockTag:block}));
      return abi.decodeFunctionResult(fn,value)[0];
    } catch(error) {
      throw Error(`Read failed: ${signature}; RPC code ${error.info?.error?.code ?? error.code ?? 'unknown'}`);
    }
  }

  const live=ethers.getAddress('0x'+(await retryRead(() => provider.getStorage(PIN.governance,SLOT,block))).slice(-40));
  assert(same(live,PIN.implementation),'Unexpected live governance implementation');
  assert(ethers.keccak256(await retryRead(() => provider.getCode(live,block)))===PIN.implementationHash,'Baseline runtime hash mismatch');
  assert(ethers.keccak256(await retryRead(() => provider.getCode(PIN.nft,block)))===PIN.nftHash,'Collection runtime changed');
  for(const name of ['owner','voteAdmin','obn','stakingPools','theOffering','extendOliveBranch'])assert(same(await call(PIN.governance,`${name}() view returns(address)`),PIN[name]),`Unexpected ${name}`);
  const cycle=await call(PIN.governance,'currentCycleId() view returns(uint256)');
  assert(cycle===0n,'Cycle differs from the reviewed first-cycle release');
  assert(await call(PIN.governance,'getCycleState(uint256) view returns(uint8)',[cycle])===0n,'Governance is not idle');
  // Legacy maxBallotSize storage is retained but no longer restricts the new implementation.
  assert(await call(PIN.owner,'getMinDelay() view returns(uint256)')===86400n,'Unexpected Timelock delay');
  assert(await call(PIN.voteAdmin,'getThreshold() view returns(uint256)')===2n,'Unexpected Safe threshold');
  for(const role of ['PROPOSER_ROLE','EXECUTOR_ROLE']){
    const roleId=ethers.id(role);
    const safeRole=await call(PIN.owner,'hasRole(bytes32,address) view returns(bool)',[roleId,PIN.voteAdmin]);
    const open=role==='EXECUTOR_ROLE' && await call(PIN.owner,'hasRole(bytes32,address) view returns(bool)',[roleId,ethers.ZeroAddress]);
    assert(safeRole || open,`Safe lacks ${role}`);
  }
  for(const fund of ['theOffering','extendOliveBranch'])assert(same(await call(PIN[fund],'governance() view returns(address)'),PIN.governance),`${fund} governance mismatch`);
  const pools=await call(PIN.stakingPools,'poolLength() view returns(uint256)');
  let active=0;const charities=new Set();
  for(let pid=0n;pid<pools;pid++){
    if(await call(PIN.stakingPools,'poolFullyRemoved(uint256) view returns(bool)',[pid]))continue;
    active++;
    const charity=await call(PIN.stakingPools,'getPoolInfo(uint256) view returns(address,uint256)',[pid]);
    if(charity===ethers.ZeroAddress)continue;
    charities.add(charity.toLowerCase());
    assert(await call(PIN.extendOliveBranch,'approvedNonprofit(address) view returns(bool)',[charity]),'Unapproved ballot charity');
  }
  assert(charities.size>0,'Empty ballot');
  assert(await call(PIN.stakingPools,'upgradeBlock() view returns(uint48)')===47348216n,'Unexpected staking migration');
  if(assembly || implementation){
    assert(ethers.isAddress(assembly||'') && ethers.isAddress(implementation||''),'Both candidate addresses required');
    const assemblyImpl=ethers.getAddress('0x'+(await retryRead(() => provider.getStorage(assembly,SLOT,block))).slice(-40));
    const proxyCode=(await retryRead(() => provider.getCode(assembly,block))).toLowerCase();
    assert(proxyArtifacts().some(a=>a.deployedBytecode.toLowerCase()===proxyCode),'Unrecognized Assembly proxy bytecode');
    for(const [name,address]of [['AnnualGovernanceV2',implementation],['OliveAssembly',assemblyImpl]]){
      assert((await retryRead(() => provider.getCode(address,block))).toLowerCase()===runtime(name,address),`${name} runtime mismatch`);
      assert(await call(address,'proxiableUUID() view returns(bytes32)')===SLOT,`${name} UUPS mismatch`);
      const init=BigInt(await retryRead(() => provider.getStorage(address,INIT,block)));
      assert((init&((1n<<64n)-1n))===(1n<<64n)-1n,`${name} implementation initializer unlocked`);
    }
    assert(same(await call(assembly,'owner() view returns(address)'),PIN.owner),'Assembly owner mismatch');
    assert(same(await call(assembly,'oliveNFT() view returns(address)'),PIN.nft),'Assembly collection mismatch');
    assert(await call(assembly,'governance() view returns(address)')===ethers.ZeroAddress,'Assembly already bound');
    assert(await call(assembly,'registrationOpenedAt() view returns(uint256)')===0n,'Assembly already opened');
    // Deposits are permissionless even before binding; requiring zero here would
    // let an NFT holder block release preparation by registering early.
    const registered=await call(assembly,'registeredCount() view returns(uint256)');
    const custody=await call(PIN.nft,'balanceOf(address) view returns(uint256)',[assembly]);
    assert(registered<=custody && registered<=20000n,'Assembly custody count mismatch');
    assert(BigInt(await retryRead(() => provider.getStorage(assembly,INIT,block)))===1n,'Assembly proxy initialization mismatch');
  }
  return {block,cycle:cycle.toString(),historicalPools:pools.toString(),activePools:active,ballotSize:charities.size,ballotPreparationBatches:((pools+99n)/100n).toString()};
}
function payloads(assembly,implementation,salt) {
  for(const a of [assembly,implementation])assert(ethers.isAddress(a)&&a!==ethers.ZeroAddress,'Invalid candidate address');
  assert(/^0x[0-9a-f]{64}$/i.test(salt),'Invalid release salt');
  const gov=new ethers.Interface(artifact('AnnualGovernanceV2').a.abi), vault=new ethers.Interface(artifact('OliveAssembly').a.abi);
  const targets=[PIN.governance,assembly],values=[0n,0n],datas=[gov.encodeFunctionData('upgradeToAndCall',[implementation,gov.encodeFunctionData('initializeNFTVoting',[assembly])]),vault.encodeFunctionData('bindGovernance',[PIN.governance])];
  const tuple=[targets,values,datas,ethers.ZeroHash,salt];
  const operationId=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address[]','uint256[]','bytes[]','bytes32','bytes32'],tuple));
  const tl=new ethers.Interface(['function scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)','function executeBatch(address[],uint256[],bytes[],bytes32,bytes32)']);
  const safe=(name,data)=>({version:'1.0',chainId:'8453',createdAt:Date.now(),meta:{name,createdFromSafeAddress:PIN.voteAdmin,description:`Reviewed Assembly upgrade. Operation ${operationId}. Re-run preflight before signing.`,txBuilderVersion:'1.16.5'},transactions:[{to:PIN.owner,value:'0',data,contractMethod:null,contractInputsValues:null}]});
  return {operationId,salt,targets,datas,schedule:safe('Assembly upgrade: schedule',tl.encodeFunctionData('scheduleBatch',[...tuple,86400])),execute:safe('Assembly upgrade: execute',tl.encodeFunctionData('executeBatch',tuple))};
}
function deploymentPlan(assemblyImplementation) {
  assert(ethers.isAddress(assemblyImplementation)&&assemblyImplementation!==ethers.ZeroAddress,'Assembly implementation address required');
  const assembly=artifact('OliveAssembly').a,gov=artifact('AnnualGovernanceV2').a;
  const init=new ethers.Interface(assembly.abi).encodeFunctionData('initialize',[PIN.nft,PIN.owner]);
  const proxy=proxyArtifacts()[1];
  return {chainId:8453,implementations:[{contract:'OliveAssembly',to:null,value:'0',data:assembly.bytecode},{contract:'AnnualGovernanceV2',to:null,value:'0',data:gov.bytecode}],
    assemblyProxy:{to:null,value:'0',data:proxy.bytecode+ethers.AbiCoder.defaultAbiCoder().encode(['address','bytes'],[assemblyImplementation,init]).slice(2)},
    note:'Unsigned creation transactions only. Deploy implementation contracts first. The Assembly proxy constructor initializes its collection and Timelock owner atomically. Re-run prepare with deployed addresses before scheduling.'};
}
module.exports={retryRead,PIN,SLOT,artifact,runtime,buildManifest,verifyManifest,preflight,payloads,deploymentPlan};
