"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccount, getWalletClient, watchAccount } from "@wagmi/core";
import { useAccount, useConfig, usePublicClient, useSendCalls, useSendTransaction, useSignTypedData, useWriteContract } from "wagmi";
import { getCallsStatus, waitForCallsStatus } from "viem/actions";
import type { Hex } from "viem";
import { toast } from "sonner";
import { withTxTimeout } from "@/lib/txUtils";
import { acknowledgeCancelledRequest, batchOutcome, clearTransaction, isActiveTransaction, readTransaction, subscribeTransactions, TransactionOperation, transactionKey, type TransactionRecord } from "@/lib/transactionGuard";

const starting = new Set<string>();
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function useWalletTransaction(chainId: number, viewedAddress?: string | null) {
  const config = useConfig();
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const write = useWriteContract().writeContractAsync;
  const send = useSendTransaction().sendTransactionAsync;
  const sign = useSignTypedData().signTypedDataAsync;
  const batch = useSendCalls().sendCallsAsync;
  const operation = useRef<TransactionOperation | null>(null);
  const viewed = useRef(viewedAddress);
  viewed.current = viewedAddress;
  const [pending, setPending] = useState<TransactionRecord | null>(null);
  useEffect(() => {
    const refresh = () => setPending(readTransaction(address, chainId));
    refresh();
    const unsubscribe = subscribeTransactions(refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => { unsubscribe(); window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, [address, chainId]);

  const assertContext = useCallback(async (op: TransactionOperation) => {
    op.assertValid();
    const current = getAccount(config);
    if (!current.isConnected || !same(current.address, op.record.account) || current.chainId !== chainId
      || (viewed.current && !same(viewed.current, op.record.account))) {
      throw new Error("Connect the displayed wallet on the correct network before continuing.");
    }
    const wallet = await getWalletClient(config, { account: op.record.account, chainId });
    const [accounts, actualChain] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
    op.assertValid();
    if (!accounts.some(account => same(account, op.record.account)) || actualChain !== chainId
      || !same(getAccount(config).address, op.record.account)) throw new Error("Your wallet or network changed. Review the transaction and start again.");
    return wallet;
  }, [config, chainId]);

  const run = useCallback(async (action: string, task: () => Promise<void>) => {
    const account = getAccount(config).address;
    // Existing handlers open the appropriate browser or MiniApp connection UI.
    if (!account) { await task(); return; }
    if (viewedAddress && !same(viewedAddress, account)) { toast.error("Connect the displayed wallet before continuing."); return; }
    const key = transactionKey(account, chainId);
    if (starting.has(key)) { toast.error("A transaction is already in progress for this wallet."); return; }
    starting.add(key);
    const execute = async () => {
      let op: TransactionOperation | undefined;
      let stopWatching: (() => void) | undefined;
      let detach: (() => void) | undefined;
      try {
        op = new TransactionOperation(account, chainId, action);
        operation.current = op;
        const currentOperation = op;
        stopWatching = watchAccount(config, { onChange(next) {
          if (!same(next.address, account) || next.chainId !== chainId || !next.isConnected) currentOperation.invalidate();
        } });
        const provider = await getAccount(config).connector?.getProvider() as { on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void } | undefined;
        const accountsChanged = (accounts: unknown) => { if (!Array.isArray(accounts) || !same(accounts[0], account)) currentOperation.invalidate(); };
        const chainChanged = (nextChain: unknown) => { if (Number(nextChain) !== chainId) currentOperation.invalidate(); };
        provider?.on?.("accountsChanged", accountsChanged);
        provider?.on?.("chainChanged", chainChanged);
        detach = () => { provider?.removeListener?.("accountsChanged", accountsChanged); provider?.removeListener?.("chainChanged", chainChanged); };
        await assertContext(op);
        await task();
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not complete the transaction."); }
      finally { stopWatching?.(); detach?.(); op?.finish(); if (operation.current === op) operation.current = null; }
    };
    try {
      if (typeof navigator !== "undefined" && navigator.locks) {
        await navigator.locks.request(`obn-transaction:${key}`, { ifAvailable: true }, async lock => {
          if (!lock) { toast.error("This wallet has a transaction open in another tab."); return; }
          await execute();
        });
      } else await execute();
    } finally { starting.delete(key); }
  }, [config, chainId, assertContext, viewedAddress]);

  const getOperation = async () => {
    const op = operation.current;
    if (!op) throw new Error("Start a guarded transaction before requesting a wallet action.");
    const wallet = await assertContext(op);
    return { op, wallet };
  };
  const confirmTransaction = async (hash: Hex, op: TransactionOperation) => {
    op.update({ phase: "submitted", hash });
    if (!client) throw new Error("Unable to confirm the transaction. Check its status below.");
    let replaced = false;
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000,
      onReplaced: replacement => {
        op.update({ hash: replacement.transaction.hash });
        replaced = replacement.reason !== "repriced";
      },
    });
    if (receipt.status !== "success" && receipt.status !== "reverted") throw new Error("The transaction status is not yet known. Check its status before retrying.");
    op.update({ phase: "confirmed" });
    if (replaced) throw new Error("The transaction was cancelled or replaced in your wallet. Review wallet activity before continuing.");
    if (receipt.status !== "success") throw new Error("The transaction reverted. No success has been recorded.");
    if (op.returnedToPage) toast.success(`${op.record.action} was confirmed after the delay. Refresh this page to update your balances.`);
  };
  const writeContractAsync = (async (args: Parameters<typeof write>[0]) => {
    const { op } = await getOperation();
    const hash = await withTxTimeout(op.request("transaction", () => write({ ...args, account: op.record.account, chainId }), confirmTransaction), 180_000);
    return op.record.hash ?? hash;
  }) as typeof write;
  const sendTransactionAsync = (async (args: Parameters<typeof send>[0]) => {
    const { op } = await getOperation();
    const hash = await withTxTimeout(op.request("transaction", () => send({ ...args, account: op.record.account, chainId }), confirmTransaction), 180_000);
    return op.record.hash ?? hash;
  }) as typeof send;
  const signTypedDataAsync = (async (args: Parameters<typeof sign>[0]) => {
    const { op } = await getOperation();
    if (Number(args.domain?.chainId) !== chainId) throw new Error("The signature requests a different network.");
    return withTxTimeout(op.request("signature", () => sign({ ...args, account: op.record.account })), 180_000);
  }) as typeof sign;
  const sendCallsAsync = (async (args: Parameters<typeof batch>[0]) => {
    const { op, wallet } = await getOperation();
    return withTxTimeout(op.request("calls", () => batch({ ...args, account: op.record.account, chainId }), async result => {
      op.update({ phase: "submitted", callsId: result.id });
      const status = await waitForCallsStatus(wallet, { id: result.id, timeout: 180_000, throwOnFailure: false });
      const outcome = batchOutcome(status);
      if (outcome === "pending") throw new Error("The wallet batch is still pending.");
      op.update({ phase: "confirmed" });
      if (outcome === "failure") throw new Error("The wallet batch failed. Check wallet activity for any completed calls.");
      if (op.returnedToPage) toast.success(`${op.record.action} was confirmed after the delay. Refresh this page to update your balances.`);
    }), 180_000);
  }) as typeof batch;

  const reconcile = async () => {
    if (!pending) return;
    if (pending.hash && client) {
      const receipt = await client.getTransactionReceipt({ hash: pending.hash });
      if (receipt.status !== "success" && receipt.status !== "reverted") throw new Error("The transaction status is not yet known.");
      clearTransaction(pending);
      return receipt.status === "success" ? "The transaction was confirmed. Refresh this page to update your balances." : "The transaction reverted.";
    }
    if (pending.callsId) {
      const wallet = await getWalletClient(config, { account: pending.account, chainId });
      const status = await getCallsStatus(wallet, { id: pending.callsId });
      const outcome = batchOutcome(status);
      if (outcome === "pending") throw new Error("The wallet batch is still pending.");
      clearTransaction(pending);
      return outcome === "success" ? "The wallet batch was confirmed. Refresh this page to update your balances." : "The wallet batch failed. Check wallet activity for any completed calls.";
    }
    throw new Error(isActiveTransaction(pending) ? "The wallet request is still open. Reject it in your wallet or wait for its result." : "No transaction identifier was returned. Review your wallet activity before recovering this request.");
  };
  return { run, writeContractAsync, sendTransactionAsync, signTypedDataAsync, sendCallsAsync, pending, reconcile };
}

export function TransactionRecovery({ control }: { control: ReturnType<typeof useWalletTransaction> }) {
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [checking, setChecking] = useState(false);
  const record = control.pending;
  useEffect(() => { setAcknowledged(false); setMessage(""); }, [record?.id]);
  if (!record || (isActiveTransaction(record) && (record.phase === "preparing" || record.phase === "confirmed"))) return null;
  const unknown = !record.hash && !record.callsId;
  return <aside role="status" className="w-full max-w-lg rounded-xl border p-3 my-3 text-sm" style={{ background: "var(--card-bg)", color: "var(--card-text)", borderColor: "var(--card-border)" }}>
    <p>{record.action}: {record.phase === "uncertain" ? "confirmation is unresolved" : "waiting for wallet confirmation"}. Do not submit it again while it may still complete.</p>
    {record.hash && <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://${record.chainId === 84532 ? "sepolia." : ""}basescan.org/tx/${record.hash}`}>View transaction</a>}
    <button type="button" className="underline ml-2" disabled={checking} onClick={async () => { setChecking(true); try { setMessage(await control.reconcile() ?? ""); } catch (error) { setMessage(error instanceof Error ? error.message : "Status is unavailable. Try checking again."); } finally { setChecking(false); } }}>Check status</button>
    {unknown && !isActiveTransaction(record) && <div className="mt-2">
      <label className="flex gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I closed or rejected the wallet request and verified in wallet activity that it was not submitted.</label>
      <button type="button" disabled={!acknowledged} className="underline disabled:opacity-50 mt-2" onClick={() => { acknowledgeCancelledRequest(record); setAcknowledged(false); }}>Clear the cancelled request</button>
    </div>}
    {message && <p className="mt-2">{message}</p>}
    <p className="text-xs mt-2">Keep this page open until the wallet responds. Private browsers may not retain recovery information after a reload.</p>
  </aside>;
}
