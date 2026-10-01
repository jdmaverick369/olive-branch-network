const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { context, request, req, root } = require('./server-test-utils.cjs');
const OBN = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const CID = 'bafkreigh2akiscaildcye3pq5ksfwih56hn3aspxzrqtauhq2pj3tyjxf4';
const input = { fromToken: ETH, toToken: OBN, fromAmount: '100', taker: TAKER, slippageBps: 100 };
const env = { NEXT_PUBLIC_OBN_TOKEN: OBN, CDP_API_KEY_NAME: 'fake', CDP_API_KEY_PRIVATE_KEY: 'fake',
  BASE_APP_URL: 'https://app.invalid', NOTIFICATION_API_KEY: 'fake-auth', NEYNAR_API_KEY: 'fake', BASE_DASHBOARD_API_KEY: 'fake' };
const notification = { title: 'Test', body: 'Test', targetUrl: 'https://app.invalid', targetFids: [3] };
const auth = { authorization: 'Bearer fake-auth' };
const mockJwt = { '@coinbase/cdp-sdk/auth': { generateJwt: async () => 'mock-jwt' } };

test('unused wallet token proxy was removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/wallet/tokens/route.ts')), false);
});

test('IPFS validation preserves CIDv0/v1 and normalizes filenames but rejects mutable/traversal/control paths', () => {
  const { normalizeIpfsUri } = context().load('src/lib/ipfsUri.ts');
  for (const cid of [CID, 'QmYwAPJzv5CZsnAzt8auVZRnG97qA2mE9QF8VKPiTZFtMt']) {
    assert.equal(normalizeIpfsUri(`ipfs://${cid}/Olive1.json`), `ipfs://${cid}/Olive1.json`);
    assert.equal(normalizeIpfsUri(`ipfs://ipfs/${cid}/Olive%201.json`), `ipfs://${cid}/Olive%201.json`);
  }
  for (const suffix of ['/../x', '/%2e%2e/x', '/%252e%252e/x', '//x', '/x%2fy', '/x%5cy', '/x?y', '/x#y', '/%00x']) {
    assert.throws(() => normalizeIpfsUri('ipfs://' + CID + suffix));
  }
  for (const uri of ['ipfs://../ipns/example.org', 'ipfs://test', 'ipfs://' + 'b'.repeat(200), 'https://localhost/', 'ipfs://' + CID.slice(0,-2)]) {
    assert.throws(() => normalizeIpfsUri(uri));
  }
});

test('upstream JSON byte limit applies without Content-Length and cancels response stream', async () => {
  let cancelled = false;
  const app = context({ fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"long":"' + 'x'.repeat(64))); },
    cancel() { cancelled = true; },
  })) });
  const { fetchJsonBounded } = app.load('src/lib/server/http.ts');
  await assert.rejects(fetchJsonBounded('https://provider.invalid', {}, { maxBytes: 32 }), (e) => e.status === 502);
  assert.equal(cancelled, true);
});

test('upstream body deadline remains active after headers and cancels a stalled stream', async () => {
  let cancelled = false;
  let signal;
  const { fetchJsonBounded } = context({ fetch: async (_, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } }));
  } }).load('src/lib/server/http.ts');
  await assert.rejects(fetchJsonBounded('https://provider.invalid', {}, { timeoutMs: 20 }), (e) => e.status === 504);
  assert.equal(cancelled, true); assert.equal(signal.aborted, true);
});

test('upstream fetch rejects redirects and cancels non-OK/oversized responses', async () => {
  let options;
  const helper = context({ fetch: async (_, init) => { options = init; return new Response('{}', { headers: { 'content-length': '999' } }); } }).load('src/lib/server/http.ts');
  await assert.rejects(helper.fetchJsonBounded('https://provider.invalid', {}, { maxBytes: 32 }));
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  const failed = context({ fetch: async () => Response.json({ secret: 'sentinel' }, { status: 429 }) }).load('src/lib/server/http.ts');
  await assert.rejects(failed.fetchJsonBounded('https://provider.invalid'), (e) => e.status === 502 && !e.message.includes('sentinel'));
});

