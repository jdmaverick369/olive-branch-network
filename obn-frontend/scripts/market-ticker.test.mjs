import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/app/api/market-ticker/route.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
);
const healthy = {
  dex: { pair: { priceUsd: "0.00002", priceChange: { h24: -2 } } },
  gecko: { ethereum: { usd: 2500, usd_24h_change: 1 }, bitcoin: { usd: 80000, usd_24h_change: -1 } },
  ETH: { last: "2600", open: "2500" },
  BTC: { last: "81000", open: "80000" },
};

async function request(overrides = {}) {
  const fixtures = { ...healthy, ...overrides };
  const calls = [];
  const exports = {};
  runInNewContext(outputText, {
    exports,
    AbortSignal,
    require: () => ({ NextResponse: { json: (body, options = {}) => ({
      body: JSON.parse(JSON.stringify(body)), status: options.status ?? 200, headers: options.headers,
    }) } }),
    fetch: async (url, options) => {
      assert.equal(options.next.revalidate, 60);
      assert.ok(options.signal instanceof AbortSignal, "provider requests must have a deadline");
      const key = url.includes("dexscreener") ? "dex" : url.includes("coingecko") ? "gecko" : url.includes("ETH-USD") ? "ETH" : "BTC";
      calls.push(key);
      const fixture = fixtures[key];
      if (fixture instanceof Error) throw fixture;
      return {
        ok: fixture !== 403,
        status: fixture === 403 ? 403 : 200,
        json: async () => {
          if (fixture === "invalid-json") throw new SyntaxError("Invalid JSON");
          return fixture;
        },
      };
    },
  });
  return { ...await exports.GET(), calls };
}

test("healthy feeds return all prices without calling the fallback", async () => {
  const result = await request();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(item => item.symbol), ["OBN", "ETH", "BTC"]);
  assert.deepEqual(result.calls.sort(), ["dex", "gecko"]);
});

for (const failure of [403, new Error("Network failure"), new DOMException("Timed out", "TimeoutError"), "invalid-json"]) {
  test(`CoinGecko failure (${String(failure)}) keeps OBN and uses Coinbase`, async () => {
    const result = await request({ gecko: failure });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.items.map(item => item.priceUsd), [0.00002, 2600, 81000]);
    assert.ok(Math.abs(result.body.items[1].change24h - 4) < 1e-10);
    assert.ok(Math.abs(result.body.items[2].change24h - 1.25) < 1e-10);
  });
}

test("OBN remains available when all major price providers fail", async () => {
  const result = await request({ gecko: 403, ETH: 403, BTC: 403 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(item => item.symbol), ["OBN"]);
});

test("DexScreener failure does not discard ETH and BTC", async () => {
  const result = await request({ dex: new Error("Network failure") });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(item => item.symbol), ["ETH", "BTC"]);
});

test("missing percentage change does not discard a usable USD price or invent a zero change", async () => {
  const result = await request({ dex: { pairs: [{ priceUsd: "0.00002" }] }, gecko: 403, ETH: { last: "2500", open: null }, BTC: 403 });
  assert.deepEqual(result.body.items, [
    { symbol: "OBN", priceUsd: 0.00002, change24h: null },
    { symbol: "ETH", priceUsd: 2500, change24h: null },
  ]);
});

test("fallback replaces only the missing major and tolerates failure of the other fallback", async () => {
  const result = await request({ gecko: { ethereum: healthy.gecko.ethereum }, BTC: 403 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(item => item.symbol), ["OBN", "ETH"]);
  assert.ok(!result.calls.includes("ETH"));
});

test("zero, negative, non-finite and malformed prices are excluded", async () => {
  for (const price of [null, "", " ", false, 0, -1, "NaN", "Infinity", {}, []]) {
    const result = await request({ dex: { pair: { priceUsd: price } }, gecko: 403, ETH: { last: price }, BTC: { last: price } });
    assert.equal(result.status, 503);
    assert.equal(result.headers["Cache-Control"], "no-store");
  }
});

test("a total provider outage returns a non-cacheable error", async () => {
  const result = await request({ dex: 403, gecko: 403, ETH: 403, BTC: 403 });
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "no-store");
});
