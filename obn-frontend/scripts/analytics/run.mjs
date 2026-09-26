import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { abi, STAKING, GOVERNANCE, LENS, governanceAbi, governanceTopic, topics, initialState, advanceDay, applyEvent, setBalance, totals, snapshot, baseTimestamp, poolActiveCounts } from './core.mjs';

const directory = resolve(process.env.ANALYTICS_STATE_DIR || '.analytics');
const rpcUrl = process.env.ANALYTICS_RPC_URL || process.env.BASE_RPC_URL || process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;
if (!rpcUrl) throw new Error('Set ANALYTICS_RPC_URL to a Base mainnet RPC with historical state access');
const positive = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
};
const maxSeconds = positive('ANALYTICS_MAX_SECONDS', 480);
const maxRequests = positive('ANALYTICS_MAX_REQUESTS', 20000);
if (maxRequests < 128) throw new Error('ANALYTICS_MAX_REQUESTS must be at least 128');
const started = Date.now();
let requests = 0;
const hex = n => `0x${n.toString(16)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rpc(method, params, endpointOverride) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (++requests > maxRequests) throw new Error('RPC request budget reached; resume the next run');
    let response;
    try {
      const endpoint = endpointOverride || (method === 'eth_getLogs' ? process.env.ANALYTICS_LOG_RPC_URL || rpcUrl : rpcUrl);
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requests, method, params }), signal: AbortSignal.timeout(20000) });
    } catch {
      if (attempt === 3) throw new Error(`RPC transport failed for ${method}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const body = await response.json().catch(() => null);
    if (response.ok && body && !body.error && body.result !== undefined) return body.result;
    // Never log provider error messages: they can contain credentials or request URLs.
    const code = body?.error?.code;
    const message = String(body?.error?.message || '');
    const limited = response.status === 429 || code === 429 || /rate limit|too many requests|compute units per second/i.test(message);
    if (limited || response.status === 408 || response.status >= 500) {
      if (attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
    }
    const error = new Error(`RPC ${method} failed (HTTP ${response.status}, code ${code ?? 'unknown'})`);
    error.range = method === 'eth_getLogs' && !limited && /block range|ranges over|maximum.*blocks|limited to|too many results|response size|query returned more/i.test(message);
    throw error;
  }
}

