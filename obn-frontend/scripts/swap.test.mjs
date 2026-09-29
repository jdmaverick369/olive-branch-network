import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const obn = "0x1111111111111111111111111111111111111111";
const eurc = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const eth = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function loadModule(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    process: { env: { NEXT_PUBLIC_OBN_TOKEN: obn } },
    URL,
  });
  return exports;
}

for (const endpoint of ["price", "quote"]) {
  test(`${endpoint}: EURC and existing OBN pairs reach the provider; unsupported pairs do not`, async () => {
    const calls = [];
    const provider = async (params) => {
      calls.push(params);
      return {
        liquidityAvailable: true,
        ...params,
        toAmount: 2_000_000n,
        minToAmount: 1_980_000n,
        blockNumber: 123n,
      };
    };
    const route = loadModule(`../src/app/api/swap/${endpoint}/route.ts`, {
      "@/lib/eurc": loadModule("../src/lib/eurc.ts"),
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      "@coinbase/cdp-sdk": { CdpClient: class {
        evm = { getSwapPrice: provider, createSwapQuote: provider };
      } },
    });
    async function request(fromToken, toToken, fromAmount = "1234567") {
      const body = { fromToken, toToken, fromAmount, taker: obn, slippageBps: 100 };
      return endpoint === "price"
        ? route.GET({ url: `http://localhost/api/swap/price?${new URLSearchParams(body)}` })
        : route.POST({ json: async () => body });
    }
    for (const token of [eurc, eurc.toLowerCase(), usdc, eth]) {
      for (const [from, to] of [[token, obn], [obn, token]]) {
        const result = await request(from, to);
        assert.equal(result.status, 200);
        assert.equal(result.body.toAmount, "2000000");
        assert.equal(result.body.minToAmount, "1980000");
        assert.equal(calls.at(-1).fromToken, from);
        assert.equal(calls.at(-1).toToken, to);
        assert.equal(calls.at(-1).fromAmount, 1234567n);
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
