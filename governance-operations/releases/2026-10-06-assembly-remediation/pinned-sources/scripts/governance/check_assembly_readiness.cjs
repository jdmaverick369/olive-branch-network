// Read-only, pinned-block Base inspection. No signer, dotenv, or transaction RPC methods.
const fs = require('node:fs');
const path = require('node:path');
const { Interface, getAddress, keccak256 } = require('ethers');
const root = path.resolve(__dirname, '../..');
const GOV = '0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270';
const NFT = '0xB66F67444b09f509D72d832567C2df84Edeb80F8';
const SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
let id = 0;
async function rpc(method, params, attempt = 0) {
  if (!['eth_chainId', 'eth_blockNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call'].includes(method)) throw Error('Read-only RPC only');
  const response = await fetch('https://mainnet.base.org', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if ((response.status === 429 || body.error?.code === -32016) && attempt < 6) {
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    return rpc(method, params, attempt + 1);
  }
  if (body.error) throw Error(JSON.stringify(body.error));
  return body.result;
}
async function call(to, signature, args, block) {
  const abi = new Interface(['function ' + signature]);
  const fn = abi.fragments[0];
  const result = await rpc('eth_call', [{ to, data: abi.encodeFunctionData(fn, args) }, block]);
  const decoded = abi.decodeFunctionResult(fn, result);
  return decoded.length === 1 ? decoded[0] : Array.from(decoded);
}
function compiled(source, name) {
  const dir = path.join(root, 'artifacts', source);
  const artifact = JSON.parse(fs.readFileSync(path.join(dir, name + '.json')));
  const debug = JSON.parse(fs.readFileSync(path.join(dir, name + '.dbg.json')));
  const build = JSON.parse(fs.readFileSync(path.resolve(dir, debug.buildInfo)));
  return { artifact, output: build.output.contracts[source][name] };
}
function normalize(code, immutableReferences) {
  let hex = code.replace(/^0x/, '');
  for (const refs of Object.values(immutableReferences || {})) {
    for (const { start, length } of refs) hex = hex.slice(0, start * 2) + '0'.repeat(length * 2) + hex.slice((start + length) * 2);
  }
  const metadataBytes = parseInt(hex.slice(-4), 16) + 2;
  return hex.slice(0, -metadataBytes * 2).toLowerCase();
}
async function main() {
  const { JsonRpcProvider } = require('ethers');
  const provider = new JsonRpcProvider('https://mainnet.base.org');
  try { await require('./assembly_release.cjs').preflight(provider); }
  finally { provider.destroy(); }
  const chainId = await rpc('eth_chainId', []);
  if (BigInt(chainId) !== 8453n) throw Error('Wrong chain');
  const block = await rpc('eth_blockNumber', []);
  const implementation = getAddress('0x' + (await rpc('eth_getStorageAt', [GOV, SLOT, block])).slice(-40));
  const liveCode = await rpc('eth_getCode', [implementation, block]);
  const report = { chainId: 8453, block: Number(BigInt(block)), governance: GOV, implementation, implementationCodeHash: keccak256(liveCode), baselineMatches: {}, state: {}, contracts: {} };
  for (const [source, name] of [['contracts/AnnualGovernance.sol', 'AnnualGovernance'], ['contracts/test/AnnualGovernanceV1.sol', 'AnnualGovernanceV1']]) {
    if (!fs.existsSync(path.join(root, 'artifacts', source, name + '.json'))) continue;
    const { artifact, output } = compiled(source, name);
    const refs = output.evm.deployedBytecode.immutableReferences;
    report.baselineMatches[name] = normalize(liveCode, refs) === normalize(artifact.deployedBytecode, refs);
  }
  for (const name of ['owner', 'voteAdmin', 'obn', 'stakingPools', 'theOffering', 'extendOliveBranch']) report.state[name] = await call(GOV, name + '() view returns(address)', [], block);
  report.state.currentCycleId = await call(GOV, 'currentCycleId() view returns(uint256)', [], block);
  report.state.cycleState = await call(GOV, 'getCycleState(uint256) view returns(uint8)', [report.state.currentCycleId], block);
  report.state.maxBallotSize = await call(GOV, 'maxBallotSize() view returns(uint256)', [], block);
  report.state.timelockDelay = await call(report.state.owner, 'getMinDelay() view returns(uint256)', [], block);
  report.state.safeThreshold = await call(report.state.voteAdmin, 'getThreshold() view returns(uint256)', [], block);
  report.state.stakingUpgradeBlock = await call(report.state.stakingPools, 'upgradeBlock() view returns(uint48)', [], block);
  report.state.poolLength = await call(report.state.stakingPools, 'poolLength() view returns(uint256)', [], block);
  for (const name of ['theOffering', 'extendOliveBranch']) report.state[name + 'Governance'] = await call(report.state[name], 'governance() view returns(address)', [], block);
  report.state.nft = NFT;
  report.state.nftCodeHash = keccak256(await rpc('eth_getCode', [NFT, block]));
  for (const name of ['AnnualGovernanceV2', 'OliveAssembly']) {
    const { artifact } = compiled('contracts/' + name + '.sol', name);
    report.contracts[name] = { deployedBytes: (artifact.deployedBytecode.length - 2) / 2, creationBytes: (artifact.bytecode.length - 2) / 2, compiledRuntimeHash: keccak256(artifact.deployedBytecode) };
  }
  console.log(JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
