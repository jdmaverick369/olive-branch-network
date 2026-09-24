import { createHash } from "node:crypto";

// Match the contract's integer-rounded 88% user payout; no service threshold.
export async function findEligiblePools(user, pools, month, staking, lens) {
  const eligiblePools = [];
  for (let pid = 0; pid < pools; pid++) {
    if (await staking.userAmount(pid, user) === 0n || await staking.lastAutoClaimMonth(pid, user) === BigInt(month)) continue;
    if ((await lens.pendingRewards(pid, user)) * 8800n / 10000n === 0n) continue;
    eligiblePools.push(pid);
  }
  return eligiblePools;
}

// Stable UUID for the same logical submission, including an explicit retry number.
export function operationKey(job, attempt) {
  const hex = createHash("sha256").update(`${job.key}:${attempt}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Chain state is authoritative. The journal preserves ambiguous submissions, so
 * a timeout never becomes an immediate second transaction. Callers serialize all
 * runs for the same smart account. An unresolved operation stops the whole run.
 */
export function isDefinitiveRejection(error) {
  // Only structured API rejections, never messages, timeouts, 5xx or conflicts.
  // The transport must disable hidden retries before using this classifier.
  return error?.name === "APIError" && [400, 401, 402, 403, 404, 422, 429].includes(error.statusCode)
    && ["invalid_request", "invalid_signature", "malformed_transaction", "unauthorized",
      "forbidden", "policy_violation", "not_found", "payment_required",
      "payment_method_required", "rate_limit_exceeded"].includes(error.errorType);
}

export async function executeJob(job, { journal, save, isClaimed, simulate, send, wait, verify, dryRun, isSkippableSimulation = () => false }) {
  if (await isClaimed(job)) return "already-claimed";
  let entry = journal[job.key];
  let freshSubmission = false;
  async function preflight() {
    try { await simulate(job); return true; }
    catch (error) {
      if (isSkippableSimulation(error)) return false;
      throw error;
    }
  }
  if (dryRun) return await preflight() ? "eligible" : "skipped";
  if (!entry || entry.status === "failed") {
    if (!await preflight()) return "skipped";
    const attempt = (entry?.attempt ?? 0) + 1;
    entry = { attempt, idempotencyKey: operationKey(job, attempt), status: "submitting", job };
    journal[job.key] = entry;
    await save(); // Reserve before calling an external signer.
    freshSubmission = true;
  }
  if (entry.status === "complete") {
    // A receipt previously marked complete no longer agrees with the chain.
    throw new Error("Completed operation disagrees with chain state; investigate before retrying");
  }
  if (!entry.userOpHash) {
    let sent;
    try { sent = await send(job, entry.idempotencyKey); }
    catch (error) {
      // A rejection after an earlier ambiguous send cannot disprove that send.
      if (!freshSubmission || !isDefinitiveRejection(error)) throw error;
      entry.status = "failed";
      entry.rejection = { statusCode: error.statusCode, errorType: error.errorType };
      await save();
      return "rejected";
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(sent?.userOpHash)) throw new Error("Missing operation hash; submission is unresolved");
    entry.userOpHash = sent.userOpHash;
    entry.status = "broadcast";
    await save();
  }
  const result = await wait(entry.userOpHash);
  if (result.status === "failed") {
    entry.status = "failed";
    await save();
    return "failed";
  }
  if (result.status !== "complete") throw new Error("Operation is unresolved");
  // A successful bundle receipt alone is not proof its inner call succeeded.
  await verify(job, result.transactionHash);
  entry.status = "complete";
  entry.transactionHash = result.transactionHash;
  await save();
  return "complete";
}

export function applyPreferences(users, events) {
  for (const event of events) {
    const user = event.user.toLowerCase();
    if (event.enabled) users[user] = true;
    else delete users[user];
  }
  return users;
}
