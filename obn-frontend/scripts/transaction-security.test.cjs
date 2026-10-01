// Offline regression tests: production TS modules + actual Wagmi/viem, in-memory EIP-1193.
// No RPC, credentials, signatures, or transactions leave this process.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const ROUTER = '0x4444444444444444444444444444444444444444';
const HASH = `0x${'ab'.repeat(32)}`;
const REPLACEMENT_HASH = `0x${'cd'.repeat(32)}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function load(file, overrides = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',js)(name => name in overrides ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) };
global.window = { addEventListener() {}, removeEventListener() {} };
global.fetch = async () => { throw new Error('Network forbidden in transaction regression tests'); };
require('node:net').Socket.prototype.connect = function () { throw new Error('Network forbidden in transaction regression tests'); };
const guard = load('src/lib/transactionGuard.ts');
const utils = load('src/lib/txUtils.ts');
const quoteValidation = load('src/lib/swapQuoteValidation.ts');

async function harness({ chainId=8453, viewed=A, receipt='success', replacement, receiptGate, requestGate, walletError, timeoutMs=500, callsStatus='success' } = {}) {
  const core = await import(pathToFileURL(require.resolve('@wagmi/core')).href);
  const viem = await import(pathToFileURL(require.resolve('viem')).href);
  const { base } = await import(pathToFileURL(require.resolve('viem/chains')).href);
  const state = { chainId, account:A, sends:[], signatures:[], batches:[], errors:[], receipts:[], requests:[], boundSends:[] };
  const provider = new EventEmitter();
  provider.request = async ({method, params}) => {
    state.requests.push(method);
    if (method==='eth_chainId') return `0x${state.chainId.toString(16)}`;
    if (method==='eth_accounts' || method==='eth_requestAccounts') return [state.account];
    if (method==='eth_sendTransaction' || method==='wallet_sendTransaction') {
      state.sends.push({ ...params[0], walletChain:state.chainId });
      if (requestGate) await requestGate.promise;
      if (walletError) throw walletError;
      return HASH;
    }
    if (method==='eth_signTypedData_v4') { state.signatures.push(params); return `0x${'11'.repeat(65)}`; }
    throw new Error(`Unexpected mock wallet RPC: ${method}`);
  };
  const factory = core.createConnector(() => ({ id:'regression',name:'Regression wallet',type:'injected',
    connect:async()=>({accounts:[state.account],chainId:state.chainId}),disconnect:async()=>{},
    getAccounts:async()=>[state.account],getChainId:async()=>state.chainId,getProvider:async()=>provider,isAuthorized:async()=>true,
    onAccountsChanged(){},onChainChanged(){},onDisconnect(){} }));
  const config = core.createConfig({ chains:[base],connectors:[factory],transports:{8453:viem.custom(provider)},storage:null,ssr:true,multiInjectedProviderDiscovery:false });
  const connector = config.connectors[0]; await core.connect(config,{connector});
  const client = { async waitForTransactionReceipt(args) {
    state.receipts.push(args.hash); if(receiptGate) await receiptGate.promise;
    if(replacement) args.onReplaced?.({reason:replacement,transaction:{hash:REPLACEMENT_HASH}});
    if(receipt instanceof Error) throw receipt;
    return {status:receipt,transactionHash:HASH};
  }, async getTransactionReceipt(){return {status:receipt,transactionHash:HASH};} };
  const effects=[];
  const React = { useCallback:fn=>fn, useRef:value=>({current:value}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn()) };
  const wagmi = { useConfig:()=>config,useAccount:()=>core.getAccount(config),usePublicClient:()=>client,
    useWriteContract:()=>({writeContractAsync:args=>core.writeContract(config,args)}),
    useSendTransaction:()=>({sendTransactionAsync:args=>{state.boundSends.push(args);return core.sendTransaction(config,args);}}),
    useSignTypedData:()=>({signTypedDataAsync:args=>core.signTypedData(config,args)}),
    useSendCalls:()=>({sendCallsAsync:async args=>{state.batches.push(args);return {id:'batch-1'};}}) };
  const exports = load('src/hooks/useWalletTransaction.tsx', {react:React,wagmi,'@wagmi/core':core,
    'viem/actions':{waitForCallsStatus:async()=>({status:callsStatus,receipts:[{status:callsStatus}]}), getCallsStatus:async()=>({status:callsStatus})},
    sonner:{toast:{error:message=>state.errors.push(message),success:()=>{}}},'@/lib/transactionGuard':guard,
    '@/lib/txUtils':{withTxTimeout:promise=>utils.withTxTimeout(promise,timeoutMs)} });
  const tx = exports.useWalletTransaction(8453,viewed);
  const send = () => tx.sendTransactionAsync({to:ROUTER,value:1n});
  const changeAccount = account => {state.account=account;connector.emitter.emit('change',{accounts:[account]});provider.emit('accountsChanged',[account]);};
  const changeChain = chain => {state.chainId=chain;connector.emitter.emit('change',{chainId:chain});provider.emit('chainChanged',`0x${chain.toString(16)}`);};
  return {tx,state,send,changeAccount,changeChain,core,config,provider,cleanup:()=>effects.forEach(fn=>fn?.())};
}

test('wrong provider chain and stale viewed account never reach a wallet write',async()=>{
  for(const options of [{chainId:1},{viewed:B}]){const h=await harness(options);await h.tx.run('Swap',h.send);assert.equal(h.state.sends.length,0);assert.ok(h.state.errors.length);h.cleanup();}
});
test('immediate lock rejects double clicks during asynchronous quote preparation',async()=>{
  const h=await harness(),gate=deferred();let quotes=0;
  const action=()=>h.tx.run('Swap',async()=>{quotes++;await gate.promise;await h.send();});
  const first=action();const second=action();await tick();assert.equal(quotes,1);gate.resolve();await Promise.all([first,second]);
  assert.equal(h.state.sends.length,1);assert.equal(h.state.sends[0].from.toLowerCase(),A);assert.equal(h.state.boundSends[0].chainId,8453);assert.equal(h.state.sends[0].walletChain,8453);assert.equal(guard.readTransaction(A,8453),null);h.cleanup();
});
test('account or chain changes between awaits invalidate even after changing back',async()=>{
  for(const change of ['account','chain']){const h=await harness(),gate=deferred();let started=false;
    const action=h.tx.run('Stake',async()=>{started=true;await gate.promise;await h.send();});await tick();assert.ok(started);
    if(change==='account'){h.changeAccount(B);h.changeAccount(A);}else{h.changeChain(1);h.changeChain(8453);}
    gate.resolve();await action;assert.equal(h.state.sends.length,0);assert.match(h.state.errors.join(' '),/changed/);h.cleanup();}
});
test('success is withheld until receipt confirmation; reverted/cancelled/replaced never report success',async()=>{
  const gate=deferred(),h=await harness({receiptGate:gate});let success=false;
  const flow=h.tx.run('Mint',async()=>{await h.send();success=true;});await tick();assert.equal(success,false);gate.resolve();await flow;assert.equal(success,true);h.cleanup();
  for(const options of [{receipt:'reverted'},{replacement:'cancelled'},{replacement:'replaced'}]){const x=await harness(options);let passed=false;await x.tx.run('Mint',async()=>{await x.send();passed=true;});assert.equal(passed,false);assert.equal(guard.readTransaction(A,8453),null);x.cleanup();}
  const repriced=await harness({replacement:'repriced'});let passed=false;await repriced.tx.run('Stake',async()=>{assert.equal(await repriced.send(),REPLACEMENT_HASH);passed=true;});assert.equal(passed,true);repriced.cleanup();
});
test('wallet timeout retains lock, tracks late result, and never continues to the next write',async()=>{
  const gate=deferred(),h=await harness({requestGate:gate,timeoutMs:10});let secondWrite=false;
  await h.tx.run('Stake',async()=>{await h.send();secondWrite=true;await h.send();});
  const pending=guard.readTransaction(A,8453);assert.ok(pending);assert.equal(secondWrite,false);
  assert.throws(()=>guard.acknowledgeCancelledRequest(pending),/still being tracked/);
  await h.tx.run('Duplicate stake',h.send);assert.equal(h.state.sends.length,1);
  gate.resolve();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(guard.readTransaction(A,8453),null);assert.equal(h.state.sends.length,1);h.cleanup();
});
test('RPC confirmation failure and unknown wallet errors remain journaled; explicit wallet rejection unlocks',async()=>{
  const h=await harness({receipt:new Error('RPC unavailable')});await h.tx.run('Withdraw',h.send);const record=guard.readTransaction(A,8453);assert.equal(record.hash,HASH);assert.equal(record.phase,'uncertain');assert.throws(()=>guard.acknowledgeCancelledRequest(record));guard.clearTransaction(record);h.cleanup();
  const unknown=await harness({walletError:new Error('connection lost')});await unknown.tx.run('Withdraw',unknown.send);const ambiguous=guard.readTransaction(A,8453);assert.equal(ambiguous.phase,'uncertain');guard.acknowledgeCancelledRequest(ambiguous);unknown.cleanup();
  const rejected=await harness({walletError:Object.assign(new Error('User rejected'),{code:4001})});await rejected.tx.run('Withdraw',rejected.send);assert.equal(guard.readTransaction(A,8453),null);rejected.cleanup();
});
test('batch submission binds account/chain and only terminal successful receipts return',async()=>{
  for(const status of ['success','failure','pending']){const h=await harness({callsStatus:status});let passed=false;await h.tx.run('Claim',async()=>{await h.tx.sendCallsAsync({calls:[{to:TOKEN,data:'0x1234'}],capabilities:{paymasterService:{url:'https://example.invalid/paymaster'}}});passed=true;});assert.equal(passed,status==='success');assert.equal(h.state.batches[0].account,A);assert.equal(h.state.batches[0].chainId,8453);assert.equal(h.state.batches[0].capabilities.paymasterService.url,'https://example.invalid/paymaster');const record=guard.readTransaction(A,8453);if(status==='pending'){assert.equal(record.callsId,'batch-1');guard.clearTransaction(record);}else assert.equal(record,null);h.cleanup();}
});
test('restricted storage still prevents in-memory duplicate operations',()=>{
  const original=global.localStorage;global.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  const op=new guard.TransactionOperation(A,8453,'Claim');assert.throws(()=>new guard.TransactionOperation(A,8453,'Claim'));op.finish();assert.equal(guard.readTransaction(A,8453),null);global.localStorage=original;
});
test('journal survives module reload and requires explicit recovery for an unknown request',async()=>{
  const op=new guard.TransactionOperation(A,8453,'Swap');await assert.rejects(op.request('transaction',async()=>{throw Error('offline')}));op.finish();
  const reloaded=load('src/lib/transactionGuard.ts');assert.throws(()=>new reloaded.TransactionOperation(A,8453,'Swap'));const record=reloaded.readTransaction(A,8453);reloaded.acknowledgeCancelledRequest(record);guard.clearTransaction(record);
});
function validQuote(native=false) {
  const intent={chainId:8453,account:A,fromToken:native?quoteValidation.NATIVE_TOKEN:TOKEN,toToken:B,fromAmount:100n};
  const quote={liquidityAvailable:true,fromToken:intent.fromToken,toToken:B,fromAmount:'100',toAmount:'1000',minToAmount:'990',transaction:{to:ROUTER,data:'0x12345678',value:native?'100':'0'}};
  if(!native){quote.issues={allowance:{spender:quoteValidation.PERMIT2}};quote.permit2={eip712:{domain:{name:'Permit2',chainId:8453,verifyingContract:quoteValidation.PERMIT2},types:{TokenPermissions:[{name:'token',type:'address'},{name:'amount',type:'uint256'}],PermitTransferFrom:[{name:'permitted',type:'TokenPermissions'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},primaryType:'PermitTransferFrom',message:{permitted:{token:TOKEN,amount:'100'},spender:ROUTER,nonce:'5',deadline:String(Math.floor(Date.now()/1000)+600)}}};}
  return {quote,intent};
}
test('valid native, Permit2, and AllowanceHolder quotes pass documented route validation',async()=>{
  for(const native of [true,false]){const {quote,intent}=validQuote(native);quoteValidation.validateSwapQuote(quote,intent);await quoteValidation.validateSwapRouter(quote,async()=>ROUTER);}
  const {quote,intent}=validQuote();delete quote.permit2;quote.issues.allowance.spender=quoteValidation.BASE_ALLOWANCE_HOLDER;quote.transaction.to=quoteValidation.BASE_ALLOWANCE_HOLDER;quoteValidation.validateSwapQuote(quote,intent);await quoteValidation.validateSwapRouter(quote,async()=>{throw Error('Should not require a Settler lookup for AllowanceHolder');});
});
test('tampered quote authority and amounts are rejected before signing',()=>{
  const changes=[q=>q.fromAmount='101',q=>q.taker=B,q=>q.transaction.value='1',q=>q.issues.allowance.spender=B,q=>q.permit2.eip712.domain.chainId=1,q=>q.permit2.eip712.domain.verifyingContract=B,q=>q.permit2.eip712.message.permitted.token=B,q=>q.permit2.eip712.message.permitted.amount='101',q=>q.permit2.eip712.message.spender=B,q=>q.permit2.eip712.message.deadline='1',q=>q.permit2.eip712.primaryType='PermitBatchTransferFrom',q=>q.permit2.eip712.types.TokenPermissions[1].type='uint160',q=>q.minToAmount='0'];
  for(const change of changes){const{quote,intent}=validQuote();change(quote);assert.throws(()=>quoteValidation.validateSwapQuote(quote,intent));}
  const{quote,intent}=validQuote(true);quote.transaction.value='1000000000000000000';assert.throws(()=>quoteValidation.validateSwapQuote(quote,intent));
});
test('router registry accepts deployment dwell, rejects unknown router, and fails closed while paused',async()=>{
  const{quote}=validQuote();await quoteValidation.validateSwapRouter(quote,async name=>name==='ownerOf'?B:ROUTER);
  await assert.rejects(()=>quoteValidation.validateSwapRouter(quote,async()=>B),/unrecognized/);
  await assert.rejects(()=>quoteValidation.validateSwapRouter(quote,async name=>{if(name==='ownerOf')throw Error('paused');return ROUTER;}),/paused/);
});
test('profile current address follows connected signer before MiniApp bootstrap snapshot',()=>{
  const source=fs.readFileSync(path.join(root,'src/app/profile/page.tsx'),'utf8');
  const expression=source.match(/const currentAddress = ([^;]+);/)[1];
  const resolve=new Function('miniWallet','address','miniAppAddress',`return ${expression}`);
  assert.equal(resolve({viewAddress:null},B,A),B);assert.equal(resolve({viewAddress:A},B,A),A);
});
test('mobile return cannot clear a request without a positive reconciliation result',async()=>{
  let terminal=false,clears=0,hidden=false,time=0;const events={};const realWindow=global.window;const realNow=Date.now;
  global.document={get hidden(){return hidden;},addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};
  global.window={addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};Date.now=()=>time;
  const module=load('src/hooks/useMobileTxRecovery.ts',{react:{useRef:value=>({current:value}),useEffect:fn=>fn()}});
  module.useMobileTxRecovery(true,()=>clears++,async()=>terminal,10);
  hidden=true;events.visibilitychange();time=20;hidden=false;events.visibilitychange();await tick();assert.equal(clears,0);
  terminal=true;hidden=true;events.visibilitychange();time=40;hidden=false;events.visibilitychange();await tick();assert.equal(clears,1);
  Date.now=realNow;global.window=realWindow;delete global.document;
});

function extractedFunction(file,name,bindings) {
  const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true,4);let expression;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name){expression=ts.isCallExpression(node.initializer)?node.initializer.arguments[0].getText(ast):node.initializer.getText(ast);}ts.forEachChild(node,visit);}visit(ast);
  assert.ok(expression,`Missing ${name}`);
  const js=ts.transpileModule(`module.exports=(${expression});`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function(...Object.keys(bindings),'module',js)(...Object.values(bindings),module);return module.exports;
}
test('actual profile and pool handlers preserve view-only connect flow before guarded writes',async()=>{
  for(const[file,names]of [['src/app/profile/page.tsx',['onMintOlive','handleClaimAll','handleClaim','handleNonprofitClaim']],['src/app/stake-earn-contribute/[poolId]/page.tsx',['handleStake','handleUnstake','handleClaim']]]){
    for(const name of names){let connected=0;const callback=extractedFunction(file,name,{needsConnect:()=>{connected++;return true;},tx:{run:()=>assert.fail('View-only connection must happen before guarded submission')}});await callback(1);assert.equal(connected,1);}
  }
});
test('batch recovery classifier retains unknown statuses and recognizes reverted receipts',()=>{
  assert.equal(guard.batchOutcome({status:'success',receipts:[{status:'success'},{status:'reverted'}]}),'failure');
  assert.equal(guard.batchOutcome({status:'failure'}),'failure');assert.equal(guard.batchOutcome({status:'pending'}),'pending');
  assert.throws(()=>guard.batchOutcome({status:'unknown'}),/unknown/);
  assert.throws(()=>guard.batchOutcome({status:'success',receipts:[{status:'unknown'}]}),/unknown/);
});
test('a status check cannot erase the journal of an active multi-step operation',async()=>{
  const op=new guard.TransactionOperation(A,8453,'Stake');await op.request('signature',async()=>true);guard.clearTransaction(op.record);assert.ok(guard.readTransaction(A,8453));assert.throws(()=>new guard.TransactionOperation(A,8453,'Duplicate stake'));op.finish();assert.equal(guard.readTransaction(A,8453),null);
});
test('actual trade callbacks reject wrong chain, duplicate quotes, account switching, and quote authority tampering',async()=>{
  const viem=await import(pathToFileURL(require.resolve('viem')).href);
  async function scenario(options={},gate,mutate=()=>{}){
    const h=await harness(options),quote=validQuote(true).quote;quote.fromAmount='1000000000000000';quote.transaction.value=quote.fromAmount;mutate(quote);
    const state={quotes:0,stages:[],errors:[],confirmed:false};
    const bindings={address:A,fromAmount:'0.001',fromToken:{symbol:'ETH',address:quoteValidation.NATIVE_TOKEN,decimals:18},toToken:{symbol:'OBN',address:B,decimals:18},CHAIN_ID:8453,SLIPPAGE_BPS:100,
      parseUnits:viem.parseUnits,erc20Abi:viem.erc20Abi,concat:viem.concat,numberToHex:viem.numberToHex,size:viem.size,DATA_SUFFIX:'0x',tx:h.tx,
      validateSwapQuote:quoteValidation.validateSwapQuote,validateSwapRouter:quoteValidation.validateSwapRouter,swapRegistryRead:quoteValidation.swapRegistryRead,
      publicClient:{readContract:async()=>ROUTER},fetch:async()=>{state.quotes++;if(gate)await gate.promise;return{ok:true,json:async()=>quote};},
      setSwapError:message=>state.errors.push(message),setSwapStage:stage=>state.stages.push(stage),setSwapHash:()=>{state.confirmed=true;},friendlyError:error=>error.message,
      sendTransactionAsync:h.tx.sendTransactionAsync,writeContractAsync:h.tx.writeContractAsync,signTypedDataAsync:h.tx.signTypedDataAsync,
      refetchUsdc:async()=>{},refetchEurc:async()=>{},refetchObn:async()=>{}};
    bindings.fetchExecutableQuote=extractedFunction('src/app/trade/page.tsx','fetchExecutableQuote',bindings);
    return{...h,trade:extractedFunction('src/app/trade/page.tsx','handleSwap',bindings),tradeState:state};
  }
  const wrong=await scenario({chainId:1});await wrong.trade();assert.equal(wrong.tradeState.quotes,0);assert.equal(wrong.state.sends.length,0);wrong.cleanup();
  const gate=deferred(),double=await scenario({},gate);const first=double.trade(),second=double.trade();await tick();assert.equal(double.tradeState.quotes,1);assert.deepEqual(double.tradeState.stages,['quoting']);gate.resolve();await Promise.all([first,second]);assert.equal(double.state.sends.length,1);assert.equal(double.tradeState.confirmed,true);double.cleanup();
  const gate2=deferred(),changed=await scenario({},gate2),flow=changed.trade();await tick();changed.changeAccount(B);gate2.resolve();await flow;assert.equal(changed.state.sends.length,0);changed.cleanup();
  const tampered=await scenario({},undefined,quote=>{quote.transaction.value='1000000000000000000';});await tampered.trade();assert.equal(tampered.state.sends.length,0);assert.match(tampered.tradeState.errors.join(' '),/unexpected ETH/);tampered.cleanup();
});