test('request JSON rejects oversized declared and streamed bodies before provider work', async () => {
  const { readRequestJson } = context().load('src/lib/server/http.ts');
  await assert.rejects(readRequestJson(request(undefined, { a: 'x'.repeat(40) }), 16), (e) => e.status === 413);
  await assert.rejects(readRequestJson(request(undefined, {}, { 'content-length': '999' }), 16), (e) => e.status === 413);
  await assert.rejects(readRequestJson(new Request('https://app.invalid', { method: 'POST', body: '{}' }), 16), (e) => e.status === 415);
  assert.deepEqual(await readRequestJson(request(undefined, { a: 1 }), 16), { a: 1 });
});

test('resource guard coalesces/cache-bounds reads, rejects concurrent excess, and releases failed slots', async () => {
  const { createResourceGuard } = context().load('src/lib/server/http.ts');
  const run = createResourceGuard({ requestsPerMinute: 10, maxConcurrent: 1, cacheMs: 1000, maxEntries: 1 });
  let release, calls = 0;
  const first = run('one', () => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const duplicate = run('one', async () => { calls++; return 0; });
  await assert.rejects(run('two', async () => 2), (e) => e.status === 429);
  release(1); assert.equal(await first, 1); assert.equal(await duplicate, 1);
  assert.equal(await run('one', async () => { calls++; return 0; }), 1); assert.equal(calls, 1);
  await assert.rejects(run('failure', async () => { throw Error('failure'); }));
  assert.equal(await run('two', async () => 2), 2);
  assert.equal(await run('one', async () => 3), 3); // bounded cache evicted old key
});

test('resource guard caps distinct upstream work and does not coalesce executable operations', async () => {
  const { createResourceGuard } = context().load('src/lib/server/http.ts');
  const run = createResourceGuard({ requestsPerMinute: 2, maxConcurrent: 2, coalesce: false });
  let calls = 0;
  await Promise.all([run('same', async () => ++calls), run('same', async () => ++calls)]);
  assert.equal(calls, 2);
  await assert.rejects(run('third', async () => 3), (e) => e.status === 429);
});

test('metadata fallback stays on fixed gateways, parses bounded objects, and caches normalized content', async () => {
  const calls = [];
  const app = context({ fetch: async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? Response.json({}, { status: 503 }) : Response.json({ name: 'Olive', image: 'ipfs://' + CID + '/image.png' });
  } });
  const route = app.route('nft-metadata');
  const response = await route.GET(request('https://app.invalid?uri=ipfs://' + CID + '/Olive1.json'));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /immutable/);
  assert.equal((await response.json()).name, 'Olive'); assert.equal(calls.length, 2);
  await route.GET(request('https://app.invalid?uri=ipfs://ipfs/' + CID + '/Olive1.json'));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.ok(calls.every(({ url }) => new URL(url).pathname === '/ipfs/' + CID + '/Olive1.json'));
});

test('IPFS redirects preserve gateway compatibility without exposing arbitrary hosts or other resources', async () => {
  const { matchesIpfsGatewayResource } = context().load('src/lib/ipfsUri.ts');
  const gateways = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];
  const uri = 'ipfs://' + CID + '/Olive1.json';
  assert.equal(matchesIpfsGatewayResource(new URL('https://' + CID + '.ipfs.dweb.link/Olive1.json'), uri, gateways), true);
  assert.equal(matchesIpfsGatewayResource(new URL('https://ipfs.io/ipfs/' + CID + '/Olive1.json'), uri, gateways), true);
  for (const url of ['http://127.0.0.1/', 'https://ipfs.io.evil.invalid/ipfs/' + CID + '/Olive1.json',
    'https://ipfs.io/ipfs/' + CID + '/Other.json', 'https://ipfs.io/ipns/example.invalid', 'https://user:pass@ipfs.io/ipfs/' + CID + '/Olive1.json']) {
    assert.equal(matchesIpfsGatewayResource(new URL(url), uri, gateways), false);
  }
  let calls = 0;
  const helper = context({ fetch: async () => {
    calls++; return calls === 1 ? new Response(null, { status: 302, headers: { location: 'https://' + CID + '.ipfs.dweb.link/Olive1.json' } }) : Response.json({ name: 'Olive' });
  } }).load('src/lib/server/http.ts');
  assert.deepEqual(await helper.fetchJsonBounded('https://ipfs.io/ipfs/' + CID + '/Olive1.json', {}, {
    allowRedirect: (url) => matchesIpfsGatewayResource(url, uri, gateways),
  }), { name: 'Olive' });
  assert.equal(calls, 2);
});

