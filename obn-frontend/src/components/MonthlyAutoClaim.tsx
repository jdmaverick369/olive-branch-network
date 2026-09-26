"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract, useCapabilities, useSendCalls, useWalletClient } from "wagmi";
import { encodeFunctionData, zeroAddress, type Address } from "viem";
import { waitForCallsStatus } from "viem/actions";
import { autoClaimAbi } from "@/lib/autoClaimAbi";
import { STAKING_PROXY } from "@/lib/contracts";
import { useMiniAppWallet } from "@/components/MiniAppWalletProvider";

const CHAIN_ID = 8453;
const dismissedInSession = new Set<string>();
export const autoClaimPromptKey = (address: string) => `obn:autoclaim-prompt:${CHAIN_ID}:${STAKING_PROXY.toLowerCase()}:${address.toLowerCase()}`;
function suppressed(address: string) {
  const key = autoClaimPromptKey(address);
  try { return dismissedInSession.has(key) || localStorage.getItem(key) === "dismissed"; }
  catch { return dismissedInSession.has(key); }
}
function suppress(address: string) {
  const key = autoClaimPromptKey(address);
  dismissedInSession.add(key);
  try { localStorage.setItem(key, "dismissed"); } catch { /* Session fallback for restricted browsers. */ }
}

export function useMonthlyAutoClaim() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();
  const { data: walletClient } = useWalletClient();
  const { data: capabilities } = useCapabilities();
  // In the mini app a user may view a verified wallet that is not the signer.
  const miniWallet = useMiniAppWallet();
  const viewed = (miniWallet.viewAddress ?? address) as Address | undefined;
  const viewOnly = miniWallet.viewOnly;
  const currentWallet = useRef(address);
  useEffect(() => { currentWallet.current = address; }, [address]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState<{ wallet: Address; desired: boolean; automatic: boolean } | null>(null);
  const released = (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_AUTOCLAIM_ENABLED === "true")
    && Number(process.env.NEXT_PUBLIC_CHAIN_ID || CHAIN_ID) === CHAIN_ID;
  const preference = useReadContract({
    address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimPreference",
    args: [viewed ?? zeroAddress], chainId: CHAIN_ID,
    query: { enabled: released && !!viewed, refetchInterval: 15_000 },
  });
  const executor = useReadContract({
    address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimExecutor", chainId: CHAIN_ID,
    query: { enabled: released && !!viewed, refetchInterval: 15_000 },
  });
  const enabled = preference.data?.[0] === true;
  const known = !!preference.data && !preference.isError;
  const available = !!executor.data && executor.data !== zeroAddress && !executor.isError;
  const visible = released && !!viewed;
  const ready = visible && !viewOnly && chainId === CHAIN_ID && known;
  const activePrompt = visible && !viewOnly && prompt?.wallet === address ? prompt : null;

  async function promptAfterSuccess(wallet: string) {
    if (!released || !address || viewOnly || wallet.toLowerCase() !== address.toLowerCase() || suppressed(address)) return;
    try {
      const [pref, account] = await Promise.all([preference.refetch(), executor.refetch()]);
      if (currentWallet.current !== address || pref.error || account.error || !pref.data || pref.data[0]
        || !account.data || account.data === zeroAddress || suppressed(address)) return;
      setMessage("");
      setPrompt({ wallet: address, desired: true, automatic: true });
    } catch { /* A prompt must never turn a successful stake/claim into an error. */ }
  }

  function open() {
    if (viewOnly) { void miniWallet.connectViewed(); return; }
    if (!ready || busy || (!enabled && !available) || !address) return;
    setMessage("");
    setPrompt({ wallet: address, desired: !enabled, automatic: false });
  }
  function close(never = false) {
    if (busy) return;
    if (never && activePrompt) suppress(activePrompt.wallet);
    setPrompt(null);
    setMessage("");
  }
  async function confirm() {
    if (!client || !address || !activePrompt || !ready || submitting.current) return;
    const { desired, wallet } = activePrompt;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      const latest = await client.readContract({address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimPreference", args: [wallet]});
      if (currentWallet.current !== wallet) return;
      if (latest[0] !== desired) {
        const calls = [{ to: STAKING_PROXY, data: encodeFunctionData({ abi: autoClaimAbi, functionName: "setAutoClaimEnabled", args: [desired] }) }];
        const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;
        if (capabilities?.[CHAIN_ID]?.paymasterService?.supported && paymasterUrl && walletClient) {
          const result = await sendCallsAsync({ account: wallet, chainId: CHAIN_ID, calls, capabilities: { paymasterService: { url: paymasterUrl } } });
          await waitForCallsStatus(walletClient, { id: result.id, timeout: 120_000, throwOnFailure: true });
        } else {
          const hash = await writeContractAsync({ account: wallet, address: STAKING_PROXY, abi: autoClaimAbi,
            functionName: "setAutoClaimEnabled", args: [desired], chainId: CHAIN_ID });
          const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
          if (receipt.status !== "success") throw new Error("Transaction reverted");
        }
      }
      const confirmed = await client.readContract({address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimPreference", args: [wallet]});
      if (confirmed[0] !== desired) throw new Error("Preference not confirmed");
      if (desired) suppress(wallet);
      if (currentWallet.current === wallet) { await preference.refetch(); setPrompt(null); }
    } catch {
      if (currentWallet.current === wallet) {
        await preference.refetch();
        setMessage("Could not confirm the change. Check your wallet transaction before trying again.");
      }
    } finally { submitting.current = false; setBusy(false); }
  }
  return { visible, viewOnly, enabled, known, ready, available, busy, message, prompt: activePrompt, open, close, confirm, promptAfterSuccess };
}

type Control = ReturnType<typeof useMonthlyAutoClaim>;
export function AutoClaimButton({ control, className = "", style, disabled = false }: { control: Control; className?: string; style?: CSSProperties; disabled?: boolean }) {
  if (!control.visible) return null;
  // A view-only wallet stays tappable: the tap starts connecting that wallet.
  const blocked = disabled || control.busy || (!control.viewOnly && (!control.ready || (!control.enabled && !control.available)));
  return <button type="button" onClick={control.open} disabled={blocked}
    aria-label={control.known ? `Monthly autoclaim ${control.enabled ? "on" : "off"}; ${control.viewOnly ? "connect this wallet to change" : `${control.enabled ? "disable" : "enable"} for all pools`}` : "Monthly autoclaim status unavailable"}
    title={!control.known ? "Checking autoclaim status" : control.viewOnly ? "Connect this wallet to change autoclaim" : !control.ready ? "Switch your wallet to Base" : !control.enabled && !control.available ? "Autoclaim is currently unavailable" : "Manage monthly autoclaim for all pools"}
    className={`rounded-lg font-semibold border border-purple-600 text-purple-600 transition whitespace-nowrap hover:bg-purple-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    style={style}>{control.known ? control.enabled ? "Auto On" : "Auto Off" : "Auto …"}</button>;
}

export function AutoClaimDialog({ control }: { control: Control }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = !!control.prompt;
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  const desired = control.prompt?.desired ?? true;
  return <dialog ref={ref} aria-labelledby="autoclaim-title" aria-describedby="autoclaim-description"
    onCancel={event => { event.preventDefault(); control.close(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border p-6 shadow-xl backdrop:bg-black/60"
    style={{ background: "var(--card-bg, white)", color: "var(--card-text, #111827)", borderColor: "var(--card-border, #e5e7eb)" }}>
    <h2 id="autoclaim-title" className="text-lg font-semibold">{desired ? "Enable sponsored monthly claims?" : "Turn off monthly autoclaim?"}</h2>
    <p id="autoclaim-description" className="mt-3 text-sm">{desired
      ? "Automatically claim rewards from all your nonprofit pools each UTC calendar month. OBN sponsors the monthly claims, and eligible pools are batched together. Your rewards go to the same recipients."
      : "Automatic monthly claims will stop for all your nonprofit pools. You can still claim manually and turn automation back on anytime."}</p>
    <p className="mt-3 text-xs" style={{ color: "var(--card-subtext)" }}>Confirm this preference in your wallet. Your wallet may charge gas for this change.</p>
    {control.message && <p role="alert" className="mt-3 text-sm">{control.message}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" disabled={control.busy || !control.ready} onClick={() => void control.confirm()} className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold text-sm disabled:opacity-50">{control.busy ? "Confirming…" : "Yes"}</button>
      <button type="button" disabled={control.busy} onClick={() => control.close()} className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50">No</button>
      {control.prompt?.automatic && <button type="button" disabled={control.busy} onClick={() => control.close(true)} className="px-2 py-2 text-sm underline disabled:opacity-50">Do not show me again</button>}
    </div>
  </dialog>;
}
