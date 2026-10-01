import assert from "node:assert/strict";
import { test } from "node:test";
import utils from "./server-test-utils.cjs";

const obn = "0x1111111111111111111111111111111111111111";
const eurc = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const eth = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

for (const endpoint of ["price", "quote"]) {
  test(`${endpoint}: EURC and existing OBN pairs reach the provider; unsupported pairs do not`, async () => {
    const calls = [];
    const provider = async (url, options) => {
      const params = options.method === "POST" ? JSON.parse(options.body) : Object.fromEntries(new URL(url).searchParams);
      calls.push(params);
      return Response.json({
        liquidityAvailable: true,
        ...params,
        toAmount: "2000000",
        minToAmount: "1980000",
        blockNumber: "123",
        fees: {}, issues: {},
      });
    };
    async function request(fromToken, toToken, fromAmount = "1234567") {
      // Isolate pair validation from the separately tested estimate cache.
      const route = utils.context({
        env: { NEXT_PUBLIC_OBN_TOKEN: obn, CDP_API_KEY_NAME: "fake", CDP_API_KEY_PRIVATE_KEY: "fake" },
        mocks: { "@coinbase/cdp-sdk/auth": { generateJwt: async () => "mock-jwt" } }, fetch: provider,
      }).route(`swap/${endpoint}`);
      const body = { fromToken, toToken, fromAmount, taker: obn, slippageBps: 100 };
      const response = endpoint === "price"
        ? await route.GET(utils.request(`http://localhost/api/swap/price?${new URLSearchParams(body)}`))
        : await route.POST(utils.request(undefined, body));
      return { status: response.status, body: await response.json() };
    }
    for (const token of [eurc, eurc.toLowerCase(), usdc, eth]) {
      for (const [from, to] of [[token, obn], [obn, token]]) {
        const result = await request(from, to);
        assert.equal(result.status, 200);
        assert.equal(result.body.toAmount, "2000000");
        assert.equal(result.body.minToAmount, "1980000");
        assert.equal(calls.at(-1).fromToken, from);
        assert.equal(calls.at(-1).toToken, to);
        assert.equal(calls.at(-1).fromAmount, "1234567");
        assert.equal(calls.at(-1).network, "base");
      }
    }
    const callCount = calls.length;
    for (const [from, to, amount] of [
      [eurc, usdc], [eth, eurc], [eurc, eurc],
      ["0x2222222222222222222222222222222222222222", obn],
      [eurc, obn, "0"], [eurc, obn, "1.5"],
    ]) {
      assert.equal((await request(from, to, amount)).status, 400);
    }
    assert.equal(calls.length, callCount);
  });
}
