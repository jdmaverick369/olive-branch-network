import type { Address, Hex } from "viem";

export type TransactionRecord = {
  id: string; account: Address; chainId: number; action: string; startedAt: number;
  phase: "preparing" | "requesting" | "submitted" | "uncertain" | "confirmed";
  kind?: "transaction" | "calls" | "signature"; hash?: Hex; callsId?: string;
};
const PREFIX = "obn:pending-transaction:v1:";
const records = new Map<string, TransactionRecord>();
const active = new Map<string, TransactionOperation>();
const listeners = new Set<() => void>();
export const transactionKey = (account: string, chainId: number) => `${chainId}:${account.toLowerCase()}`;
const notify = () => listeners.forEach(listener => listener());
export function subscribeTransactions(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function readTransaction(account: string | undefined, chainId: number): TransactionRecord | null {
  if (!account) return null;
  const key = transactionKey(account, chainId);
  try {
    const stored = localStorage.getItem(PREFIX + key);
    if (stored) {
      const record = JSON.parse(stored) as TransactionRecord;
      if (record.account.toLowerCase() === account.toLowerCase() && record.chainId === chainId) return record;
    }
  } catch { /* Restricted webviews retain the in-memory guard. */ }
  return records.get(key) ?? null;
}
function save(record: TransactionRecord) {
  const key = transactionKey(record.account, record.chainId);
  records.set(key, { ...record });
  try { localStorage.setItem(PREFIX + key, JSON.stringify(record)); } catch { /* In-memory fallback. */ }
  notify();
}
export function clearTransaction(record: TransactionRecord) {
  const key = transactionKey(record.account, record.chainId);
  // A status check during an approval must not erase the journal for the rest of
  // the still-running flow (including in another tab without Web Locks).
  if (active.has(key)) return;
  if (readTransaction(record.account, record.chainId)?.id !== record.id) return;
  records.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch { /* In-memory fallback. */ }
  notify();
}
export const isActiveTransaction = (record: TransactionRecord) => active.has(transactionKey(record.account, record.chainId));
export function acknowledgeCancelledRequest(record: TransactionRecord) {
  if (isActiveTransaction(record) || record.hash || record.callsId) throw new Error("This request is still being tracked. Check its status before starting another transaction.");
  clearTransaction(record);
}
export class TransactionPendingError extends Error {
  constructor() { super("The wallet request is still unresolved. Check the pending transaction below before trying again."); this.name = "TransactionPendingError"; }
}
export function isDefinitiveWalletRejection(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current = error; current && typeof current === "object" && !seen.has(current);) {
    seen.add(current);
    const e = current as { code?: number; cause?: unknown };
    if (e.code === 4001 || e.code === 4100 || e.code === 4200 || e.code === -32601 || e.code === -32602) return true;
    current = e.cause;
  }
  return false;
}

export function batchOutcome(result: { status?: string; receipts?: readonly { status?: string }[] }): "success" | "failure" | "pending" {
  if (result.status === "pending") return "pending";
  if (result.status === "failure") return "failure";
  if (result.status !== "success") throw new Error("The wallet returned an unknown batch status. Keep checking its status before retrying.");
  if (result.receipts?.some(receipt => receipt.status === "reverted")) return "failure";
  if (result.receipts?.some(receipt => receipt.status !== "success")) throw new Error("The wallet returned an unknown receipt status. Keep checking its status before retrying.");
  return "success";
}

/** The operation owns the whole approval/signature/submission flow, not one RPC. */
export class TransactionOperation {
  readonly record: TransactionRecord;
  invalidated = false;
  private finished = false;
  private pendingRequests = 0;
  get returnedToPage() { return this.finished; }
  constructor(account: Address, chainId: number, action: string) {
    const key = transactionKey(account, chainId);
    if (active.has(key) || readTransaction(account, chainId)) throw new TransactionPendingError();
    this.record = { id: crypto.randomUUID(), account, chainId, action, startedAt: Date.now(), phase: "preparing" };
    active.set(key, this);
    // Persist before work starts so navigation cannot silently permit a second flow.
    save(this.record);
  }
  assertValid() {
    if (this.invalidated) throw new Error("Your wallet or network changed. Review the selected wallet and start again.");
  }
  invalidate() { this.invalidated = true; }
  update(fields: Partial<TransactionRecord>) { Object.assign(this.record, fields); save(this.record); }
  async request<T>(kind: NonNullable<TransactionRecord["kind"]>, submit: () => Promise<T>, confirm?: (result: T, operation: TransactionOperation) => Promise<void>): Promise<T> {
    this.assertValid();
    this.update({ phase: "requesting", kind, hash: undefined, callsId: undefined });
    this.pendingRequests++;
    let submitted = false;
    try {
      const result = await submit();
      submitted = true;
      if (confirm) await confirm(result, this);
      this.update({ phase: "confirmed" });
      return result;
    } catch (error) {
      if (!submitted && isDefinitiveWalletRejection(error)) this.update({ phase: "confirmed" });
      else if (this.record.phase !== "confirmed") this.update({ phase: "uncertain" });
      throw error;
    } finally {
      this.pendingRequests--;
      this.releaseIfSafe();
    }
  }
  finish() { this.finished = true; this.releaseIfSafe(); }
  private releaseIfSafe() {
    if (!this.finished || this.pendingRequests) return;
    active.delete(transactionKey(this.record.account, this.record.chainId));
    if (this.record.phase === "preparing" || this.record.phase === "confirmed") clearTransaction(this.record);
    else notify();
  }
}
