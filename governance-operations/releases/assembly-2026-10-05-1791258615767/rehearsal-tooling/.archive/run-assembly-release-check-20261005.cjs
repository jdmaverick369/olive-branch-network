const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const [label,cwd,...args]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid check label');
const dir='C:/obn/governance-operations/releases/assembly-2026-10-05-1791258615767/checks';fs.mkdirSync(dir,{recursive:true});
const prefix=path.join(dir,label+'-'+Date.now());const fd=fs.openSync(prefix+'.log','wx');
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',FORK_MAINNET:'false'};
if(label.startsWith('frontend'))Object.assign(env,{NEXT_PUBLIC_CHAIN_ID:'8453',NEXT_PUBLIC_RPC_URL:'https://mainnet.base.org',NEXT_PUBLIC_WC_PROJECT_ID:'00000000000000000000000000000000',NEXT_PUBLIC_SITE_URL:'http://localhost:3217',NEXT_PUBLIC_OBN_TOKEN:'0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685',NEXT_PUBLIC_STAKING_CONTRACT:'0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2',NEXT_PUBLIC_LENS_CONTRACT:'0x2ae4df523040c0245a6F84342E4B06850c5bdb9b',NEXT_PUBLIC_GOVERNANCE_CONTRACT:'0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270',NEXT_PUBLIC_OLIVE_NFT:'0xB66F67444b09f509D72d832567C2df84Edeb80F8',NEXT_PUBLIC_GOVERNANCE_ENABLED:'false'});
const result=cp.spawnSync(process.execPath,args,{cwd,env,stdio:['ignore',fd,fd]});fs.closeSync(fd);
const report={label,cwd,args,exitCode:result.status,signal:result.signal,log:prefix+'.log',sha256:crypto.createHash('sha256').update(fs.readFileSync(prefix+'.log')).digest('hex')};fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(result.status!==0)console.log(fs.readFileSync(prefix+'.log','utf8').slice(-6000));process.exit(result.status??1);
