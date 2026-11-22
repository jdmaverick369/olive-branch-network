const fs=require('fs'),path=require('path');
const {ethers}=require('ethers');require('dotenv').config({quiet:true});
const dir=path.resolve(__dirname,'../../../governance-operations/releases/assembly-2026-10-06-remediation/mainnet-deployment');
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));
 const req=new ethers.FetchRequest(process.env.BASE_MAINNET_URL);req.timeout=20000;
 const p=new ethers.JsonRpcProvider(req,undefined,{batchMaxCount:1});
 try{
  if((await p.getNetwork()).chainId!==8453n)throw Error('Wrong chain');
  const gas=[];
  for(const tx of plan.transactions.slice(0,2))gas.push(await p.estimateGas({from:plan.signer,data:tx.data,value:0n}));
  // Proxy estimate uses a conservative 500k allowance until its implementation
  // exists. Rehearsed proxy receipt was 229,703 gas. Deployment estimates it again.
  const fee=await p.getFeeData(),balance=await p.getBalance(plan.signer);
  const executionGas=gas.reduce((a,b)=>a+b*120n/100n,500000n);
  const budget=executionGas*fee.maxFeePerGas+ethers.parseEther('0.0001');
  const result={status:balance<budget?'FUNDING REQUIRED; NO TRANSACTIONS SENT':'FUNDING CHECK PASSED',chainId:8453,wallet:plan.signer,balanceETH:ethers.formatEther(balance),implementationGasEstimates:gas.map(String),proxyGasAllowance:'500000',maxFeePerGasGwei:ethers.formatUnits(fee.maxFeePerGas,9),executionFeeCapETH:ethers.formatEther(executionGas*fee.maxFeePerGas),extraFeeReserveETH:'0.0001',totalBudgetETH:ethers.formatEther(budget),additionalETH:ethers.formatEther(budget>balance?budget-balance:0n)};
  fs.writeFileSync(path.join(dir,'funding-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{p.destroy();}
})().catch(e=>{console.error('Funding check failed:',e.code||e.name);process.exitCode=1;});
