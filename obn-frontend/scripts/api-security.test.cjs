const test = require('node:test');
const assert = require('node:assert/strict');
const { context, request, req } = require('./server-test-utils.cjs');
const OBN = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';
const CID = 'bafkreigh2akiscaildcye3pq5ksfwih56hn3aspxzrqtauhq2pj3tyjxf4';
const { createHmac } = require('node:crypto');
const PREVIEW_CODE = 'preview-code-0123456789';
const PREVIEW = 'obn_preview=' + createHmac('sha256', PREVIEW_CODE).update('obn-preview-v1').digest('base64url');
function sessionCookie(address, secret, expires = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(JSON.stringify({ a: address, e: expires })).toString('base64url');
  return 'obn_session=' + payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}

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

test('onramp orders validate input, build an embedded Apple Pay order, and never leak provider errors', async () => {
  const calls = [];
  let reply = () => Response.json({
    order: { orderId: 'order-1', paymentTotal: '5.25', purchaseAmount: '4.800000' },
    paymentLink: { url: 'https://pay.coinbase.com/v2/api-onramp/embedded?orderId=order-1', paymentLinkType: 'PAYMENT_LINK_TYPE_EMBEDDED_ORDER' },
  }, { status: 201 });
  const env = { CDP_API_KEY_NAME: 'fake', CDP_API_KEY_PRIVATE_KEY: 'fake', NEXT_PUBLIC_SITE_URL: 'https://app.invalid', AUTH_SESSION_SECRET: 'x'.repeat(32), PREVIEW_ACCESS_CODE: PREVIEW_CODE };
  const app = context({ env, mocks: { '@coinbase/cdp-sdk/auth': { generateJwt: async () => 'mock-jwt' } }, fetch: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return reply();
  } });
  const route = app.route('onramp/order');
  const session = sessionCookie(TAKER, env.AUTH_SESSION_SECRET);
  const post = (body, headers) => route.POST(request(undefined, body, { cookie: session + '; ' + PREVIEW, ...headers }));
  const valid = { address: TAKER, amountUsd: 5, poolId: 0 };
  for (const body of [{ address: 'bad', amountUsd: 10, poolId: 0 }, { address: TAKER, amountUsd: 1, poolId: 0 },
    { address: TAKER, amountUsd: 501, poolId: 0 }, { address: TAKER, amountUsd: 10.001, poolId: 0 }, { address: TAKER, amountUsd: 4.99, poolId: 0 },
    { address: TAKER, amountUsd: 10, poolId: 9999 }, { address: TAKER, amountUsd: 10, poolId: 0, extra: 1 }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(calls.length, 0);

  const ok = await post(valid, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { orderId: 'order-1', paymentLinkUrl: 'https://pay.coinbase.com/v2/api-onramp/embedded?orderId=order-1',
    paymentTotal: '5.25', purchaseAmount: '4.800000', sandbox: false });
  assert.equal(calls[0].url, 'https://api.cdp.coinbase.com/platform/v2/onramp/orders');
  const sent = calls[0].body;
  assert.equal(sent.paymentMethod, 'GUEST_CHECKOUT_APPLE_PAY');
  assert.equal(sent.paymentAmount, '5.00'); assert.equal(sent.paymentCurrency, 'USD');
  assert.equal(sent.purchaseCurrency, 'USDC'); assert.equal(sent.destinationNetwork, 'base'); assert.equal(sent.destinationAddress, TAKER);
  assert.equal(sent.partnerUserRef, TAKER.toLowerCase());
  assert.equal(sent.clientIp, '203.0.113.7');
  assert.equal(sent.domain, 'app.invalid');
  // Embedded order: Coinbase collects contact details itself, so none are sent.
  for (const key of ['email', 'phoneNumber', 'phoneNumberVerifiedAt', 'agreementAcceptedAt', 'userAuthToken']) assert.equal(key in sent, false, key);

  await post(valid, { host: 'localhost:3000' });
  assert.equal(calls.at(-1).body.domain, 'localhost');
  env.NODE_ENV = 'production';
  await post(valid, { host: 'localhost:3000' });
  assert.equal(calls.at(-1).body.domain, 'app.invalid');
  delete env.NODE_ENV;

  env.ONRAMP_SANDBOX = 'true';
  const sandboxBody = await (await post(valid)).json();
  assert.equal(sandboxBody.sandbox, true);
  assert.equal(new URL(sandboxBody.paymentLinkUrl).searchParams.get('useApplePaySandbox'), 'true');
  assert.equal(calls.at(-1).body.partnerUserRef, 'sandbox-' + TAKER.toLowerCase());
  env.VERCEL_ENV = 'production'; // Never sandbox on the live site, even if misconfigured.
  await post(valid);
  assert.equal(calls.at(-1).body.partnerUserRef, TAKER.toLowerCase());
  delete env.ONRAMP_SANDBOX; delete env.VERCEL_ENV;

  for (const ip of ['::1', '127.0.0.1', '10.1.2.3', '192.168.1.5', '172.20.0.1', 'fd00::1']) {
    assert.equal((await post(valid, { 'x-forwarded-for': ip })).status, 200);
    assert.equal(calls.at(-1).body.clientIp, undefined, ip);
  }

  // Returning buyers: Coinbase's token is kept in an HttpOnly cookie and sent back on the next order.
  const token = 'dXNlci1hdXRoLXRva2VuLWZvci10ZXN0';
  reply = () => Response.json({ order: { orderId: 'order-2' }, paymentLink: { url: 'https://pay.coinbase.com/x' }, userAuthToken: token }, { status: 201 });
  const issued = await post(valid);
  assert.match(issued.headers.get('set-cookie'), new RegExp('^obn_onramp_auth=' + token + '; Path=/api/onramp; HttpOnly; SameSite=Strict'));
  await post(valid, { cookie: session + '; ' + PREVIEW + '; obn_onramp_auth=' + token });
  assert.equal(calls.at(-1).body.userAuthToken, token);

  // Coinbase limit errors become plain-language messages; anything else stays generic.
  reply = () => Response.json({ errorType: 'guest_transaction_count', errorMessage: 'SECRET_SENTINEL' }, { status: 429 });
  const limited = await post(valid);
  assert.equal(limited.status, 429);
  const limitedText = await limited.text();
  assert.match(limitedText, /limit on Apple Pay purchases/); assert.ok(!limitedText.includes('SECRET_SENTINEL'));
  reply = () => Response.json({ errorType: 'forbidden', errorMessage: 'SECRET_SENTINEL app id' }, { status: 403 });
  const notApproved = await post(valid);
  assert.equal(notApproved.status, 503);
  const notApprovedText = await notApproved.text();
  assert.match(notApprovedText, /switched on yet/); assert.ok(!notApprovedText.includes('SECRET_SENTINEL'));
  reply = () => Response.json({ errorType: 'internal_server_error', errorMessage: 'SECRET_SENTINEL' }, { status: 500 });
  const failed = await post(valid);
  assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes('SECRET_SENTINEL'));
  reply = () => { throw Error('SECRET_SENTINEL'); };
  const thrown = await post(valid);
  assert.equal(thrown.status, 502); assert.ok(!(await thrown.text()).includes('SECRET_SENTINEL'));
  reply = () => Response.json({ order: { orderId: 'o' }, paymentLink: { url: 'https://evil.example/pay' } }, { status: 201 });
  assert.equal((await post(valid)).status, 502);

  delete env.CDP_API_KEY_NAME;
  assert.equal((await post(valid)).status, 503);
});