test('swap scalar, uint256, token, duplicate-query and body limits reject before signing', async () => {
  let signs = 0;
  const app = context({ env, mocks: { '@coinbase/cdp-sdk/auth': { generateJwt: async () => { signs++; return 'mock'; } } } });
  const { parseSwapInput } = app.load('src/lib/server/swap.ts');
  for (const change of [{ fromToken: [ETH] }, { fromAmount: 100 }, { fromAmount: (1n << 256n).toString() },
    { fromAmount: '1'.repeat(79) }, { fromAmount: '0' }, { slippageBps: '100' }, { slippageBps: 500 }, { taker: 'bad' }, { toToken: TAKER }]) {
    assert.throws(() => parseSwapInput({ ...input, ...change }), (e) => e.status === 400);
  }
  assert.equal(parseSwapInput({ ...input, fromAmount: ((1n << 256n) - 1n).toString() }).fromAmount.length, 78);
  const duplicate = await app.route('swap/price').GET(request('https://app.invalid?' + new URLSearchParams(input) + '&fromAmount=2'));
  assert.equal(duplicate.status, 400);
  assert.equal((await app.route('swap/quote').POST(request(undefined, { ...input, unknown: 'x'.repeat(5000) }))).status, 413);
  assert.equal(signs, 0);
});

test('swap estimates are deduplicated and briefly cached; executable quotes are independent', async () => {
  let calls = 0;
  const app = context({ env, mocks: mockJwt, fetch: async () => { calls++; return Response.json({ liquidityAvailable: false }); } });
  const { swapResponse } = app.load('src/lib/server/swap.ts');
  await Promise.all([swapResponse('GET', input), swapResponse('GET', input)]);
  await swapResponse('GET', input); assert.equal(calls, 1);
  await Promise.all([swapResponse('POST', input), swapResponse('POST', input)]); assert.equal(calls, 3);
});

test('entire notification schema and explicit audience intent are checked before either platform sends', async () => {
  let sends = 0, lookups = 0;
  const app = context({ env, mocks: {
    '@/lib/notificationSender': { sendMiniAppNotification: async () => { sends++; return { state: 'success' }; } },
    '@/lib/baseAppNotificationSender': { getBaseAppOptedInUsers: async () => { lookups++; return [TAKER]; }, sendBaseAppNotification: async () => { sends++; return { state: 'success' }; } },
  } });
  const route = app.route('notifications/send');
  for (const change of [{ walletAddresses: TAKER }, { walletAddresses: [3] }, { targetFids: ['3'] }, { targetFids: Array(101).fill(3) },
    { title: 'a'.repeat(31) }, { body: 'a'.repeat(129) }, { targetUrl: 'https://evil.invalid' }, { targetPath: '//evil.invalid' },
    { targetPath: '/%2fexample' }, { filters: { minimum_user_score: 2 } }, { broadcast: true }, { targetFids: [] }]) {
    assert.equal((await route.POST(request(undefined, { ...notification, ...change }, auth))).status, 400);
  }
  assert.equal(sends, 0); assert.equal(lookups, 0);
  const targeted = await route.POST(request(undefined, notification, auth));
  assert.equal(targeted.status, 200); assert.equal((await targeted.json()).baseApp.state, 'skipped'); assert.equal(sends, 1); assert.equal(lookups, 0);
  const broadcast = await route.POST(request(undefined, { ...notification, targetFids: [], broadcast: true }, auth));
  assert.equal(broadcast.status, 200); assert.equal(sends, 3); assert.equal(lookups, 1);
});

