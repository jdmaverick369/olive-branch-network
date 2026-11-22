const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
const {ethers}=require('ethers'),release=require('../scripts/governance/assembly_release.cjs');
const script=path.resolve(__dirname,'../scripts/governance/prepare_assembly_safe_files.cjs');
const source=fs.readFileSync(script,'utf8');
const assembly='0x1111111111111111111111111111111111111111',implementation='0x2222222222222222222222222222222222222222';
function harness(failure=false){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'assembly-export-audit-'));
 const manifest=path.join(tmp,'manifest.json');fs.writeFileSync(manifest,'{}');
 const out=path.join(tmp,'output'),salt=ethers.id('offline-export-audit');
 const bundle={checks:{block:1},...release.payloads(assembly,implementation,salt)};
 const context={require:name=>name==='node:child_process'?{spawnSync:(exe,args)=>{
  assert.equal(exe,process.execPath);assert.equal(args[1],'prepare');assert.deepEqual(Array.from(args.slice(2,6)),[manifest,assembly,implementation,salt]);
  if(!failure)fs.writeFileSync(args[6],JSON.stringify(bundle));return {status:failure?1:0};
 }}:require(name),process:{argv:['node',script,manifest,assembly,implementation,salt,out],execPath:process.execPath,env:{},exit:code=>{throw Error('EXIT:'+code);}},__dirname:path.dirname(script),console:{log:()=>{}}};
 return {tmp,out,bundle,run:()=>vm.runInNewContext(source,{...context})};
}
test('Safe export preserves exact scheduled operation and direct execution calldata',()=>{
 const h=harness();h.run();
 const read=f=>JSON.parse(fs.readFileSync(path.join(h.out,f)));
 assert.deepEqual(read('01-schedule.safe.json'),h.bundle.schedule);
 assert.deepEqual(read('optional-execute-via-safe.json'),h.bundle.execute);
 const direct=read('02-execute-direct.json');
 for(const key of ['to','data','value'])assert.equal(direct[key],h.bundle.execute.transactions[0][key]);
 assert.equal(direct.operationId,h.bundle.operationId);assert.equal(direct.chainId,'8453');
 const abi=new ethers.Interface(['function executeBatch(address[],uint256[],bytes[],bytes32,bytes32)']);
 const d=abi.decodeFunctionData('executeBatch',direct.data);
 assert.equal(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address[]','uint256[]','bytes[]','bytes32','bytes32'],d)),direct.operationId);
 assert.throws(h.run,/EEXIST/);
 assert.deepEqual(read('01-schedule.safe.json'),h.bundle.schedule);
});
test('failed live preparation emits no uploadable schedule or execution file',()=>{
 const h=harness(true);assert.throws(h.run,/EXIT:1/);
 assert.deepEqual(fs.readdirSync(h.out),[]);
});
