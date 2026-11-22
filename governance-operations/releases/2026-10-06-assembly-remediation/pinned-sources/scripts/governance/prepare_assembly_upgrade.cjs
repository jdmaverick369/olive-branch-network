'use strict';
// node scripts/governance/prepare_assembly_upgrade.cjs manifest <output.json>
// node scripts/governance/prepare_assembly_upgrade.cjs check <reviewed-manifest.json>
// node scripts/governance/prepare_assembly_upgrade.cjs deployment-plan <reviewed-manifest.json> <assembly-implementation> <output.json>
// node scripts/governance/prepare_assembly_upgrade.cjs prepare <reviewed-manifest.json> <assembly-proxy> <V2-implementation> <32-byte-salt> <output.json>
// All modes are read-only on-chain. Fresh Assembly must be atomically initialized at deployment.
const fs=require('node:fs'),path=require('node:path');
process.env.HARDHAT_CONFIG=path.resolve(__dirname,'../../hardhat.nft-voting.config.cjs');
const hre=require('hardhat');
const {ethers}=require('ethers');
const release=require('./assembly_release.cjs');
async function main(){
  const [mode,file,assembly,implementation,salt,out]=process.argv.slice(2);
  if(!['manifest','check','prepare','deployment-plan'].includes(mode)||!file)throw Error('Use manifest, check, deployment-plan, or prepare with the required paths. No transactions are sent.');
  const baseline=release.artifact('AnnualGovernance').a,candidate=release.artifact('AnnualGovernanceV2').a;
  await hre.upgrades.validateUpgrade(new ethers.ContractFactory(baseline.abi,baseline.bytecode),new ethers.ContractFactory(candidate.abi,candidate.bytecode),{kind:'uups'});
  const assemblyArtifact=release.artifact('OliveAssembly').a;
  await hre.upgrades.validateImplementation(new ethers.ContractFactory(assemblyArtifact.abi,assemblyArtifact.bytecode),{kind:'uups'});
  if(mode==='manifest'){
    fs.writeFileSync(file,JSON.stringify(release.buildManifest(),null,2),{flag:'wx'});
    console.log('Pinned build manifest created. Review it before preparing any deployment.');return;
  }
  release.verifyManifest(JSON.parse(fs.readFileSync(file)));
  if(mode==='deployment-plan'){
    if(!implementation)throw Error('Output path required');
    fs.writeFileSync(implementation,JSON.stringify(release.deploymentPlan(assembly),null,2),{flag:'wx'});return;
  }
  const request=new ethers.FetchRequest(process.env.BASE_RPC_URL||'https://mainnet.base.org');
  request.timeout=20000;
  request.setThrottleParams({maxAttempts:3,slotInterval:1000});
  const provider=new ethers.JsonRpcProvider(request,undefined,{batchMaxCount:1});
  try{
    const checks=await release.preflight(provider,mode==='prepare'?{assembly,implementation}:{});
    if(mode==='prepare'){
      if(!out)throw Error('Output path required');
      const result={checks,manifestHash:ethers.keccak256(fs.readFileSync(file)),...release.payloads(assembly,implementation,salt)};
      fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});
    }
    console.log(JSON.stringify(checks,null,2));
  } finally{provider.destroy();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
