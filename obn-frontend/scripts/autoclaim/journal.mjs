// Missing journals must never silently reset the attempt/idempotency history.
export function journalMode(state, { dryRun, allowBootstrap = false }) {
  if (!state && !dryRun && !allowBootstrap) {
    throw new Error("Autoclaim journal missing; restore the last artifact or explicitly bootstrap after reconciling prior submissions");
  }
  return { persist: Boolean(state) || !dryRun };
}

// Only this workflow's most recent main-branch run that reached the live worker
// can supply recovery state. Never fall back past a lost newer submission.
export async function selectJournal({ getJson, repository, currentRunId, currentRunAttempt = 1, allowMissing = false }) {
  const prefix = `/repos/${repository}/actions`;
  if (!Number.isSafeInteger(currentRunAttempt) || currentRunAttempt < 1) throw new Error("Invalid current attempt");
  const runs = [];
  let complete = false;
  for (let page = 1; page <= 10; page++) {
    const result = await getJson(`${prefix}/workflows/monthly_autoclaim.yml/runs?branch=main&per_page=100&page=${page}`);
    if (!Array.isArray(result.workflow_runs)) throw new Error("Invalid workflow history");
    runs.push(...result.workflow_runs);
    if (result.workflow_runs.length < 100 || runs.length === result.total_count) { complete = true; break; }
  }
  if (!complete) throw new Error("Workflow history exceeds recovery search limit; review before continuing");
  const trusted = runs.filter(run => run.head_branch === "main" && run.head_repository?.full_name === repository &&
    ["schedule", "workflow_dispatch"].includes(run.event));
  if (currentRunAttempt > 1 && !trusted.some(run => String(run.id) === String(currentRunId))) throw new Error("Current rerun missing from trusted history");
  for (const run of trusted) {
    if (!Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) || !Number.isFinite(Date.parse(run.updated_at))) throw new Error("Invalid workflow identity");
  }
  // Rerunning an old run updates it without changing its run ID or creation order.
  // updated_at is an upper bound on the start of its completed worker attempts.
  trusted.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  let latest = null;
  for (const run of trusted) {
    if (latest && Date.parse(run.updated_at) < latest.startedAt) break;
    const attempt = String(run.id) === String(currentRunId) ? currentRunAttempt - 1 : run.run_attempt;
    for (let previous = attempt; previous > 0; previous--) {
      if (attempt - previous >= 25) throw new Error("Workflow attempt history exceeds recovery limit");
      const jobs = await getJson(`${prefix}/runs/${run.id}/attempts/${previous}/jobs?per_page=100`);
      if (!Array.isArray(jobs.jobs) || jobs.total_count > 100) throw new Error("Invalid workflow jobs");
      const worker = jobs.jobs.filter(job => job.name === "claim").flatMap(job => job.steps ?? []).find(step =>
        step.name === "Reconcile and claim" && step.started_at && step.conclusion !== "skipped");
      if (!worker) continue;
      const startedAt = Date.parse(worker.started_at);
      if (!Number.isFinite(startedAt)) throw new Error("Invalid worker execution time");
      if (!latest || startedAt > latest.startedAt) latest = { runId: run.id, attempt: previous, startedAt };
      break;
    }
  }
  if (!latest) return null;
  const artifacts = await getJson(`${prefix}/runs/${latest.runId}/artifacts?per_page=100`);
  if (!Array.isArray(artifacts.artifacts) || artifacts.total_count > 100) throw new Error("Invalid journal artifact list");
  const name = `autoclaim-journal-${latest.runId}-${latest.attempt}`;
  const artifact = artifacts.artifacts.find(item => item.name === name && !item.expired);
  if (artifact && Number.isSafeInteger(artifact.id)) return { artifactId: artifact.id, runId: latest.runId };
  if (allowMissing) return null;
  throw new Error("Latest worker journal unavailable; recover and reconcile that run before live claims");
}
