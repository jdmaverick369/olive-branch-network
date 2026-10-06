// Run against local dev: node --experimental-strip-types scripts/oliver-browser-smoke.mjs
// Uses an injected test wallet and synthetic read data. Signing and sending are forbidden.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, erc20Abi, multicall3Abi, parseEther } from "viem";
import { stakingAbi } from "../src/lib/stakingAbi.ts";
import { lensAbi } from "../src/lib/lensAbi.ts";
import { autoClaimAbi } from "../src/lib/autoClaimAbi.ts";
import { POOLS } from "../src/lib/pools.ts";

const account = "0x1111111111111111111111111111111111111111";
const abi = [...erc20Abi, ...stakingAbi, ...lensAbi, ...autoClaimAbi, ...multicall3Abi];
const writes = [];
const walletCalls = [];
const sentCalls = []; // decoded calldata of refused eth_sendTransaction requests
function call(data, target) {
  const { functionName, args } = decodeFunctionData({ abi, data });
  let result;
  switch (functionName) {
    case "aggregate3": result = args[0].map(c => {
      try { return { success: true, returnData: call(c.callData, c.target) }; }
      catch { return { success: false, returnData: "0x" }; }
    }); break;
    case "balanceOf": result = target?.toLowerCase() === "0x07e5efcd1b5fae3f461bf913bbee03a10a20c685" ? parseEther("1000000") : 0n; break;
    case "allowance": result = 0n; break;
    case "userAmount": result = parseEther("5000"); break;
    case "pendingRewards": result = parseEther("100"); break;
    case "charityContributedByUserInPool": result = parseEther("10"); break;
    case "getPoolInfo": result = [POOLS[Number(args[0])].ethereumAddress, parseEther(String(10000 + Number(args[0])))]; break;
    case "autoClaimPreference": result = [false, 0n]; break;
    case "autoClaimExecutor": result = account; break;
    case "activePoolCount": result = 11n; break;
    default: throw new Error(`Unmocked read: ${functionName}`);
  }
  return encodeFunctionResult({ abi, functionName, result });
}
function rpc(request) {
  const { method, params } = request;
  walletCalls.push(method);
  if (method === "eth_sendTransaction" && params?.[0]?.data) {
    try { sentCalls.push(decodeFunctionData({ abi, data: params[0].data })); } catch { sentCalls.push({ functionName: "unknown" }); }
  }
  if (/send|sign/i.test(method)) { writes.push(method); throw new Error("Transactions forbidden in browser smoke test"); }
  if (method === "eth_call") return call(params[0].data, params[0].to);
  if (method === "eth_chainId") return "0x2105";
  if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
  if (method === "eth_blockNumber") return "0x123456";
  if (method === "eth_getBalance") return "0xde0b6b3a7640000";
  if (method === "eth_getCode") return "0x";
  if (method === "wallet_getCapabilities") return {};
  if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
  throw new Error(`Unmocked RPC method: ${method}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.exposeBinding("testWalletRequest", (_, request) => rpc(request));
  await context.addInitScript(() => {
    // Refusals look like the user pressing Reject (EIP-1193 code 4001), so the app's transaction guard clears.
    const provider = {
      request: args => window.testWalletRequest(args).catch(e => {
        if (!/Transactions forbidden/.test(String(e?.message))) throw e;
        // Set by the test to imitate a request whose outcome is unknown (a timeout or dropped connection).
        if (window.unclearRefusal) throw new Error("Request timed out");
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }),
      on() {}, removeListener() {}, isMetaMask: true,
    };
    window.ethereum = provider;
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
      info: { uuid: "12345678-1234-4321-8123-123456789012", name: "Oliver Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "test.oliver.wallet" }, provider,
    } }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });
  await context.route("**/*", async route => {
    const request = route.request();
    let body;
    try { body = request.postDataJSON(); } catch { /* Non-JSON request. */ }
    if (body && (body.jsonrpc || Array.isArray(body) && body[0]?.jsonrpc)) {
      const respond = item => {
        try { return { jsonrpc: "2.0", id: item.id, result: rpc(item) }; }
        catch { return { jsonrpc: "2.0", id: item.id, error: { code: -32601, message: "Read unavailable in fixture" } }; }
      };
      return route.fulfill({ json: Array.isArray(body) ? body.map(respond) : respond(body) });
    }
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Unavailable in smoke test" } });
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000/ask", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Command", { exact: true }).waitFor();
  await page.waitForFunction(() => Object.keys(document.querySelector('input[aria-label="Command"]')).some(key => key.startsWith("__reactProps$")));
  const ask = async text => {
    console.log("Ask:", text);
    // A refused transaction leaves an error toast that can sit over the message box on phone widths.
    // Hide it rather than remove it: React still owns those nodes.
    await page.locator("[data-sonner-toast]").evaluateAll(toasts => toasts.forEach(t => { t.style.display = "none"; }));
    await page.getByLabel("Command", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  };
  // The open confirm card (there is at most one): the box around the Confirm button.
  const confirmButtons = page.getByRole("button", { name: "Confirm", exact: true });
  const cardText = async () => (await confirmButtons.count()) === 1 ? confirmButtons.locator("xpath=../..").innerText() : "";
  const expectCard = async (pattern, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (!pattern.test(await cardText())) {
      if (Date.now() > deadline) throw new Error(`Confirm card never matched ${pattern}; it shows: ${JSON.stringify(await cardText())}`);
      await page.waitForTimeout(100);
    }
  };
  // Ask something, wait for Oliver's new reply (not an older one with the same words), then check no card is open.
  // Press Confirm and wait for Oliver's new "didn't go through" reply (older ones don't count).
  const confirmAndWaitForFailure = async () => {
    const failures = page.getByText(/didn't go through/);
    const before = await failures.count();
    await confirmButtons.click();
    const deadline = Date.now() + 30000;
    while (await failures.count() <= before) {
      if (Date.now() > deadline) throw new Error(`No new failure reply after Confirm. URL ${page.url()}; errors: ${errors.join(" | ")}; body: ${(await page.locator("body").innerText()).slice(-800)}`);
      await page.waitForTimeout(100);
    }
  };
  const askExpectingNoCard = async (text, reply) => {
    const before = await page.getByText(reply).count();
    await ask(text);
    const deadline = Date.now() + 10000;
    while (await page.getByText(reply).count() <= before) {
      if (Date.now() > deadline) throw new Error(`No new reply matching ${reply} after "${text}"`);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    assert.equal(await confirmButtons.count(), 0, `"${text}" opened a confirm card`);
  };
  await ask("which nonprofits are environmental?");
  await page.getByRole("link", { name: "Rainforest Foundation US", exact: true }).waitFor();
  await ask("stake 100 to humanitarian");
  await page.getByRole("button", { name: "stake 100 to Tor", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /stake 100 to pool \d/ }).count(), 0);
  await page.getByRole("button", { name: "stake 100 to Tor", exact: true }).click();
  // Either the connect modal opens (pick the test wallet) or the wallet reconnected on its own and the card shows.
  const testWallet = page.getByRole("button", { name: /Oliver Test Wallet/ });
  await testWallet.or(confirmButtons).first().waitFor({ timeout: 30000 });
  if (await testWallet.isVisible()) await testWallet.click();
  await expectCard(/Stake 100 OBN.*Tor Project/, 30000);
  console.log("Connected fixture wallet; initial confirm card shown");
  await ask("no, I meant Khan");
  await expectCard(/Stake 100 OBN.*Khan Academy/);
  assert.doesNotMatch(await cardText(), /Tor Project/);
  await ask("make it 500 instead");
  await expectCard(/Stake 500 OBN.*Khan Academy/);
  // Leave Khan as the last nonprofit, clear the card, then refer back to it with a pronoun.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(b => b.textContent === "Confirm"));
  await ask("stake 100 more to it");
  await expectCard(/Stake 100 OBN.*Khan Academy/);
  await ask("split 10k across environmental");
  await expectCard(/10,000 OBN to each of 1 nonprofits/);
  assert.match(await cardText(), /Rainforest/);
  assert.doesNotMatch(await cardText(), /Tor|Khan|Heifer|GiveDirectly|St Jude|K9/);
  // The fixture has 5,000 OBN staked in every pool.
  await ask("Can you unstake 100 OBn from all the nonprofits..");
  await expectCard(new RegExp(`Unstake 100 OBN from each of ${POOLS.filter(p => p.live).length} nonprofits`));
  await askExpectingNoCard("unstake 6000 from each nonprofit", /less than 6,000 OBN staked/);
  await ask("unstake half from each environmental nonprofit");
  await expectCard(/Unstake 2,500 OBN from each of 1 nonprofits/);
  assert.match(await cardText(), /Rainforest/);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await askExpectingNoCard("should I stake 100 to Tor?", /know how to answer that yet/);
  await askExpectingNoCard("send 100 to 0x123456", /can't send OBN to other wallets/);
  await page.setViewportSize({ width: 390, height: 844 });
  await ask("split 10k across environmental");
  await expectCard(/10,000 OBN to each of 1 nonprofits/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow at 390px");
  await page.setViewportSize({ width: 320, height: 640 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow at 320px");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await ask("what is the APY?");
  await page.getByText(/Years 9-10: 1.25%/).waitFor();
  await ask("how does voting work?");
  await page.getByText(/You need an OliveNFT in your voting wallet/).waitFor();
  // "claim all" is one claimMultiple transaction covering every pool with rewards (the fixture has rewards in all).
  await ask("claim all");
  await expectCard(new RegExp(`Claim .* OBN.* in rewards from ${POOLS.filter(p => p.live).length} nonprofits`));
  assert.doesNotMatch(await cardText(), /confirm .* times/);
  const sentBefore = sentCalls.length;
  await confirmAndWaitForFailure();
  await page.waitForTimeout(1000); // a second prompt would have arrived by now
  const claimCalls = sentCalls.slice(sentBefore);
  assert.equal(claimCalls.length, 1, `claim all sent ${claimCalls.length} transactions`);
  assert.equal(claimCalls[0].functionName, "claimMultiple");
  assert.deepEqual(claimCalls[0].args[0].map(Number), POOLS.filter(p => p.live).map(p => p.pid));
  console.log("claim all: one claimMultiple request for", claimCalls[0].args[0].length, "nonprofits (refused)");

  // Press Confirm once to prove the harness refuses the wallet request and nothing is signed or sent.
  await ask("stake 100 to Tor");
  await expectCard(/Stake 100 OBN.*Tor Project/);
  const callsBefore = walletCalls.length;
  const writesBefore = writes.length;
  await confirmAndWaitForFailure();
  console.log("Wallet requests after Confirm:", walletCalls.slice(callsBefore).join(", "));
  assert.ok(writes.length > writesBefore, "Confirm never reached a signing request, so the block wasn't exercised");
  assert.ok(writes.every(m => /send|sign/i.test(m)));

  // An unclear wallet error (e.g. a timeout) must not be reported as "nothing was changed".
  await page.evaluate(() => { window.unclearRefusal = true; });
  await ask("stake 100 to Khan");
  await expectCard(/Stake 100 OBN.*Khan Academy/);
  const unclear = page.getByText(/couldn't confirm whether that went through/);
  const failuresBefore = await page.getByText(/didn't go through/).count();
  await confirmButtons.click();
  await unclear.waitFor({ timeout: 30000 });
  assert.equal(await page.getByText(/didn't go through/).count(), failuresBefore, "an unresolved request was reported as not going through");
  // The recovery panel is how the user clears it after checking their wallet.
  await page.evaluate(() => { window.unclearRefusal = false; });
  // The visible panel is Oliver's; the auto-claim dialog (closed) holds a hidden copy.
  const panel = page.locator("aside[role=status]").filter({ visible: true });
  await panel.getByText(/confirmation is unresolved/).waitFor();
  await panel.getByText(/I closed or rejected the wallet request/).click();
  await panel.getByRole("button", { name: "Clear the cancelled request" }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("aside[role=status]")].some(a => a.checkVisibility()));
  console.log("unclear wallet error: Oliver pointed to Check status, and the recovery panel cleared it");

  assert.deepEqual(errors, []);
  console.log(`PASS: category lists, named chips, draft corrections, pronouns, scoped split, refusals, mobile layout; ${writes.length} signing request(s) refused (${[...new Set(writes)].join(", ")}), none sent`);
} finally { await browser.close(); }