async function block(tag) {
  const value = await rpc('eth_getBlockByNumber', [typeof tag === 'number' ? hex(tag) : tag, false]);
  return parseBlock(value);
}
function parseBlock(value) {
  if (!value) throw new Error('Requested block unavailable');
  return { number: Number(BigInt(value.number)), timestamp: Number(BigInt(value.timestamp)), hash: value.hash };
}
// Small batches preserve every hash check while reducing transport overhead.
// Providers without batching use ordinary calls.
async function blockBatch(numbers) {
  if (numbers.length === 1) return [await block(numbers[0])];
  for (let attempt = 0; attempt < 4; attempt++) {
    if (requests + numbers.length > maxRequests) throw new Error('RPC request budget reached; resume the next run');
    const calls = numbers.map(number => ({ jsonrpc: '2.0', id: ++requests,
      method: 'eth_getBlockByNumber', params: [hex(number), false] }));
    let response;
    try {
      response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(calls), signal: AbortSignal.timeout(20000) });
    } catch {
      if (attempt === 3) throw new Error('Block batch transport failed');
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      if (attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error('Block batch temporarily unavailable');
    }
    const data = await response.json().catch(() => null);
    if (Array.isArray(data) && data.some(item => item.error &&
        (item.error.code === 429 || /rate limit|too many requests|compute units per second/i.test(String(item.error.message))))) {
      if (attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error('Block batch rate limit reached; resume the saved checkpoint');
    }
    if (!response.ok || !Array.isArray(data) || data.some(item => item.error)) {
      const result = [];
      for (const number of numbers) result.push(await block(number));
      return result;
    }
    const byId = new Map(data.map(item => [item.id, item.result]));
    return calls.map((call, i) => {
      const result = parseBlock(byId.get(call.id));
      if (result.number !== numbers[i]) throw new Error('Unexpected batch block number');
      return result;
    });
  }
}
async function call(name, args, at) {
  const result = await rpc('eth_call', [{ to: STAKING, data: abi.encodeFunctionData(name, args) }, hex(at)]);
  return abi.decodeFunctionResult(name, result)[0];
}
async function governanceLogs(from, to) {
  if (to - from >= 10000) {
    return [...await governanceLogs(from, from + 9999), ...await governanceLogs(from + 10000, to)];
  }
  try {
    return await rpc('eth_getLogs', [{ address: GOVERNANCE, fromBlock: hex(from), toBlock: hex(to), topics: [governanceTopic] }]);
  } catch (error) {
    if (!error.range || from === to) throw error;
    const middle = Math.floor((from + to) / 2);
    return [...await governanceLogs(from, middle), ...await governanceLogs(middle + 1, to)];
  }
}
async function save(name, value) {
  const path = resolve(directory, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
async function readState() {
  try { return JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function run() {
  if (Number(BigInt(await rpc('eth_chainId', []))) !== 8453) throw new Error('Analytics requires Base mainnet');
  if (process.env.ANALYTICS_LOG_RPC_URL && Number(BigInt(await rpc('eth_chainId', [], process.env.ANALYTICS_LOG_RPC_URL))) !== 8453) {
    throw new Error('Log RPC must also use Base mainnet');
  }
  const tip = await block('finalized');
  let archive = null;
  if (process.env.ANALYTICS_LOGS_FILE) {
    archive = JSON.parse(await readFile(resolve(process.env.ANALYTICS_LOGS_FILE), 'utf8'));
    if (archive.schema !== 2 || JSON.stringify(archive.topics) !== JSON.stringify(topics) || archive.chainId !== 8453 || archive.contract !== STAKING || archive.fromBlock !== 0 || archive.source !== 'Base JSON-RPC' ||
        !Number.isSafeInteger(archive.toBlock) || archive.toBlock > tip.number || !Array.isArray(archive.logs) ||
        (await block(archive.toBlock)).hash !== archive.blockHash) throw new Error('Invalid bootstrap archive');
  }
  let state = await readState();
  if (state) {
    if (state.schema !== 3 || state.governance !== GOVERNANCE || !state.pools || !state.annualCycles || !state.charityWallets || !state.removedPools || typeof state.seedClaims !== 'string' || state.chainId !== 8453 || state.contract !== STAKING) throw new Error('Incompatible checkpoint; rebuild nonprofit pool history');
    if (state.cursor > tip.number) throw new Error('RPC finalized tip is behind the checkpoint');
    if (state.blockHash && (await block(state.cursor)).hash !== state.blockHash) throw new Error('Finalized checkpoint hash changed; rebuild history before publishing');
  } else {
    // Discover proxy creation, so an upgrade block cannot accidentally truncate history.
    let low = 0, high = tip.number;
    if (await rpc('eth_getCode', [STAKING, hex(high)]) === '0x') throw new Error('Staking proxy not deployed');
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (await rpc('eth_getCode', [STAKING, hex(middle)]) === '0x') low = middle + 1;
      else high = middle;
    }
    state = initialState(low, (await block(low)).timestamp);
    await save('state.json', state);
    console.log(`Discovered staking deployment block ${low}`);
  }
  if (state.governanceStartBlock === undefined) {
    let low = 0, high = tip.number;
    if (await rpc('eth_getCode', [GOVERNANCE, hex(high)]) === '0x') throw new Error('Annual governance proxy not deployed');
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (await rpc('eth_getCode', [GOVERNANCE, hex(middle)]) === '0x') low = middle + 1;
      else high = middle;
    }
    if (low < state.startBlock) throw new Error('Governance predates staking; historical payout coverage requires review');
    state.governanceStartBlock = low;
    await save('state.json', state);
    console.log(`Discovered annual governance deployment block ${low}`);
  }
  let range = positive('ANALYTICS_LOG_RANGE', state.logRange || 10000);
  while (state.cursor < tip.number && Date.now() - started < maxSeconds * 1000 && requests < maxRequests - 100) {
    const from = state.cursor + 1;
    const archived = archive && from <= archive.toBlock;
    const to = archived ? Math.min(from + 99999, archive.toBlock) : Math.min(from + range - 1, tip.number);
    let logs;
    try {
      logs = archived ? archive.logs.filter(log => Number(BigInt(log.blockNumber)) >= from && Number(BigInt(log.blockNumber)) <= to && topics.includes(log.topics[0]))
        .map(log => ({ ...log, topics: log.topics.filter(Boolean) }))
        : await rpc('eth_getLogs', [{ address: STAKING, fromBlock: hex(from), toBlock: hex(to), topics: [topics] }]);
    }
    catch (error) {
      if (error.range && range > 1) { range = Math.max(1, Math.floor(range / 2)); continue; }
      throw error;
    }
    if (to >= state.governanceStartBlock) logs.push(...await governanceLogs(Math.max(from, state.governanceStartBlock), to));
    logs.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
    const groups = new Map();
    const seen = new Set();
    for (const log of logs) {
      const n = Number(BigInt(log.blockNumber));
      const key = `${log.blockHash}:${log.logIndex}`;
      const validSource = (log.address.toLowerCase() === STAKING.toLowerCase() && topics.includes(log.topics[0])) ||
        (log.address.toLowerCase() === GOVERNANCE.toLowerCase() && log.topics[0] === governanceTopic);
      if (log.removed || n < from || n > to || !validSource) throw new Error('Invalid RPC log');
      if (seen.has(key)) continue;
      seen.add(key);
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(log);
    }
    // Each range is committed atomically; a failed range is safely retried on the next run.
    const next = structuredClone(state);
    // Timestamp finalized RPC logs using Base's clock, checked against real range
    // anchors. This avoids thousands of redundant header requests in busy history.
    const numbers = [...groups.keys()];
    const end = to === tip.number ? tip : await block(to);
    const headers = new Map();
    headers.set(end.number, end);
    const first = numbers.length ? (headers.get(numbers[0]) || await block(numbers[0])) : end;
    headers.set(first.number, first);
    const lastNumber = numbers.at(-1) ?? end.number;
    const last = headers.get(lastNumber) || await block(lastNumber);
    headers.set(last.number, last);
    const fixedClock = baseTimestamp(first, end, last.number) === last.timestamp;
    const missingHeaders = fixedClock ? [] : numbers.filter(number => !headers.has(number));
    let headerIndex = 0;
    await Promise.all(Array.from({ length: Math.min(2, missingHeaders.length) }, async () => {
      while (headerIndex < missingHeaders.length) {
        const batch = missingHeaders.slice(headerIndex, headerIndex + 5);
        headerIndex += batch.length;
        for (const header of await blockBatch(batch)) headers.set(header.number, header);
      }
    }));
    for (const [number, entries] of groups) {
      const at = headers.get(number) || { timestamp: baseTimestamp(first, end, number) };
      const expectedHash = at.hash || entries[0].blockHash;
      if (entries.some(log => log.blockHash !== expectedHash)) throw new Error('Log/block hash mismatch');
      advanceDay(next, at.timestamp);
      const events = entries.map(log => (log.address.toLowerCase() === GOVERNANCE.toLowerCase() ? governanceAbi : abi).parseLog(log));
      const migrated = new Map();
      for (const event of events) {
        if (event.name === 'CharityWalletUpdated') {
          const { pid, oldWallet, newWallet } = event.args;
          for (const wallet of [oldWallet, newWallet]) migrated.set(`${pid}:${wallet.toLowerCase()}`, { pid, wallet });
        }
      }
      for (const event of events) {
        // End-of-block state handles migrations, including same-block deposits/withdrawals.
        if (['Deposit', 'Withdraw'].includes(event.name) && migrated.has(`${event.args.pid}:${event.args.user.toLowerCase()}`)) continue;
        try { applyEvent(next, event); }
        catch (error) { throw new Error(`${error.message} (block ${number})`); }
      }
      for (const { pid, wallet } of migrated.values()) setBalance(next, pid, wallet, await call('userAmount', [pid, wallet], number));
    }
    advanceDay(next, end.timestamp);
    next.cursor = to;
    next.blockHash = end.hash;
    next.logRange = range;
    await save('state.json', next);
    state = next;
    if (groups.size || to === tip.number) console.log(`Indexed through ${to}; ${logs.length} events; ${requests} RPC requests`);
  }
  if (state.cursor < tip.number) {
    console.log(`Backfill checkpoint saved at ${state.cursor}/${tip.number}; rerun to continue. Published charts unchanged.`);
    return;
  }
  const expectedStake = await call('globalTotalStaked', [], tip.number);
  const expectedActive = await call('uniqueStakersGlobal', [], tip.number);
  const actual = totals(state);
  if (actual.staked !== expectedStake || BigInt(actual.active) !== expectedActive) throw new Error('Rebuilt balances disagree with contract totals; refusing to publish');
  const counts = poolActiveCounts(state);
  const poolResult = await rpc('eth_call', [{ to: LENS, data: abi.encodeFunctionData('listPoolsBasic', []) }, hex(tip.number)]);
  const [, , expectedCounts] = abi.decodeFunctionResult('listPoolsBasic', poolResult);
  for (const pid of Object.keys(state.pools)) {
    if (BigInt(counts[pid] || 0) !== expectedCounts[Number(pid)]) {
      throw new Error(`Rebuilt active stakers disagree with pool ${pid}; refusing to publish`);
    }
  }
  await save('analytics.json', snapshot(state, tip));
  console.log(`Published ${state.rows.length + 1} daily points; ${actual.active} active wallets; ${requests} RPC requests`);
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
