import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abi, STAKING, topics } from './core.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./run.mjs', import.meta.url));
const old = '0x0000000000000000000000000000000000000001';
const newer = '0x0000000000000000000000000000000000000002';
const unit = 10n ** 18n;
const hex = n => `0x${n.toString(16)}`;
const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
let secondsPerBlock = 86400;
const timestamp = n => Date.parse('2025-09-01T12:00:00Z') / 1000 + (n - 100) * secondsPerBlock;
const eventLog = (number, index, name, args) => ({
  ...abi.encodeEventLog(abi.getEvent(name), args), address: STAKING, removed: false,
  blockNumber: hex(number), logIndex: hex(index), blockHash: hash(number),
});

test('worker retries bounded ranges, resumes, reconciles migrations and preserves last good publication', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'obn-analytics-test-'));
  let tip = 110;
  let badTotals = false;
  let changedHash = false;
  let maxLogSpan = 2;
  const logReads = [];
  const logs = [
    eventLog(100, 0, 'PoolAdded', [0n, old]),
    eventLog(101, 0, 'Deposit', [old, 0n, 10n * unit]),
    eventLog(103, 0, 'Claim', [old, 0n, 8n * unit]),
    eventLog(104, 0, 'CharityWalletUpdated', [0n, old, newer]),
    eventLog(104, 1, 'Deposit', [newer, 0n, unit]),
    eventLog(104, 2, 'Withdraw', [newer, 0n, unit]),
    eventLog(104, 3, 'Claim', [old, 0n, 100n * unit]),
    eventLog(104, 4, 'Claim', [newer, 0n, 4n * unit]),
    eventLog(106, 0, 'CharityDistributed', [0n, 2n * unit]),
    eventLog(107, 0, 'CharityFundDistributed', [unit]),
  ];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (Array.isArray(payload)) {
      response.end(JSON.stringify(payload.toReversed().map(({ id, params }) => {
        const n = Number(BigInt(params[0]));
        return { jsonrpc: '2.0', id, result: { number: hex(n), timestamp: hex(timestamp(n)), hash: hash(n) } };
      })));
      return;
    }
    const { id, method, params } = payload;
    let result;
    if (method === 'eth_chainId') result = hex(8453);
    if (method === 'eth_getCode') result = Number(BigInt(params[1])) >= 100 ? '0x1234' : '0x';
    if (method === 'eth_getBlockByNumber') {
      const n = params[0] === 'finalized' ? tip : Number(BigInt(params[0]));
      result = { number: hex(n), timestamp: hex(timestamp(n)), hash: hash(changedHash ? n + 1 : n) };
    }
    if (method === 'eth_getLogs') {
      const from = Number(BigInt(params[0].fromBlock));
      const to = Number(BigInt(params[0].toBlock));
      if (to - from > maxLogSpan) {
        response.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message: 'block range limited to 3' } }));
        return;
      }
      logReads.push([from, to]);
      result = logs.filter(log => Number(BigInt(log.blockNumber)) >= from && Number(BigInt(log.blockNumber)) <= to);
      // Deliberately duplicate a provider log to verify de-duplication.
      if (result.length) result = [...result, result[0]];
    }
    if (method === 'eth_call') {
      const call = abi.parseTransaction({ data: params[0].data });
      let value = 0n;
      if (call.name === 'globalTotalStaked') value = (badTotals ? 11n : 10n) * unit;
      if (call.name === 'uniqueStakersGlobal') value = 1n;
      if (call.name === 'userAmount') value = call.args[1].toLowerCase() === newer ? 10n * unit : 0n;
      result = abi.encodeFunctionResult(call.name, [value]);
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise(r => server.close(r));
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
    await rm(target, { recursive: true, force: true });
  });
  const run = (overrides = {}) => execute(process.execPath, [script], { env: { ...process.env,
    ANALYTICS_RPC_URL: `http://127.0.0.1:${server.address().port}`,
    ANALYTICS_STATE_DIR: directory, ANALYTICS_LOG_RANGE: '10', ANALYTICS_MAX_SECONDS: '30',
    ANALYTICS_LOGS_FILE: '', ANALYTICS_LOG_RPC_URL: '', ANALYTICS_MAX_REQUESTS: '20000',
    ...overrides,
  } });
  await run();
  let published = JSON.parse(await readFile(join(directory, 'analytics.json'), 'utf8'));
  assert.equal(published.rows.at(-1).totalContributed, 15);
  assert.equal(published.rows.find(row => row.day === '2025-09-04').totalContributed, 8);
  assert.equal(published.rows.at(-1).totalStaked, 10);
  assert.equal(published.rows.at(-1).activeStakers, 1);
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  assert.equal(state.balances[`0:${newer}`], (10n * unit).toString());
  assert.equal(state.balances[`0:${old}`], undefined);

  const archiveFile = join(directory, 'archive.json');
  await writeFile(archiveFile, JSON.stringify({ schema: 2, topics, chainId: 8453, contract: STAKING,
    source: 'Base JSON-RPC', fromBlock: 0, toBlock: 107, blockHash: hash(107), logs }));
  await run({ ANALYTICS_LOGS_FILE: archiveFile, ANALYTICS_STATE_DIR: join(directory, 'archived') });
  const imported = JSON.parse(await readFile(join(directory, 'archived', 'analytics.json'), 'utf8'));
  assert.deepEqual(imported.rows, published.rows);

  logReads.length = 0;
  tip = 112;
  await run();
  assert.ok(logReads.every(([from]) => from > 110));
  const good = await readFile(join(directory, 'analytics.json'), 'utf8');
  published = JSON.parse(good);
  assert.equal(published.throughBlock, 112);
  assert.equal(published.rows.length, 13);

  tip = 114;
  badTotals = true;
  await assert.rejects(run(), /disagree with contract totals/);
  assert.equal(await readFile(join(directory, 'analytics.json'), 'utf8'), good);
  changedHash = true;
  await assert.rejects(run(), /checkpoint hash changed/);

  changedHash = false;
  badTotals = false;
  tip = 110;
  secondsPerBlock = 2;
  maxLogSpan = 100;
  await run({ ANALYTICS_STATE_DIR: join(directory, 'base-clock'), ANALYTICS_LOG_RANGE: '100' });
  const fast = JSON.parse(await readFile(join(directory, 'base-clock', 'analytics.json'), 'utf8'));
  assert.deepEqual(fast.rows, [{ day: '2025-09-01', activeStakers: 1, totalStaked: 10, totalContributed: 15 }]);
  await writeFile(join(directory, 'state.json'), JSON.stringify({ ...state, schema: 1 }));
  await assert.rejects(run(), /Incompatible checkpoint/);
  await writeFile(archiveFile, JSON.stringify({ schema: 1, chainId: 8453, contract: STAKING,
    source: 'Base JSON-RPC', fromBlock: 0, toBlock: 107, blockHash: hash(107), logs }));
  await assert.rejects(run({ ANALYTICS_LOGS_FILE: archiveFile }), /Invalid bootstrap archive/);
});