test('onramp requires a signed-in session for the destination wallet', async () => {
  let calls = 0;
  const env = { CDP_API_KEY_NAME: 'fake', CDP_API_KEY_PRIVATE_KEY: 'fake', NEXT_PUBLIC_SITE_URL: 'https://app.invalid', AUTH_SESSION_SECRET: 'x'.repeat(32), PREVIEW_ACCESS_CODE: PREVIEW_CODE };
  const route = context({ env, mocks: { '@coinbase/cdp-sdk/auth': { generateJwt: async () => 'mock-jwt' } }, fetch: async () => {
    calls++; return Response.json({ order: { orderId: 'o' }, paymentLink: { url: 'https://pay.coinbase.com/x' } }, { status: 201 });
  } }).route('onramp/order');
  const body = { address: TAKER, amountUsd: 5, poolId: 0 };
  const other = '0x3333333333333333333333333333333333333333';
  const [payload] = sessionCookie(TAKER, env.AUTH_SESSION_SECRET).slice('obn_session='.length).split('.');
  for (const cookie of [undefined, sessionCookie(other, env.AUTH_SESSION_SECRET), sessionCookie(TAKER, 'y'.repeat(32)),
    sessionCookie(TAKER, env.AUTH_SESSION_SECRET, 1), 'obn_session=' + payload + '.forged']) {
    assert.equal((await route.POST(request(undefined, body, { cookie: [cookie, PREVIEW].filter(Boolean).join('; ') }))).status, 401);
  }
  assert.equal(calls, 0);
  assert.equal((await route.POST(request(undefined, body, { cookie: sessionCookie(TAKER, env.AUTH_SESSION_SECRET) }))).status, 403);
  assert.equal((await route.POST(request(undefined, body, { cookie: sessionCookie(TAKER, env.AUTH_SESSION_SECRET) + '; ' + PREVIEW }))).status, 200);
  assert.equal(calls, 1);
  delete env.AUTH_SESSION_SECRET;
  assert.equal((await route.POST(request(undefined, body, { cookie: 'obn_session=a.b; ' + PREVIEW }))).status, 503);
});

