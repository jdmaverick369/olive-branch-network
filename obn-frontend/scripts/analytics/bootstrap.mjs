// Optional parallel, resumable RPC archive for the first history import.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JsonRpcProvider } from 'ethers';
import { STAKING, topics } from './core.mjs';

const directory = resolve(process.env.ANALYTICS_STATE_DIR || '.analytics');
const url = process.env.ANALYTICS_RPC_URL || 'https://mainnet.base.org';
const provider = new JsonRpcProvider(url, 8453, { batchMaxCount: 1 });
const range = Number(process.env.ANALYTICS_LOG_RANGE || 2000);
const concurrency = Number(process.env.ANALYTICS_BOOTSTRAP_CONCURRENCY || 4);
if (!Number.isSafeInteger(range) || range < 1) throw new Error('Invalid ANALYTICS_LOG_RANGE');
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('Invalid ANALYTICS_BOOTSTRAP_CONCURRENCY');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hex = n => `0x${n.toString(16)}`;

async function save(file, data) {
  await writeFile(`${file}.tmp`, JSON.stringify(data));
  await rename(`${file}.tmp`, file);
}
async function read(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
async function logs(from, to) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await provider.send('eth_getLogs', [{ address: STAKING, fromBlock: hex(from), toBlock: hex(to), topics: [topics] }]);
    } catch (error) {
      const message = String(error.info?.error?.message || error.error?.message || '');
      if (/block range|ranges over|maximum.*blocks|limited to|too many results|response size|query returned more/i.test(message) && from < to) {
        const middle = Math.floor((from + to) / 2);
        return [...await logs(from, middle), ...await logs(middle + 1, to)];
      }
      if (attempt === 4) throw new Error(`RPC archive range ${from}-${to} failed; rerun to resume`);
      await sleep(2000 * 2 ** attempt);
    }
  }
}

async function run() {
  if (Number(BigInt(await provider.send('eth_chainId', []))) !== 8453) throw new Error('Base mainnet required');
  await mkdir(resolve(directory, 'log-ranges'), { recursive: true });
  const metadataFile = resolve(directory, 'bootstrap-rpc.json');
  let metadata = await read(metadataFile);
  if (!metadata) {
    const end = await provider.getBlock('finalized');
    if (!end || await provider.getCode(STAKING, end.number) === '0x') throw new Error('Staking proxy unavailable');
    let low = 0, high = end.number;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (await provider.getCode(STAKING, middle) === '0x') low = middle + 1;
      else high = middle;
    }
    metadata = { schema: 1, chainId: 8453, contract: STAKING, source: 'Base JSON-RPC',
      fromBlock: 0, startBlock: low, toBlock: end.number, blockHash: end.hash };
    await save(metadataFile, metadata);
  }
  if (metadata.contract !== STAKING || metadata.chainId !== 8453 ||
      (await provider.getBlock(metadata.toBlock))?.hash !== metadata.blockHash) throw new Error('Incompatible RPC archive checkpoint');
  const jobs = [];
  for (let from = metadata.startBlock; from <= metadata.toBlock; from += range) jobs.push({ from, to: Math.min(from + range - 1, metadata.toBlock) });
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const file = resolve(directory, 'log-ranges', `${job.from}-${job.to}.json`);
      if (!await read(file)) await save(file, await logs(job.from, job.to));
      completed++;
      if (completed % 50 === 0 || completed === jobs.length) console.log(`RPC archive: ${completed}/${jobs.length} ranges complete`);
    }
  }));
  const events = [];
  for (const job of jobs) events.push(...await read(resolve(directory, 'log-ranges', `${job.from}-${job.to}.json`)));
  await save(resolve(directory, 'bootstrap-logs.json'), { ...metadata, logs: events });
  console.log(`Complete RPC archive saved: ${events.length} relevant events`);
}

run().catch(error => {
  console.error(/^(RPC archive|Base mainnet|Staking proxy|Incompatible RPC)/.test(error.message) ? error.message : 'RPC archive failed; saved ranges can be resumed');
  process.exitCode = 1;
}).finally(() => provider.destroy());
