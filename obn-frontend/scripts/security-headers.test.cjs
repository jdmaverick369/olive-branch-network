const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./server-test-utils.cjs');

test('interactive app restricts framing to supported hosts and preserves wallet popups', async () => {
  const config = context().load('next.config.ts').default;
  const rules = await config.headers();
  const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  const csp = headers['content-security-policy'];
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  const frames = csp.split('; ').find(x => x.startsWith('frame-ancestors ')).split(' ').slice(1);
  assert(frames.includes("'self'"));
  for (const host of ['farcaster.xyz', 'warpcast.com', 'base.org', 'coinbase.com']) {
    assert(frames.includes('https://' + host));
  }
  assert(!frames.includes('*') && !frames.includes('https:'));
  assert(!('x-frame-options' in headers), 'X-Frame-Options would conflict with supported MiniApps');
});

test('public impact widget has an explicit separate frame policy on both URLs', async () => {
  const config = context().load('next.config.ts').default;
  const rules = await config.headers();
  for (const path of ['/embed/impact', '/widgets/impact.html']) {
    const rule = rules.find(x => x.source === path);
    assert(rule);
    const policy = rule.headers.find(x => x.key === 'Content-Security-Policy').value;
    assert.match(policy, /frame-ancestors https:/);
    assert.match(policy, /form-action 'none'/);
  }
});

test('additional frame ancestors accept exact HTTPS origins and reject unsafe policy input', () => {
  const { appSecurityPolicy } = context().load('src/lib/securityHeaders.ts');
  assert.match(appSecurityPolicy('https://trusted.example:8443'), /https:\/\/trusted\.example:8443/);
  for (const value of ['*', 'https:', 'http://host.example', 'https://host.example/',
    'https://host.example/path', 'https://user:pass@host.example', 'https://host.example;script-src']) {
    assert.throws(() => appSecurityPolicy(value));
  }
});
