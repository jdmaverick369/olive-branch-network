const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const hre = require('hardhat');
const { ethers, network } = hre;
const root = path.resolve(__dirname, '../../..');
const artifact = require(path.join(root, 'artifacts/contracts/OliveNFT.sol/OliveNFT.json'));
const live = require('./live-snapshot.json');
const results = { live, assumptions: { localHardfork: 'cancun', localBlockGasLimit: 1000000000, scope: 'Snapshot transaction only; excludes AnnualGovernance start, proxy and Safe overhead, L1 fees and chain-specific gas changes.', productionSourceUnchanged: true }, measurements: [] };
assert.equal(ethers.keccak256(artifact.deployedBytecode), live.codeHash, 'Benchmark NFT runtime must exactly match Base deployment');
results.assumptions.nftRuntimeMatchesLive = true;
results.assumptions.baseTransactionGasCap = 16777216;
results.assumptions.baseGasCapSource = 'https://docs.base.org/upgrades/azul/exec-engine';
results.capChecks = [];
const solc = require('solc');
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'SnapshotBench.sol': { content: fs.readFileSync(path.join(__dirname, 'SnapshotBench.sol'), 'utf8') } }, settings: { optimizer: { enabled: true, runs: 500 }, viaIR: true, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
for (const e of output.errors || []) if (e.severity === 'error') throw new Error(e.formattedMessage);
results.assumptions.harnessCompiler = solc.version();
async function deploy(name, signer) {
  const c = output.contracts['SnapshotBench.sol'][name];
  const instance = await new ethers.ContractFactory(c.abi, c.evm.bytecode.object, signer).deploy();
  await instance.waitForDeployment();
  return instance;
}
async function measure(bench, nft, scenario, supply, holders) {
  for (const enumerable of [true, false]) {
    // Compare both implementations from identical starting storage, including cycle counter.
    const before = enumerable ? await network.provider.send('evm_snapshot') : null;
    if (supply === 13 || (scenario === 'one NFT per holder' && [500, 1000].includes(supply))) {
      let succeeded = false;
      let reason = '';
      try {
        await bench.snapshot.staticCall(await nft.getAddress(), enumerable, { gasLimit: 16777216 });
        succeeded = true;
      } catch (e) { reason = e.shortMessage || e.message; }
      assert.equal(succeeded, supply < 1000, `Unexpected capped execution at supply ${supply}: ${reason}`);
      results.capChecks.push({ supply, enumerable, gasCap: 16777216, succeeded, reason });
    }
    const receipt = await (await bench.snapshot(await nft.getAddress(), enumerable, { gasLimit: 900000000 })).wait();
    const log = receipt.logs.map(l => { try { return bench.interface.parseLog(l); } catch { return null; } }).find(l => l?.name === 'Snapshot');
    assert.equal(Number(log.args.supply), supply);
    assert.equal(Number(log.args.holders), holders);
    const row = { scenario, supply, holders, traversal: enumerable ? 'tokenByIndex+ownerOf' : 'sequential ownerOf', gasUsed: Number(receipt.gasUsed) };
    results.measurements.push(row);
    console.log(JSON.stringify(row));
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    if (before) await network.provider.send('evm_revert', [before]);
  }
}
async function main() {
  assert.equal(network.name, 'hardhat', 'This benchmark must never run against a live network');
  const [signer, recipient] = await ethers.getSigners();
  const bench = await deploy('SnapshotBench', signer);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const nft = await factory.deploy('Olive NFT Benchmark', 'OLIVE', '');
  await nft.waitForDeployment();
  // Reproduce the actual collection's owner distribution through normal mints.
  for (const entry of live.owners) await (await nft.ownerMint(entry.owner, 1)).wait();
  await measure(bench, nft, 'current ownership reproduced locally', live.supply, live.uniqueHolders);
  for (const entry of live.owners) assert.equal(await bench.eligible(1, entry.owner), true);
  assert.equal(await bench.eligible(1, recipient.address), false);
  // A later mint must not grant eligibility in a completed snapshot.
  await (await nft.ownerMint(recipient.address, 1)).wait();
  assert.equal(await bench.eligible(1, recipient.address), false);
  results.checks = ['Snapshot event counts match fixtures', 'Every current holder included', 'Nonholder excluded', 'Post-snapshot mint does not change eligibility'];

  for (const distinct of [true, false]) {
    const collection = await factory.deploy('Olive NFT Benchmark', 'OLIVE', '');
    await collection.waitForDeployment();
    const minter = distinct ? await deploy('MintFixture', signer) : null;
    if (minter) await (await collection.transferOwnership(await minter.getAddress())).wait();
    let minted = 0;
    for (const target of [100, 500, 1000, 5000, 10000, 20000]) {
      while (minted < target) {
        const count = Math.min(100, target - minted);
        const tx = distinct
          ? await minter.mintDistinct(await collection.getAddress(), minted, count, { gasLimit: 30000000 })
          : await collection.ownerMint(signer.address, count, { gasLimit: 30000000 });
        await tx.wait();
        minted += count;
      }
      await measure(bench, collection, distinct ? 'one NFT per holder' : 'all NFTs held by one address', target, distinct ? target : 1);
    }
  }
  const transferNFT = await factory.deploy('Olive NFT Benchmark', 'OLIVE', '');
  await transferNFT.waitForDeployment();
  await (await transferNFT.ownerMint(signer.address, 1)).wait();
  await (await transferNFT.ownerMint(signer.address, 1)).wait();
  await (await bench.snapshot(await transferNFT.getAddress(), false)).wait();
  const cycle = await bench.cycle();
  await (await transferNFT.transferFrom(signer.address, recipient.address, 1)).wait();
  assert.equal(await bench.eligible(cycle, signer.address), true);
  assert.equal(await bench.eligible(cycle, recipient.address), false);
  await (await bench.snapshot(await transferNFT.getAddress(), false)).wait();
  assert.equal(await bench.eligible(cycle + 1n, recipient.address), true);
  results.checks.push('Post-snapshot transfer preserves old holder eligibility and excludes recipient', 'Next snapshot includes transfer recipient', '500 distinct holders execute under Base gas cap; 1000 do not (both implementations)');
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log('All benchmark checks passed. Results saved to scripts/benchmarks/nft-snapshot/results.json');
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exitCode = 1; });