test('failed Base broadcast audience lookup prevents both sends', async () => {
  let sends = 0;
  const route = context({ env, mocks: {
    '@/lib/notificationSender': { sendMiniAppNotification: async () => { sends++; } },
    '@/lib/baseAppNotificationSender': { getBaseAppOptedInUsers: async () => { throw Error('PRIVATE_SENTINEL'); }, sendBaseAppNotification: async () => { sends++; } },
  } }).route('notifications/send');
  const response = await route.POST(request(undefined, { ...notification, targetFids: [], broadcast: true }, auth));
  assert.equal(response.status, 502); assert.equal(sends, 0); assert.ok(!(await response.text()).includes('PRIVATE_SENTINEL'));
});

test('Base send HTTP429 and malformed acknowledgements report all affected recipients unconfirmed', async () => {
  for (const response of [() => Response.json({ error: 'PRIVATE_SENTINEL' }, { status: 429 }),
    () => Response.json({ success: true, results: [], sentCount: 1, failedCount: 0 }),
    () => Response.json({ success: true, results: [{ walletAddress: OBN, sent: true }], sentCount: 1, failedCount: 0 })]) {
    const sender = context({ env, fetch: async () => response() }).load('src/lib/baseAppNotificationSender.ts');
    const result = await sender.sendBaseAppNotification({ appUrl: 'https://app.invalid', walletAddresses: [TAKER], title: 'Test', message: 'Test' });
    assert.equal(result.state, 'error'); assert.equal(result.failedCount, 1); assert.equal(result.sentCount, 0);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  }
});

test('Base success/partial failure counts are derived and verified per exact recipient', async () => {
  for (const partial of [false, true]) {
    const results = [{ walletAddress: TAKER, sent: true }, { walletAddress: OBN, sent: !partial }];
    const sender = context({ env, fetch: async () => Response.json({ success: !partial, results, sentCount: partial ? 1 : 2, failedCount: partial ? 1 : 0 }) }).load('src/lib/baseAppNotificationSender.ts');
    const result = await sender.sendBaseAppNotification({ appUrl: 'https://app.invalid', walletAddresses: [TAKER, OBN, TAKER], title: 'Test', message: 'Test' });
    assert.equal(result.state, partial ? 'error' : 'success'); assert.equal(result.sentCount, partial ? 1 : 2); assert.equal(result.failedCount, partial ? 1 : 0);
  }
});

test('Base audience pagination fails closed on HTTP errors, repeated cursor, invalid opt-in, or malformed schema', async () => {
  for (const fixture of [() => Response.json({ success: false }, { status: 401 }),
    () => Response.json({ success: true, users: [{ address: TAKER, notificationsEnabled: false }] }),
    () => Response.json({ success: true, users: [{ address: TAKER, notificationsEnabled: true }], nextCursor: 'repeated' })]) {
    let calls = 0;
    const sender = context({ env, fetch: async () => { calls++; return fixture(); } }).load('src/lib/baseAppNotificationSender.ts');
    await assert.rejects(sender.getBaseAppOptedInUsers('https://app.invalid')); assert.ok(calls <= 2);
  }
});

test('Neynar documented synchronous/queued responses are distinguished from delivery failures', async () => {
  const campaign_id = '3c90c3cc-0d44-4b50-8888-8dd25736052a';
  for (const [status, body, expected] of [
    [200, { campaign_id, success_count: 1, failure_count: 0, not_attempted_count: 0 }, 'success'],
    [200, { campaign_id, success_count: 0, failure_count: 1, not_attempted_count: 0 }, 'error'],
    [202, { campaign_id }, 'accepted'], [200, {}, 'error'], [429, { error: 'PRIVATE_SENTINEL' }, 'error'],
  ]) {
    const sender = context({ env, fetch: async () => Response.json(body, { status }) }).load('src/lib/notificationSender.ts');
    const result = await sender.sendMiniAppNotification(notification);
    assert.equal(result.state, expected); assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  }
});

