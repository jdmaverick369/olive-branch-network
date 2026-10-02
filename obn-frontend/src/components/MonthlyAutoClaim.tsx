"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAccount, usePublicClient, useReadContract, useCapabilities } from "wagmi";
import { encodeFunctionData, zeroAddress, type Address } from "viem";
import { useWalletTransaction, TransactionRecovery } from "@/hooks/useWalletTransaction";
import { autoClaimAbi } from "@/lib/autoClaimAbi";
import { readTransaction } from "@/lib/transactionGuard";
import { STAKING_PROXY } from "@/lib/contracts";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { canQueryCapabilities } from "@/lib/walletCapabilities";
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

function isUserCancellation(error: unknown) {
  const seen = new Set<unknown>();
  for (let current = error; current && typeof current === "object" && !seen.has(current);) {
    seen.add(current);
    const cause = current as { code?: number; cause?: unknown };
    if (cause.code === 4001) return true;
    current = cause.cause;
  }
  return false;
}

export function useMonthlyAutoClaim() {
  const { address, chainId, connector } = useAccount();
  const client = usePublicClient({ chainId: CHAIN_ID });

  // Asked only of wallets that answer in-page; MetaMask's mobile SDK would open MetaMask on every page load.
  const { data: capabilities } = useCapabilities({ query: { enabled: !!address && canQueryCapabilities(connector?.id) } });
  // In the mini app a user may view a verified wallet that is not the signer.
  const miniWallet = useMiniAppWallet();
  const viewed = (miniWallet.viewAddress ?? address) as Address | undefined;
  const viewOnly = miniWallet.viewOnly;
  const tx = useWalletTransaction(CHAIN_ID, viewed);
  const { writeContractAsync, sendCallsAsync } = tx;
  const currentWallet = useRef(address);
  const contextVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState<{ wallet: Address; desired: boolean; automatic: boolean } | null>(null);
  useEffect(() => {
    currentWallet.current = address;
    contextVersion.current++;
    setPrompt(null);
    setMessage("");
  }, [address, chainId, viewed, viewOnly]);
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
  const stake = useReadContract({
    address: STAKING_PROXY, abi: autoClaimAbi, functionName: "activePoolCount",
    args: [viewed ?? zeroAddress], chainId: CHAIN_ID,
    query: { enabled: released && !!viewed, refetchInterval: 15_000 },
  });
  const enabled = preference.data?.[0] === true;
  const known = !!preference.data && !preference.isError;
  const available = !!executor.data && executor.data !== zeroAddress && !executor.isError;
  const stakeKnown = stake.data !== undefined && !stake.isError;
  const hasStake = stakeKnown && (stake.data ?? 0n) > 0n;
  const needsStake = known && !enabled && stakeKnown && !hasStake;
  const canEnable = available && hasStake;
  const visible = released && !!viewed;
  const ready = visible && !viewOnly && chainId === CHAIN_ID && known;
  const activePrompt = visible && !viewOnly && prompt?.wallet === address ? prompt : null;

  async function promptAfterSuccess(wallet: string) {
    if (!released || !address || viewOnly || chainId !== CHAIN_ID || wallet.toLowerCase() !== address.toLowerCase() || suppressed(address)) return;
    const version = contextVersion.current;
    try {
      const [pref, account, eligibility] = await Promise.all([preference.refetch(), executor.refetch(), stake.refetch()]);
      if (contextVersion.current !== version || currentWallet.current !== address || pref.error || account.error || eligibility.error
        || eligibility.data === undefined || eligibility.data === 0n || !pref.data || pref.data[0]
        || !account.data || account.data === zeroAddress || suppressed(address)) return;
      setMessage("");
      setPrompt({ wallet: address, desired: true, automatic: true });
    } catch { /* A prompt must never turn a successful stake/claim into an error. */ }
  }

  function open() {
    if (viewOnly) { void miniWallet.connectViewed(); return; }
    if (!ready || busy || (!enabled && !canEnable) || !address) return;
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
    if (desired && !canEnable) return;
    const version = contextVersion.current;
    const isCurrent = () => contextVersion.current === version && currentWallet.current === wallet;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      await tx.run("Update monthly autoclaim", async () => {
        try {
          const latest = await client.readContract({address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimPreference", args: [wallet]});
          if (!isCurrent()) return;
          if (latest[0] !== desired) {
            if (desired) {
              // Eligibility is global across pools and can change while the dialog is open.
              let count: bigint;
              try {
                count = await client.readContract({ address: STAKING_PROXY, abi: autoClaimAbi, functionName: "activePoolCount", args: [wallet] });
              } catch {
                if (isCurrent()) setMessage("Could not check your stake. Please try again.");
                return;
              }
              if (!isCurrent()) return;
              if (count === 0n) {
                setMessage("Stake first to enable monthly autoclaim.");
                try { await stake.refetch(); } catch { /* Keep the confirmed eligibility message. */ }
                return;
              }
            }
            const calls = [{ to: STAKING_PROXY, data: encodeFunctionData({ abi: autoClaimAbi, functionName: "setAutoClaimEnabled", args: [desired] }) }];
            const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;
            if (capabilities?.[CHAIN_ID]?.paymasterService?.supported && paymasterUrl) {
              await sendCallsAsync({ account: wallet, chainId: CHAIN_ID, calls, capabilities: { paymasterService: { url: paymasterUrl }, dataSuffix: { value: DATA_SUFFIX, optional: true } } });
            } else {
              await writeContractAsync({ account: wallet, address: STAKING_PROXY, abi: autoClaimAbi,
                functionName: "setAutoClaimEnabled", args: [desired], chainId: CHAIN_ID, dataSuffix: DATA_SUFFIX });
            }
          }
          const confirmed = await client.readContract({address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimPreference", args: [wallet]});
          if (confirmed[0] !== desired) throw new Error("Preference not confirmed");
          if (desired) suppress(wallet);
          if (isCurrent()) {
            await preference.refetch();
            if (isCurrent()) setPrompt(null);
          }
        } catch (error) {
          if (isCurrent()) {
            const pending = readTransaction(wallet, CHAIN_ID);
            const cancelled = isUserCancellation(error) && !pending?.hash && !pending?.callsId;
            setMessage(cancelled ? "Change cancelled." : "Could not confirm the change. Check your wallet transaction before trying again.");
            // An unavailable read must not replace a definite cancellation with uncertainty.
            try { await preference.refetch(); } catch { /* The next scheduled read can refresh the status. */ }
          }
        }
      });
    } catch {
      if (isCurrent()) setMessage("Could not complete the change. Check wallet activity before trying again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return { transaction: tx, visible, viewOnly, enabled, known, ready, available, stakeKnown, hasStake, needsStake, canEnable, busy, message, prompt: activePrompt, open, close, confirm, promptAfterSuccess };
}

type Control = ReturnType<typeof useMonthlyAutoClaim>;
export function AutoClaimButton({ control, className = "", style, disabled = false }: { control: Control; className?: string; style?: CSSProperties; disabled?: boolean }) {
  if (!control.visible) return null;
  // A view-only wallet stays tappable: the tap starts connecting that wallet.
  const blocked = disabled || control.busy || (!control.viewOnly && (!control.ready || (!control.enabled && !control.canEnable)));
  const hint = !control.known ? "Checking autoclaim status" : control.viewOnly ? "Connect this wallet to change autoclaim"
    : !control.ready ? "Switch your wallet to Base" : !control.enabled && !control.stakeKnown ? "Checking staking eligibility"
    : control.needsStake ? "Stake first to enable monthly autoclaim" : !control.enabled && !control.available ? "Autoclaim is currently unavailable"
    : `${control.enabled ? "Disable" : "Enable"} monthly autoclaim for all pools`;
  return <button type="button" onClick={control.open} disabled={blocked}
    aria-label={control.known ? `Monthly autoclaim ${control.enabled ? "on" : "off"}; ${hint}` : "Monthly autoclaim status unavailable"}
    title={hint}
    className={`rounded-lg font-semibold border border-purple-600 text-purple-600 transition whitespace-nowrap hover:bg-purple-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    style={style}>{control.needsStake && !control.viewOnly ? "Stake first" : control.known ? control.enabled ? "Auto On" : "Auto Off" : "Auto …"}</button>;
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
  const eligibilityMessage = desired && !control.busy && !control.canEnable
    ? !control.stakeKnown ? "Staking status is unavailable. Please try again shortly." : !control.hasStake ? "Stake first to enable monthly autoclaim." : "Autoclaim is currently unavailable."
    : "";
  return <dialog ref={ref} aria-labelledby="autoclaim-title" aria-describedby="autoclaim-description"
    onCancel={event => { event.preventDefault(); control.close(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border p-6 shadow-xl backdrop:bg-black/60"
    style={{ background: "var(--card-bg, white)", color: "var(--card-text, #111827)", borderColor: "var(--card-border, #e5e7eb)" }}>
    <h2 id="autoclaim-title" className="text-lg font-semibold">{desired ? "Enable sponsored monthly claims?" : "Turn off monthly autoclaim?"}</h2>
    <p id="autoclaim-description" className="mt-3 text-sm">{desired
      ? "OBN sponsors eligible reward claims across all your nonprofit pools on the 14th of each month (UTC). Enabling does not claim immediately. If you enable after that month's processing window, your first scheduled claim is next month. Claims depend on service and sponsorship availability. Your rewards go to the same recipients."
      : "Automatic monthly claims will stop for all your nonprofit pools. You can still claim manually and turn automation back on anytime."}</p>
    <p className="mt-3 text-xs" style={{ color: "var(--card-subtext)" }}>Confirm this preference in your wallet. Your wallet may charge gas for this change.</p>
    <TransactionRecovery control={control.transaction} />
    {(control.message || eligibilityMessage) && <p role="alert" className="mt-3 text-sm">{control.message || eligibilityMessage}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" disabled={control.busy || !control.ready || (desired && !control.canEnable)} onClick={() => void control.confirm()} className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold text-sm disabled:opacity-50">{control.busy ? "Confirming…" : "Yes"}</button>
      <button type="button" disabled={control.busy} onClick={() => control.close()} className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50">No</button>
      {control.prompt?.automatic && <button type="button" disabled={control.busy} onClick={() => control.close(true)} className="px-2 py-2 text-sm underline disabled:opacity-50">Do not show me again</button>}
    </div>
  </dialog>;
}