test('wallet sign-in verifies nonce, domain, chain, expiry and signature before issuing a session', async () => {
  const { privateKeyToAccount } = req('viem/accounts');
  const { createSiweMessage } = req('viem/siwe');
  const wallet = privateKeyToAccount('0x' + '11'.repeat(32));
  const env = { NEXT_PUBLIC_SITE_URL: 'https://app.invalid', AUTH_SESSION_SECRET: 'x'.repeat(32), NODE_ENV: 'production', PREVIEW_ACCESS_CODE: PREVIEW_CODE };
  const app = context({ env });
  const nonceResponse = app.route('auth/nonce').GET();
  const { nonce } = await nonceResponse.json();
  const nonceCookie = nonceResponse.headers.get('set-cookie').split(';')[0] + '; ' + PREVIEW;
  assert.match(nonceResponse.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const message = (overrides = {}) => createSiweMessage({ domain: 'app.invalid', address: wallet.address, uri: 'https://app.invalid',
    version: '1', chainId: 8453, nonce, issuedAt: new Date(), expirationTime: new Date(Date.now() + 300_000), ...overrides });
  const verify = async (msg, cookie = nonceCookie, signer = wallet) => app.route('auth/verify').POST(
    request(undefined, { message: msg, signature: await signer.signMessage({ message: msg }) }, { cookie }));
  const intruder = privateKeyToAccount('0x' + '22'.repeat(32));
  const rejected = [
    await verify(message(), 'obn_siwe_nonce=wrong; ' + PREVIEW),
    await verify(message({ domain: 'evil.invalid', uri: 'https://evil.invalid' })),
    await verify(message({ chainId: 1 })),
    await verify(message({ issuedAt: new Date(Date.now() - 3_600_000), expirationTime: new Date(Date.now() - 3_000_000) })),
    await verify(message({ expirationTime: new Date(Date.now() + 86_400_000) })),
    await app.route('auth/verify').POST(request(undefined, { message: message(), signature: await intruder.signMessage({ message: message() }) }, { cookie: nonceCookie })),
  ];
  for (const response of rejected) assert.equal(response.status, 401);
  const ok = await verify(message());
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).address, wallet.address);
  const session = ok.headers.getSetCookie().find(c => c.startsWith('obn_session=')).split(';')[0];
  assert.match(ok.headers.getSetCookie().join('\n'), /obn_session=[^;]+; Path=\/api; HttpOnly; SameSite=Strict; Max-Age=86400; Secure/);
  const me = await app.route('auth/session').GET(request(undefined, undefined, { cookie: session }));
  assert.deepEqual(await me.json(), { address: wallet.address });
  assert.deepEqual(await (await app.route('auth/session').GET(request())).json(), { address: null });
});

test('private preview gates card deposits and only accepts the exact code', async () => {
  const env = { PREVIEW_ACCESS_CODE: PREVIEW_CODE };
  const route = context({ env }).route('preview');
  for (const code of ['', 'wrong', PREVIEW_CODE + 'x', PREVIEW_CODE.slice(0, -1)]) {
    const res = route.GET(request('https://app.invalid/api/preview?code=' + encodeURIComponent(code)));
    assert.equal(res.status, 403); assert.equal(res.headers.get('set-cookie'), null);
  }
  const granted = route.GET(request('https://app.invalid/api/preview?code=' + PREVIEW_CODE));
  assert.equal(granted.status, 303);
  assert.equal(granted.headers.get('location'), '/stake-earn-contribute/0');
  assert.equal(granted.headers.get('set-cookie').split(';')[0], PREVIEW);
  assert.deepEqual(await route.GET(request('https://app.invalid/api/preview', undefined, { cookie: PREVIEW })).json(), { access: true });
  assert.deepEqual(await route.GET(request('https://app.invalid/api/preview', undefined, { cookie: 'obn_preview=forged' })).json(), { access: false });
  env.PREVIEW_ACCESS_CODE = 'too-short';
  assert.equal(route.GET(request('https://app.invalid/api/preview?code=too-short')).status, 403);
  assert.deepEqual(await route.GET(request('https://app.invalid/api/preview', undefined, { cookie: PREVIEW })).json(), { access: false });
});
