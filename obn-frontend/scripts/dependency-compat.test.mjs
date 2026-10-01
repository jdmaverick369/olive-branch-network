import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("every installed WalletConnect utility retains pairing URI behavior with the patched query dependency", async () => {
  const copies = Object.keys(lock.packages).filter(path => path.endsWith("node_modules/@walletconnect/utils"));
  assert.ok(copies.length > 0, "test must exercise the installed WalletConnect utility graph");
  for (const copy of copies) {
    const localRequire = createRequire(resolve(root, copy, "package.json"));
    const utils = require(resolve(root, copy));
    const query = await import(pathToFileURL(localRequire.resolve("query-string")).href);
    assert.equal(JSON.parse(readFileSync(resolve(dirname(localRequire.resolve("query-string")), "package.json"))).version, "9.5.1");
    assert.equal(query.default.parse("name=Olive%20Branch&chain=8453").name, "Olive Branch");
    const params = { protocol: "wc", version: 2, topic: "ab".repeat(32), symKey: "cd".repeat(32), relay: { protocol: "irn" }, expiryTimestamp: 1900000000, methods: ["eth_sendTransaction", "personal_sign"] };
    const uri = utils.formatUri(params);
    const decoded = utils.parseUri(uri);
    // These installed versions intentionally strip the mobile wc scheme while
    // parsing; pairing data and re-encoding with the caller's scheme must match.
    assert.deepEqual(decoded, { ...params, protocol: "" }, copy);
    assert.equal(utils.formatUri({ ...decoded, protocol: "wc" }), uri, copy);
    assert.deepEqual(utils.parseUri(uri.replace("wc:", "wc://")), decoded, copy);
    assert.deepEqual(utils.parseUri(Buffer.from(uri).toString("base64")), decoded, copy);
    const linked = utils.getLinkModeURL("https://wallet.example/connect", params.topic, "encoded-envelope");
    assert.match(linked, /^https:\/\/wallet\.example\/connect/);
    assert.ok(linked.includes(params.topic), copy);
  }
});

test("all UUID consumers retain CommonJS v4 API, deterministic bytes and uniqueness", () => {
  const consumers = Object.entries(lock.packages).filter(([, pkg]) => pkg.dependencies?.uuid);
  assert.ok(consumers.some(([path]) => path.includes("@metamask/sdk")));
  for (const [path] of consumers) {
    const localRequire = createRequire(resolve(root, path, "package.json"));
    const uuid = localRequire("uuid");
    assert.equal(localRequire("uuid/package.json").version, "11.1.1", path);
    const id = uuid.v4({ random: Uint8Array.from({ length: 16 }, (_, index) => index) });
    assert.equal(id, "00010203-0405-4607-8809-0a0b0c0d0e0f", path);
    assert.equal(uuid.validate(id), true, path);
    assert.equal(uuid.version(id), 4, path);
    assert.equal(uuid.stringify(uuid.parse(id)), id, path);
    const buffer = new Uint8Array(20);
    assert.equal(uuid.v4({ random: new Uint8Array(16) }, buffer, 4), buffer, path);
    assert.equal(uuid.stringify(buffer, 4), "00000000-0000-4000-8000-000000000000", path);
    const ids = Array.from({ length: 32 }, () => uuid.v4());
    assert.equal(new Set(ids).size, ids.length, path);
    ids.forEach(value => assert.match(value, uuidPattern));
  }
  // These are actual CJS consumers, loaded without constructing a wallet/session.
  assert.ok(require("@metamask/sdk"));
  assert.ok(require("@metamask/sdk-communication-layer"));
  assert.ok(require("rpc-websockets").Client);
});

test("Solana's actual RPC client preserves request IDs, results and errors with Jayson 5", async () => {
  const localRequire = createRequire(require.resolve("@solana/web3.js"));
  assert.equal(localRequire("jayson/package.json").version, "5.0.0");
  const BrowserClient = localRequire("jayson/lib/client/browser");
  assert.equal(typeof BrowserClient, "function");
  const { Connection, PublicKey } = require("@solana/web3.js");
  const requests = [];
  const connection = new Connection("https://rpc.example.invalid", {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: async (url, init) => {
      assert.equal(url, "https://rpc.example.invalid");
      const request = JSON.parse(init.body);
      requests.push(request);
      assert.match(request.id, uuidPattern);
      assert.equal(request.jsonrpc, "2.0");
      const payload = request.method === "getSlot" ? { result: 12345 }
        : request.method === "getBalance" ? { result: { context: { slot: 12345 }, value: 5000000000 } }
        : { error: { code: -32601, message: "mock method unavailable" } };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, ...payload }), { status: 200 });
    },
  });
  assert.equal(await connection.getSlot(), 12345);
  assert.equal(await connection.getBalance(new PublicKey("11111111111111111111111111111111")), 5000000000);
  await assert.rejects(connection.getVersion(), /mock method unavailable/);
  assert.deepEqual(requests.map(request => request.method), ["getSlot", "getBalance", "getVersion"]);
  assert.equal(new Set(requests.map(request => request.id)).size, 3);
});

test("Jayson browser client keeps crypto.getRandomValues fallback for mobile browsers", () => {
  const localRequire = createRequire(require.resolve("@solana/web3.js"));
  const generateId = localRequire("jayson/lib/generateId");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
      getRandomValues(bytes) { bytes.set(Uint8Array.from({ length: 16 }, (_, index) => index)); return bytes; },
    } });
    assert.equal(generateId(), "00010203-0405-4607-8809-0a0b0c0d0e0f");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  }
});
