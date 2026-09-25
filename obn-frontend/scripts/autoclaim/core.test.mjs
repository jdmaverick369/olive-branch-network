import test from "node:test";
import assert from "node:assert/strict";
import { executeJob, applyPreferences, operationKey, findEligiblePools, isDefinitiveRejection, isAutoClaimDay } from "./core.mjs";

const job = { key: "8453:staking:executor:user:0,2:24321:1", user: "0x123", pids: [0, 2], month: "24321", nonce: "1" };
function fixture() {
  const calls = [];
  const adapter = {
    journal: {}, dryRun: false,
    save: async () => { calls.push("save"); },
    isClaimed: async () => false,
    simulate: async () => { calls.push("simulate"); },
    send: async (j, key) => { calls.push(["send", j.pids, key]); return { userOpHash: `0x${"ab".repeat(32)}` }; },
    wait: async () => ({ status: "complete", transactionHash: "0xtx" }),
    verify: async () => { calls.push("verify"); },
  };
  return { adapter, calls };
}

test("sends multiple pools in a single operation and records only verified success", async () => {
  const { adapter, calls } = fixture();
  assert.equal(await executeJob(job, adapter), "complete");
  assert.equal(calls.filter(c => Array.isArray(c)).length, 1);
  assert.deepEqual(calls.find(c => Array.isArray(c))[1], [0, 2]);
  assert.equal(adapter.journal[job.key].transactionHash, "0xtx");
  assert.equal(adapter.journal[job.key].status, "complete");
  assert.equal(calls[1], "save"); // journal reservation precedes send
});
test("an ambiguous submission reuses its idempotency key", async () => {
  const { adapter } = fixture();
  const keys = [];
  adapter.send = async (_, key) => { keys.push(key); throw new Error("HTTP timeout"); };
  await assert.rejects(executeJob(job, adapter));
  await assert.rejects(executeJob(job, adapter));
  assert.equal(keys[0], keys[1]);
  assert.equal(adapter.journal[job.key].status, "submitting");
});
test("a receipt timeout is reconciled without broadcasting again", async () => {
  const { adapter, calls } = fixture();
  adapter.wait = async () => { throw new Error("timeout"); };
  await assert.rejects(executeJob(job, adapter));
  adapter.wait = async () => ({ status: "complete", transactionHash: "0xtx" });
  assert.equal(await executeJob(job, adapter), "complete");
  assert.equal(calls.filter(c => Array.isArray(c)).length, 1);
});
test("confirmed failures get a new retry key; missing events never become success", async () => {
  const { adapter } = fixture();
  adapter.wait = async () => ({ status: "failed" });
  assert.equal(await executeJob(job, adapter), "failed");
  const key = adapter.journal[job.key].idempotencyKey;
  adapter.wait = async () => ({ status: "complete", transactionHash: "0xtx" });
  adapter.verify = async () => { throw new Error("event missing"); };
  await assert.rejects(executeJob(job, adapter));
  assert.notEqual(adapter.journal[job.key].idempotencyKey, key);
  assert.equal(adapter.journal[job.key].status, "broadcast");
});
test("dry runs and already-claimed jobs never invoke the signer", async () => {
  const { adapter, calls } = fixture();
  adapter.dryRun = true;
  assert.equal(await executeJob(job, adapter), "eligible");
  assert.deepEqual(calls, ["simulate"]);
  adapter.dryRun = false;
  adapter.isClaimed = async () => true;
  assert.equal(await executeJob(job, adapter), "already-claimed");
  assert.deepEqual(adapter.journal, {});
});
test("consent discovery handles disabling and re-enabling in event order", () => {
  const users = {};
  applyPreferences(users, [{user: "0xAbC", enabled: true}, {user: "0xAbC", enabled: false}]);
  assert.deepEqual(users, {});
  applyPreferences(users, [{user: "0xAbC", enabled: true}]);
  assert.deepEqual(users, {"0xabc": true});
  assert.match(operationKey(job, 1), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
});

test("batches tiny and larger positive rewards together, excluding ineligible pools", async () => {
  const rewards = [1n, 2n, 9999999999999999n, 1000000000000000000n, 0n, 1n, 1n];
  const staking = {
    userAmount: async (pid, user) => { assert.equal(user, job.user); return pid === 5 ? 0n : 1n; },
    lastAutoClaimMonth: async pid => pid === 6 ? BigInt(job.month) : 0n,
  };
  const lens = { pendingRewards: async pid => {
    assert.ok(pid < 5, "unstaked and already-claimed pools must be skipped");
    return rewards[pid];
  } };
  const pids = await findEligiblePools(job.user, rewards.length, job.month, staking, lens);
  assert.deepEqual(pids, [1, 2, 3]);
  const { adapter, calls } = fixture();
  assert.equal(await executeJob({ ...job, pids }, adapter), "complete");
  assert.deepEqual(calls.filter(Array.isArray).map(call => call[1]), [[1, 2, 3]]);
});

const rejection = () => Object.assign(new Error("redacted"), {name: "APIError", statusCode: 403, errorType: "policy_violation"});

test("a confirmed rejection is persisted, permits later wallets, and retries with a new key", async () => {
  const { adapter } = fixture();
  const send = adapter.send;
  adapter.send = async () => { throw rejection(); };
  assert.equal(await executeJob(job, adapter), "rejected");
  const rejected = JSON.parse(JSON.stringify(adapter.journal[job.key]));
  assert.equal(rejected.status, "failed");
  assert.deepEqual(rejected.rejection, {statusCode:403,errorType:"policy_violation"});
  adapter.send = send;
  assert.equal(await executeJob({...job,key:"later-wallet",user:"0x456"},adapter), "complete");
  assert.equal(await executeJob(job,adapter), "complete");
  assert.notEqual(adapter.journal[job.key].idempotencyKey, rejected.idempotencyKey);
});

test("an ambiguous send remains unresolved even if a restarted worker receives a rejection", async () => {
  const { adapter } = fixture();
  adapter.send = async () => { throw new Error("network timeout"); };
  await assert.rejects(executeJob(job,adapter));
  const journal = JSON.parse(JSON.stringify(adapter.journal));
  adapter.journal = journal;
  adapter.send = async () => { throw rejection(); };
  await assert.rejects(executeJob(job,adapter));
  assert.equal(journal[job.key].status,"submitting");
  assert.equal(journal[job.key].attempt,1);
});

test("only explicit structured client errors are definitive; unknown errors stay unresolved", async () => {
  for (const error of [new Error("policy_violation"), {name:"APIError",statusCode:500,errorType:"invalid_request"},
    {name:"APIError",statusCode:422,errorType:"idempotency_error"}, {name:"APIError",statusCode:408,errorType:"timed_out"}]) {
    assert.equal(isDefinitiveRejection(error),false);
    const {adapter} = fixture();
    adapter.send = async () => {throw error;};
    await assert.rejects(executeJob(job,adapter));
    assert.equal(adapter.journal[job.key].status,"submitting");
  }
});

test("expected simulation races skip without journaling or signing and later jobs proceed", async () => {
  for (const dryRun of [false,true]) {
    const {adapter,calls} = fixture();
    adapter.dryRun = dryRun;
    const error = new Error("NoClaimableRewards");
    adapter.simulate = async () => {throw error;};
    adapter.isSkippableSimulation = e => e === error;
    assert.equal(await executeJob(job,adapter),"skipped");
    assert.deepEqual(adapter.journal,{});
    assert.deepEqual(calls,[]);
    adapter.simulate = async () => {};
    assert.equal(await executeJob({...job,key:"next"},adapter),dryRun ? "eligible" : "complete");
  }
});

test("unexpected simulation errors and missing operation hashes fail closed", async () => {
  const {adapter} = fixture();
  adapter.simulate = async () => {throw new Error("RPC unavailable");};
  await assert.rejects(executeJob(job,adapter));
  assert.deepEqual(adapter.journal,{});
  adapter.simulate = async () => {};
  adapter.send = async () => ({});
  await assert.rejects(executeJob(job,adapter), /unresolved/);
  assert.equal(adapter.journal[job.key].status,"submitting");
});

test("scheduled claims submit only on the 14th UTC, including at month and timezone boundaries", () => {
  for (const stamp of ["2026-10-14T00:00:00Z", "2026-10-14T23:59:59Z", "2026-10-13T20:00:00-04:00"]) assert.equal(isAutoClaimDay(new Date(stamp)), true);
  for (const stamp of ["2026-10-13T23:59:59Z", "2026-10-15T00:00:00Z", "2026-11-01T00:00:00Z", "2026-10-14T20:00:00-04:00"]) assert.equal(isAutoClaimDay(new Date(stamp)), false);
});
