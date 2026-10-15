const {expect}=require('chai');const {ethers}=require('hardhat');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const release=require('../scripts/governance/assembly_release.cjs');
describe('Assembly unsigned release preparation',function(){
 it('rejects an unexpected Safe before writing output',function(){
  const result=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/governance/gen_safe_startAnnualCycle.js')],{encoding:'utf8',env:{...process.env,OPERATOR_SAFE:'0x1111111111111111111111111111111111111111'}});
  expect(result.status).to.equal(1);expect(result.stderr).to.include('Safe or chain differs');expect(result.stdout).not.to.include('Safe JSON:');
 });
 it('never overwrites an existing Safe JSON',function(){
  const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'obn-safe-'));
  const file=path.join(dir,'safe.json');const {writeJson}=require('../scripts/governance/timelock_safe_helper.js');
  try{writeJson(file,{original:true});expect(()=>writeJson(file,{original:false})).to.throw();expect(JSON.parse(fs.readFileSync(file))).to.deep.equal({original:true});}
  finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
 });
 it('retries metadata and storage reads before enforcing pinned state',async function(){
  const counts={};const once=async(name,value)=>{counts[name]=(counts[name]||0)+1;if(counts[name]===1)throw Object.assign(Error(),{code:'SERVER_ERROR'});return value;};
  let error;
  try{await release.preflight({getNetwork:()=>once('network',{chainId:8453n}),getBlockNumber:()=>once('block',1),getStorage:()=>once('storage','0x'+'00'.repeat(32))});}catch(e){error=e;}
  expect(error.message).to.equal('Unexpected live governance implementation');expect(counts).to.deep.equal({network:2,block:2,storage:2});
  try{await release.preflight({getNetwork:async()=>({chainId:8453n}),getBlockNumber:async()=>1,getStorage:async()=>ethers.zeroPadValue(release.PIN.implementation,32),getCode:()=>once('code','0x')});}catch(e){error=e;}
  expect(error.message).to.equal('Baseline runtime hash mismatch');expect(counts.code).to.equal(2);
 });
 it('retries transient RPC failures with bounded backoff but never suppresses a revert',async function(){
  let calls=0;const waits=[];
  const result=await release.retryRead(async()=>{if(++calls<3)throw Object.assign(Error(),{code:'SERVER_ERROR'});return 7;},async ms=>waits.push(ms));
  expect(result).to.equal(7);expect(waits).to.deep.equal([1000,2000]);
  for(const code of ['SERVER_ERROR','CALL_EXCEPTION']){
   calls=0;let failed=false;try{await release.retryRead(async()=>{calls++;throw Object.assign(Error(),{code});},async()=>{});}catch{failed=true;}
   expect(failed).to.equal(true);expect(calls).to.equal(code==='SERVER_ERROR'?5:1);
  }
 });
 it('pins release configuration, helpers and the upgrade workflow',function(){
  const files=release.buildManifest().files;
  for(const file of ['hardhat.nft-voting.config.cjs','scripts/governance/addresses.js','scripts/governance/timelock_safe_helper.js','scripts/governance/check_assembly_readiness.cjs','../.github/workflows/governance-upgrade.yml'])expect(files[file]).to.match(/^[a-f0-9]{64}$/);
 });
 it('rejects an unexpected Safe generator target without emitting a file',function(){
  const result=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/governance/gen_safe_startAnnualCycle.js')],{encoding:'utf8',env:{...process.env,ANNUAL_GOV_PROXY:'0x1111111111111111111111111111111111111111'}});
  expect(result.status).to.equal(1);expect(result.stderr).to.include('differs from the pinned');expect(result.stdout).not.to.include('Safe JSON:');
 });
 it('defaults to two 30-day phases and rejects other durations for either phase',function(){
  const {parseDurations}=require('../scripts/governance/gen_safe_startAnnualCycle.js');
  expect(parseDurations([])).to.deep.equal([2592000n,2592000n]);
  expect(parseDurations(['--phase1','2592000','--phase2','2592000'])).to.deep.equal([2592000n,2592000n]);
  for(const key of ['phase1','phase2'])for(const value of ['0','86400','2591999','2592001','2592000000'])
   expect(()=>parseDurations(['--'+key,value])).to.throw('must be exactly 30 days');
 });
 it('pins reviewed inputs and rejects modified manifest evidence',function(){
  const manifest=release.buildManifest();release.verifyManifest(manifest);manifest.pins={...manifest.pins,voteAdmin:ethers.ZeroAddress};expect(()=>release.verifyManifest(manifest)).to.throw('manifest drift');
 });
 it('encodes the atomic initialize-and-bind batch and identical operation IDs for both Safe calls',function(){
  const assembly='0x1111111111111111111111111111111111111111',implementation='0x2222222222222222222222222222222222222222';
  const p=release.payloads(assembly,implementation,ethers.id('reviewed-release'));
  const gov=new ethers.Interface(release.artifact('AnnualGovernanceV2').a.abi),asm=new ethers.Interface(release.artifact('OliveAssembly').a.abi);
  const decoded=gov.decodeFunctionData('upgradeToAndCall',p.datas[0]);expect(decoded[0]).to.equal(implementation);expect(gov.decodeFunctionData('initializeNFTVoting',decoded[1])[0]).to.equal(assembly);
  expect(asm.decodeFunctionData('bindGovernance',p.datas[1])[0]).to.equal(release.PIN.governance);
  expect(p.schedule.transactions[0].to).to.equal(release.PIN.owner);expect(p.execute.meta.description).to.include(p.operationId);
  expect(()=>release.payloads(ethers.ZeroAddress,implementation,ethers.ZeroHash)).to.throw('Invalid candidate');
 });
 it('rejects the wrong network before querying deployment state',async function(){
  let error;try{await release.preflight({getNetwork:async()=>({chainId:31337n})});}catch(e){error=e;}
  expect(error.message).to.equal('Wrong chain');
 });
 for(const value of ['2592000000','1.5','1e6','-86400','true'])it(`rejects unsafe phase seconds ${value} before emitting a Safe file`,function(){
  const result=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/governance/gen_safe_startAnnualCycle.js'),'--phase1',value,'--phase2','2592000'],{encoding:'utf8'});
  expect(result.status).to.equal(1);expect(result.stdout).not.to.include('Safe JSON:');
 });
});
