const test = require('node:test');
const assert = require('node:assert/strict');
const { context, request } = require('./server-test-utils.cjs');
const OBN = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';
const CID = 'bafkreigh2akiscaildcye3pq5ksfwih56hn3aspxzrqtauhq2pj3tyjxf4';

test('notifications fail closed before parsing or contacting providers', async () => {
  let sends = 0;
  const env = { BASE_APP_URL: 'https://app.invalid', NEYNAR_API_KEY: 'fake' };
  const route = context({ env, mocks: {
    '@/lib/notificationSender': { sendMiniAppNotification: async () => { sends++; return { state: 'success' }; } },
    '@/lib/baseAppNotificationSender': {},
  } }).route('notifications/send');
  const body = { title: 'Test', body: 'Test', targetUrl: 'https://app.invalid', targetFids: [3] };
  assert.equal((await route.POST(request(undefined, body))).status, 503);
  env.NOTIFICATION_API_KEY = 'fake-auth';
  for (const key of ['', 'wrong']) assert.equal((await route.POST(request(undefined, body, { authorization: 'Bearer ' + key }))).status, 401);
  assert.equal(sends, 0);
  assert.equal((await route.POST(request(undefined, body, { authorization: 'Bearer fake-auth' }))).status, 200);
  assert.equal(sends, 1);
});

test('metadata rejects arbitrary URLs and malformed IPFS before fetching', async () => {
  let fetches = 0;
  const route = context({ mocks: { '@/lib/ipfs': { fetchIpfsJson: async () => { fetches++; return { name: 'NFT' }; } } } }).route('nft-metadata');
  for (const uri of ['https://example.org', 'http://127.0.0.1', 'file:///test', 'ipfs://test/metadata.json', 'ipfs://../ipns/test']) {
    assert.equal((await route.GET(request('https://app.invalid?uri=' + encodeURIComponent(uri)))).status, 400);
  }
  assert.equal(fetches, 0);
  assert.equal((await route.GET(request('https://app.invalid?uri=ipfs://' + CID + '/metadata.json'))).status, 200);
  assert.equal(fetches, 1);
});

test('swap provider exceptions never reach response bodies', async () => {
  const app = context({ env: { NEXT_PUBLIC_OBN_TOKEN: OBN, CDP_API_KEY_NAME: 'fake', CDP_API_KEY_PRIVATE_KEY: 'fake' },
    mocks: { '@coinbase/cdp-sdk/auth': { generateJwt: async () => 'mock-jwt' } }, fetch: async () => { throw Error('SECRET_SENTINEL'); } });
  const body = { fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', toToken: OBN, fromAmount: '100', taker: TAKER };
  const responses = [await app.route('swap/price').GET(request('https://app.invalid?' + new URLSearchParams(body))),
    await app.route('swap/quote').POST(request(undefined, body))];
  for (const response of responses) { assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('SECRET_SENTINEL')); }
});

test('verified-addresses validates fid, validates public address output, and sanitizes failures', async () => {
  let fetches = 0;
  let fail = false;
  const env = { NEYNAR_API_KEY: 'fake' };
  const route = context({ env, fetch: async () => {
    fetches++; if (fail) throw Error('SECRET_SENTINEL');
    return Response.json({ users: [{ verified_addresses: { eth_addresses: [TAKER, 'invalid', TAKER.toUpperCase().replace('0X','0x')], primary: { eth_address: TAKER } } }] });
  } }).route('farcaster/verified-addresses');
  const get = (fid) => route.GET(request('https://app.invalid?fid=' + encodeURIComponent(fid)));
  for (const fid of ['', '0', '-1', '1;drop', '1&fids=2', '12345678901']) assert.equal((await get(fid)).status, 400);
  assert.equal(fetches, 0);
  assert.deepEqual(await (await get('3')).json(), { addresses: [TAKER], primary: TAKER });
  fail = true;
  const bad = await get('4'); assert.equal(bad.status, 502); assert.ok(!(await bad.text()).includes('SECRET_SENTINEL'));
  delete env.NEYNAR_API_KEY;
  assert.equal((await get('3')).status, 503);
});
