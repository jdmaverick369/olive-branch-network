// Read-only preparation: never creates a signer or broadcasts a transaction.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {ethers}=require('ethers');
require('dotenv').config({quiet:true});
const release=require('./assembly_release.cjs');
const root=path.resolve(__dirname,'../../..');
async function main(){
 const manifestPath=path.join(root,'governance-operations/assembly-release-manifest-uncapped-2026-10-04-1791161078289.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath));release.verifyManifest(manifest);
 const provider=new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL,undefined,{batchMaxCount:1});
 try{
  const preflight=await release.preflight(provider);
  const block=await provider.getBlock(preflight.block);
  const dir=path.join(root,'governance-operations/releases','assembly-2026-10-05-'+Date.now());
  fs.mkdirSync(dir,{recursive:true});
  fs.copyFileSync(manifestPath,path.join(dir,'reviewed-manifest.json'));
  const dependencies={};
  for(const [name,address] of Object.entries({staking:release.PIN.stakingPools,nft:release.PIN.nft,offering:release.PIN.theOffering,extend:release.PIN.extendOliveBranch})){
   const getter=['offering','extend'].includes(name)?'timelockOwner':'owner';
   const c=new ethers.Contract(address,[`function ${getter}() view returns(address)`,'function version() view returns(string)'],provider);
   dependencies[name]={address,owner:await c[getter]({blockTag:preflight.block})};
   if(name==='staking'){
    dependencies[name].implementation=ethers.getAddress('0x'+(await provider.getStorage(address,release.SLOT,preflight.block)).slice(-40));
    dependencies[name].version=await c.version({blockTag:preflight.block});
    if(dependencies[name].version!=='9.3.1')throw Error('Unexpected staking version; independently review before rehearsal');
   }
  }
  const preparations={status:'LOCAL PREPARATION ONLY - NOT AUTHORIZATION TO DEPLOY',chainId:8453,preflight,blockHash:block.hash,dependencies,manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex'),realCandidateAddresses:null};
  fs.writeFileSync(path.join(dir,'preflight.json'),JSON.stringify(preparations,null,2)+'\n',{flag:'wx'});
  const creations={status:'UNSIGNED IMPLEMENTATION CREATION BYTES ONLY',chainId:8453,transactions:['OliveAssembly','AnnualGovernanceV2'].map(name=>{const a=release.artifact(name).a;return {contract:name,to:null,value:'0',data:a.bytecode,creationHash:ethers.keccak256(a.bytecode),runtimeBytes:(a.deployedBytecode.length-2)/2};}),proxyInitialization:{collection:release.PIN.nft,owner:release.PIN.owner,data:new ethers.Interface(release.artifact('OliveAssembly').a.abi).encodeFunctionData('initialize',[release.PIN.nft,release.PIN.owner]),requires:'Actual deployed OliveAssembly implementation address; construct proxy with deployment-plan after deployment is separately authorized.'}};
  fs.writeFileSync(path.join(dir,'implementation-creations.json'),JSON.stringify(creations,null,2)+'\n',{flag:'wx'});
  for(const [file]of Object.entries(manifest.files)){const dest=path.join(dir,'pinned-sources',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,'obn-project',file),dest);}
  console.log(JSON.stringify({directory:dir,block:preflight.block,blockHash:block.hash,staking:dependencies.staking.version,pinnedFiles:Object.keys(manifest.files).length}));
 } finally {provider.destroy();}
}
main().catch(e=>{console.error('Preparation failed:',e.code||e.name);process.exitCode=1;});
