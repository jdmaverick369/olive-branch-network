import test from "node:test";
import assert from "node:assert/strict";
import { journalMode, selectJournal } from "./journal.mjs";

test("missing live state fails closed unless explicitly bootstrapped", () => {
  assert.throws(() => journalMode(null, { dryRun: false }), /journal missing/);
  assert.deepEqual(journalMode(null, { dryRun: false, allowBootstrap: true }), { persist: true });
  assert.deepEqual(journalMode({ journal: {} }, { dryRun: false }), { persist: true });
});

test("simulation cannot create a replacement empty live journal", () => {
  assert.deepEqual(journalMode(null, { dryRun: true }), { persist: false });
  assert.deepEqual(journalMode(null, { dryRun: true, allowBootstrap: true }), { persist: false });
  assert.deepEqual(journalMode({ journal: { pending: {} } }, { dryRun: true }), { persist: true });
});

const repository = "owner/app";
const timestamp = id => `2026-10-14T12:${String(id).padStart(2, "0")}:00Z`;
const run = (id, overrides = {}) => ({ id, run_attempt: 1, updated_at: timestamp(id), head_branch: "main", head_repository: { full_name: repository }, event: "schedule", ...overrides });
const reachedAt = id => ({ jobs: [{ name: "claim", steps: [{ name: "Reconcile and claim", started_at: timestamp(id), conclusion: "failure" }] }], total_count: 1 });
const reached = reachedAt(29);
const artifact = (id, overrides = {}) => ({ id: id + 1000, name: `autoclaim-journal-${id}-1`, expired: false, ...overrides });
function lookup(runs, responses) {
  return async path => {
    if (path.includes("/workflows/")) return { workflow_runs: runs };
    const match = path.match(/\/runs\/(\d+)\/(?:attempts\/(\d+)\/)?(jobs|artifacts)/);
    assert.ok(match, `unexpected API request: ${path}`);
    const result = responses[`${match[1]}:${match[2]}:${match[3]}`] ?? responses[`${match[1]}:${match[3]}`];
    assert.ok(result, `unexpected prior run consulted: ${path}`);
    return result;
  };
}
function select(runs, responses, overrides = {}) {
  return selectJournal({ repository, currentRunId: "30", getJson: lookup(runs, responses), ...overrides });
}

test("restores latest executed main-branch worker including a failed run", async () => {
  assert.deepEqual(await select([run(30), run(29), run(28)], {
    "29:jobs": reached,
    "29:artifacts": { artifacts: [artifact(29)], total_count: 1 },
  }), { artifactId: 1029, runId: 29 });
});

test("never falls back to stale state when a newer worker lost its journal", async () => {
  const responses = { "29:jobs": reached, "29:artifacts": { artifacts: [], total_count: 0 } };
  await assert.rejects(select([run(29), run(28)], responses), /Latest worker journal unavailable/);
  assert.equal(await select([run(29), run(28)], responses, { allowMissing: true }), null);
});

test("expired artifacts and artifacts from an earlier run attempt cannot reset history", async () => {
  for (const previous of [run(29), run(29, { run_attempt: 2 })]) {
    await assert.rejects(select([previous], {
      "29:jobs": reached,
      "29:artifacts": { artifacts: [artifact(29, { expired: previous.run_attempt === 1 })], total_count: 1 },
    }), /Latest worker journal unavailable/);
  }
});

test("ignores other repositories, branches, event types and dry-run-only jobs", async () => {
  assert.deepEqual(await select([
    run(29, { head_repository: { full_name: "attacker/fork" } }),
    run(28, { head_branch: "feature" }), run(27, { event: "pull_request" }), run(26), run(25),
  ], {
    "26:jobs": { jobs: [{ name: "claim", steps: [{ name: "Simulate claims", started_at: "now", conclusion: "success" }] }], total_count: 1 },
    "25:jobs": reachedAt(25), "25:artifacts": { artifacts: [artifact(25)], total_count: 1 },
  }), { artifactId: 1025, runId: 25 });
});

test("first use has no journal and API errors never silently initialize state", async () => {
  assert.equal(await select([], {}), null);
  await assert.rejects(selectJournal({ repository, currentRunId: "30", getJson: async () => { throw new Error("unavailable"); } }), /unavailable/);
});

test("rerunning the same run restores its last submitted attempt, not an older run", async () => {
  assert.deepEqual(await select([run(30, { run_attempt: 2 }), run(29)], {
    "30:1:jobs": reachedAt(30),
    "30:artifacts": { artifacts: [artifact(30)], total_count: 1 },
  }, { currentRunAttempt: 2 }), { artifactId: 1030, runId: 30 });
});

test("rerun fails closed when its previous submitted attempt lost the artifact", async () => {
  await assert.rejects(select([run(30, { run_attempt: 2 }), run(29)], {
    "30:1:jobs": reachedAt(30),
    "30:artifacts": { artifacts: [], total_count: 0 },
  }, { currentRunAttempt: 2 }), /Latest worker journal unavailable/);
});

test("rerun scans prior attempts when the immediately previous attempt never reached claims", async () => {
  assert.deepEqual(await select([run(30, { run_attempt: 3 }), run(29)], {
    "30:2:jobs": { jobs: [], total_count: 0 },
    "30:1:jobs": reachedAt(30),
    "30:artifacts": { artifacts: [artifact(30)], total_count: 1 },
  }, { currentRunAttempt: 3 }), { artifactId: 1030, runId: 30 });
});

test("rerunning an older run preserves a newer run's journal", async () => {
  assert.deepEqual(await select([run(29), run(20, { run_attempt: 2, updated_at: timestamp(31) })], {
    "20:1:jobs": reachedAt(20),
    "29:1:jobs": reachedAt(29),
    "29:artifacts": { artifacts: [artifact(29)], total_count: 1 },
  }, { currentRunId: "20", currentRunAttempt: 2 }), { artifactId: 1029, runId: 29 });
});

test("past reruns are ordered by execution, not immutable run creation order", async () => {
  assert.deepEqual(await select([run(29), run(20, { run_attempt: 2, updated_at: timestamp(31) })], {
    "20:2:jobs": reachedAt(31),
    "20:artifacts": { artifacts: [artifact(20, { name: "autoclaim-journal-20-2" })], total_count: 1 },
  }), { artifactId: 1020, runId: 20 });
});
