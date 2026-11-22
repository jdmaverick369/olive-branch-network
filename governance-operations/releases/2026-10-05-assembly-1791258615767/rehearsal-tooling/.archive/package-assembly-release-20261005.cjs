const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root='C:/obn/governance-operations/releases/assembly-2026-10-05-1791258615767';
const candidate=path.join(root,'frontend-candidate'), live='C:/obn-frontend';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const integration=JSON.parse(fs.readFileSync(path.join(candidate,'integration-review.json')));
const changed=[...new Set([...integration.changed,'src/lib/oliverFaq.ts'])];
const added=[...new Set([...integration.added,'scripts/oliver-governance-smoke.mjs'])];
const files={};
for(const f of [...changed,...added]){
 const source=path.join(candidate,f),dest=path.join(root,'frontend-overlay',f),before=path.join(live,f);
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
 files[f]={beforeSha256:fs.existsSync(before)?hash(fs.readFileSync(before)):null,afterSha256:hash(fs.readFileSync(source))};
}
const release=require('C:/obn/obn-project/scripts/governance/assembly_release.cjs');
release.verifyManifest(JSON.parse(fs.readFileSync(path.join(root,'reviewed-manifest.json'))));
const packageManifest={status:'REVIEW ONLY - NOT APPLIED OR DEPLOYED',liveCommit:integration.liveCommit,mergeBase:integration.mergeBase,files,preservedWorkingChanges:integration.preservedWorkingChanges,excludedDeferredWorkerChanges:integration.excludedDeferredWorkerChanges,applicationRule:'Require each current live file to match beforeSha256 (or remain absent for null) before applying; otherwise re-merge and retest. Never copy the whole staged candidate over the live checkout.',cssConfiguration:'postcss.config.js and tailwind.config.js copied unchanged from the live checkout; clean build required after correcting staging omission.',mainnetTransactions:0};
fs.writeFileSync(path.join(root,'frontend-overlay-manifest.json'),JSON.stringify(packageManifest,null,2)+'\n');
const unchangedConfigs=['postcss.config.js','tailwind.config.js','package-lock.json','next.config.ts'];
for(const f of unchangedConfigs)if(hash(fs.readFileSync(path.join(candidate,f)))!==hash(fs.readFileSync(path.join(live,f))))throw Error('Unexpected config difference '+f);
const command=cp.execFileSync('git',['-c','safe.directory='+live,'-C',live,'rev-parse','HEAD']).toString().trim();
if(command!==integration.liveCommit)throw Error('Live HEAD changed; rebase required');
console.log(JSON.stringify({overlayFiles:Object.keys(files).length,pinnedManifestVerified:true,liveHead:command,unchangedConfigs}));
const records=fs.readdirSync(path.join(root,'checks')).filter(f=>f.endsWith('.json')).map(f=>({file:'checks/'+f,...JSON.parse(fs.readFileSync(path.join(root,'checks',f)))}));
const required=['contracts','keeper','frontend-governance','frontend-security','frontend-release-commands','frontend-final-lint','frontend-verified-build','frontend-verified-browser'];
const checks=required.map(label=>{
 const match=records.filter(r=>r.label===label).at(-1);if(!match||match.exitCode!==0)throw Error('Missing successful check '+label);
 if(hash(fs.readFileSync(match.log))!==match.sha256)throw Error('Log hash mismatch '+label);
 return {label,record:match.file,exitCode:match.exitCode,logSha256:match.sha256};
});
fs.writeFileSync(path.join(root,'validation-summary.json'),JSON.stringify({status:'LOCAL PREPARATION AND REHEARSAL PASSED; PRODUCTION GATES REMAIN',checks,contractFork:'rehearsal-only.json',browserCoverage:'Synthetic-wallet Oliver regression, including mobile layout and governance explanation; signing/sending refused. Governance UI disabled for production-style preactivation build.',stagingFailures:'Earlier CSS/browser failures came from missing staging PostCSS configuration and stale build cache; corrected complete configuration and clean build passed. Earlier public-font download failure required network permission. An intermediate clean build was stopped; its partial log is retained.',mainnetTransactions:0,productionFrontendModified:false,pushed:false},null,2)+'\n');
const scripts=['obn-project/scripts/governance/prepare_assembly_release_20261005.cjs','obn-project/hardhat.assembly-release-20261005.config.cjs','obn-project/test/AssemblyReleaseCandidate20261005.test.cjs','.archive/prepare-governance-frontend-20261005.cjs','.archive/run-assembly-release-check-20261005.cjs','.archive/package-assembly-release-20261005.cjs'];
for(const file of scripts){const dest=path.join(root,'rehearsal-tooling',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join('C:/obn',file),dest);}
const evidence={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())evidence[path.relative(root,p).replaceAll('\\','/')]=hash(fs.readFileSync(p));}}
for(const dir of ['checks','frontend-overlay','rehearsal-tooling'])walk(path.join(root,dir));
for(const file of ['reviewed-manifest.json','preflight.json','implementation-creations.json','rehearsal-only.json','frontend-overlay-manifest.json','validation-summary.json','release-readiness.txt'])evidence[file]=hash(fs.readFileSync(path.join(root,file)));
fs.writeFileSync(path.join(root,'evidence-sha256.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({evidenceFiles:Object.keys(evidence).length,successfulCheckGroups:checks.length}));