test('direct CDP adapter matches pinned SDK request semantics and projected quote/price outputs offline', async () => {
  // The real SDK is exercised against an in-memory Axios adapter, never a provider.
  process.env.DISABLE_CDP_ERROR_REPORTING = 'true'; process.env.DISABLE_CDP_USAGE_TRACKING = 'true';
  const { generateKeyPairSync } = require('node:crypto');
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  const { CdpClient } = req('@coinbase/cdp-sdk');
  const client = new CdpClient({ apiKeyId: '00000000-0000-0000-0000-000000000000', apiKeySecret: key });
  const sdkDir = path.dirname(req.resolve('@coinbase/cdp-sdk'));
  const { CdpOpenApiClient } = req(path.join(sdkDir, 'openapi-client/index.js'));
  const fixture = { liquidityAvailable: true, fromToken: ETH, toToken: OBN, fromAmount: '100', toAmount: '90', minToAmount: '89', blockNumber: '123',
    fees: { gasFee: { amount: '1', token: ETH }, protocolFee: null }, issues: { allowance: null, balance: null, simulationIncomplete: false },
    transaction: { to: TAKER, data: '0x1234', value: '100', gas: '100000', gasPrice: '10' },
    permit2: { eip712: { domain: { name: 'Permit2', chainId: 8453, verifyingContract: TAKER }, types: {}, primaryType: 'PermitTransferFrom', message: { nonce: '1' } } } };
  const sdkRequests = [];
  CdpOpenApiClient.getAxiosInstance().defaults.adapter = async (config) => {
    sdkRequests.push(config); return { data: fixture, status: 200, statusText: 'OK', headers: {}, config };
  };
  const sdkInput = { ...input, fromAmount: BigInt(input.fromAmount), network: 'base' };
  const sdkPrice = await client.evm.getSwapPrice(sdkInput);
  const sdkQuote = await client.evm.createSwapQuote(sdkInput);
  const directRequests = [], jwtRequests = [];
  const app = context({ env, mocks: { '@coinbase/cdp-sdk/auth': { generateJwt: async (value) => { jwtRequests.push(value); return 'mock-jwt'; } } }, fetch: async (url, options) => {
    directRequests.push({ url: new URL(url), options }); return Response.json(fixture);
  } });
  const { swapResponse } = app.load('src/lib/server/swap.ts');
  const actualPrice = await swapResponse('GET', input);
  const actualQuote = await swapResponse('POST', input);
  const clean = (value) => JSON.parse(JSON.stringify(value, (_, child) => typeof child === 'bigint' ? child.toString() : child));
  assert.deepEqual(actualPrice, clean({ liquidityAvailable: true, toAmount: sdkPrice.toAmount, minToAmount: sdkPrice.minToAmount }));
  assert.deepEqual(clean(actualQuote), clean({ liquidityAvailable: true, fromToken: sdkQuote.fromToken, toToken: sdkQuote.toToken,
    fromAmount: sdkQuote.fromAmount, toAmount: sdkQuote.toAmount, minToAmount: sdkQuote.minToAmount, blockNumber: sdkQuote.blockNumber,
    fees: sdkQuote.fees, issues: sdkQuote.issues, transaction: { to: sdkQuote.transaction.to, data: sdkQuote.transaction.data, value: sdkQuote.transaction.value, gas: sdkQuote.transaction.gas }, permit2: sdkQuote.permit2 }));
  assert.deepEqual(Object.fromEntries(directRequests[0].url.searchParams), Object.fromEntries(Object.entries(sdkRequests[0].params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])));
  assert.deepEqual(JSON.parse(directRequests[1].options.body), JSON.parse(sdkRequests[1].data));
  for (let i = 0; i < 2; i++) {
    assert.equal(directRequests[i].url.pathname, '/platform' + sdkRequests[i].url);
    assert.equal(jwtRequests[i].requestPath, directRequests[i].url.pathname);
    assert.equal(jwtRequests[i].requestHost, 'api.cdp.coinbase.com');
    assert.equal(directRequests[i].options.method, sdkRequests[i].method.toUpperCase());
    assert.equal(directRequests[i].options.redirect, 'error');
  }
});
