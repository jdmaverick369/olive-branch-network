"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { toast } from "sonner";
import { useSignMessage } from "wagmi";
import { ensureWalletSession } from "@/lib/walletSession";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useUsdDeposit, type DepositStage } from "@/hooks/useUsdDeposit";
import type { useWalletTransaction } from "@/hooks/useWalletTransaction";

const PRESETS = [5, 10, 20, 50] as const;
const MIN_USD = 5; // Coinbase's minimum purchase
const MAX_USD = 500;
const INTENT_KEY = "obnCardDeposit";
const GREEN = "#0D9921";
// Coinbase Onramp trial access: $5 per purchase, limited total purchases.
// Set to null once full Onramp access is approved.
const EARLY_ACCESS_NOTE: string | null = "Card deposits are in early access: Coinbase currently limits each purchase to $5, and spots are limited.";

type CardIntent = { pid: number; amountUsd: number; startingUsdc: string; at: number; sandbox?: boolean };

type Checkout = { url: string; amountUsd: number; paymentTotal: string | null; purchaseAmount: string | null };
const COINBASE_ORIGIN = "https://pay.coinbase.com";

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const usdcToUsd = (value: bigint) => Number(formatUnits(value, 6));

const stageLabel: Record<DepositStage, string> = {
  idle: "",
  quoting: "Getting the best price…",
  approving: "Approve in your wallet…",
  signing: "Confirm in your wallet…",
  swapping: "Converting…",
  depositing: "Depositing…",
};

function readIntent(pid: number): CardIntent | null {
  try {
    // localStorage: survives reloads and new tabs while the purchase is delivered.
    const intent = JSON.parse(localStorage.getItem(INTENT_KEY) ?? "null") as CardIntent | null;
    // A card purchase usually lands within minutes; stale intents are ignored.
    return intent && intent.pid === pid && Date.now() - intent.at < 2 * 60 * 60 * 1000 ? intent : null;
  } catch { return null; }
}

function clearIntent() {
  try { localStorage.removeItem(INTENT_KEY); } catch { /* Storage is optional. */ }
}

export function Web2Deposit({
  pid, account, tx, canBatch, busy: pageBusy, stakeRaw, requireWallet, onRefresh, onWithdraw, onCollect, autoFinish,
}: {
  pid: number;
  account: Address | undefined;
  tx: ReturnType<typeof useWalletTransaction>;
  canBatch: boolean;
  busy: boolean;
  stakeRaw: bigint;
  /** Opens the connect flow and returns false when no wallet is ready to sign. */
  requireWallet: () => boolean;
  onRefresh: () => Promise<unknown>;
  onWithdraw: (obnAmount: string) => void;
  onCollect: () => void;
  /** Start the finish step on arrival; only for wallets that can open a prompt without a click. */
  autoFinish: boolean;
}) {
  const { usdcBalance, refetchUsdc, stage, busy: depositing, deposit } = useUsdDeposit({ pid, account, tx, canBatch, onComplete: onRefresh });
  const [selected, setSelected] = useState<number | null>(10);
  const [custom, setCustom] = useState("");
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const { signMessageAsync } = useSignMessage();
  const [intent, setIntent] = useState<CardIntent | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawUsd, setWithdrawUsd] = useState("");
  const [withdrawAll, setWithdrawAll] = useState(false);
  const prices = useMarketPrices();
  const obnPrice = prices.data?.find(item => item.symbol === "OBN")?.priceUsd;

  const amountUsd = selected ?? (custom ? Number(custom) : NaN);
  const validAmount = Number.isFinite(amountUsd) && amountUsd >= MIN_USD && amountUsd <= MAX_USD;
  const available = usdcBalance ?? 0n;
  const busy = pageBusy || depositing || openingCheckout || checkout !== null;

  // After paying: watch for the purchased USDC to arrive (also resumes after a reload).
  useEffect(() => {
    // Any recent purchase for this pool resumes, even if the buyer came back without the return link.
    const restored = readIntent(pid);
    if (restored) setIntent(restored);
  }, [pid]);

  const arrived = intent && usdcBalance !== undefined ? usdcBalance - BigInt(intent.startingUsdc) : 0n;
  const fundsArrived = arrived > 0n;
  useEffect(() => {
    if (!intent || fundsArrived || intent.sandbox) return;
    const id = window.setInterval(() => void refetchUsdc(), 5_000);
    return () => window.clearInterval(id);
  }, [intent, fundsArrived, refetchUsdc]);

  const startCardCheckout = async () => {
    if (!requireWallet() || !account || !validAmount) return;
    setOpeningCheckout(true);
    try {
      setSigningIn(true);
      try {
        await ensureWalletSession(account, message => signMessageAsync({ account, message }));
      } finally {
        setSigningIn(false);
      }
      const response = await fetch("/api/onramp/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account, amountUsd: Number(amountUsd.toFixed(2)), poolId: pid }),
      });
      const data = await response.json() as { paymentLinkUrl?: string; paymentTotal?: string | null; purchaseAmount?: string | null; sandbox?: boolean; error?: string };
      if (!response.ok || !data.paymentLinkUrl) throw new Error(data.error || "Card purchases are unavailable right now.");
      try {
        localStorage.setItem(INTENT_KEY, JSON.stringify({ pid, amountUsd, startingUsdc: available.toString(), at: Date.now(), sandbox: data.sandbox === true } satisfies CardIntent));
      } catch { /* The purchase still completes; the deposit just won't resume after a reload. */ }
      setIntent(readIntent(pid));
      setCheckout({ url: data.paymentLinkUrl, amountUsd, paymentTotal: data.paymentTotal ?? null, purchaseAmount: data.purchaseAmount ?? null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(/user rejected|user denied|rejected the request/i.test(message) ? "Sign-in cancelled."
        : message.length > 0 && message.length <= 180 ? message : "Card purchases are unavailable right now.");
    } finally {
      setOpeningCheckout(false);
    }
  };

  // Always pay through Coinbase (Apple Pay), even when the wallet already holds USDC:
  // only the newly purchased USDC is deposited afterwards.
  const handlePrimary = () => {
    if (!requireWallet() || !validAmount) return;
    void startCardCheckout();
  };

  const finishCardDeposit = async () => {
    if (!requireWallet() || !intent) return;
    // Card fees come out of the purchase, so deposit what actually arrived, capped at the intended amount.
    const intended = parseUnits(intent.amountUsd.toFixed(2), 6);
    const spend = arrived < intended ? arrived : intended;
    // Keep the banner after a failure so the buyer can simply try again.
    if (await deposit(spend)) {
      clearIntent();
      setIntent(null);
    }
  };

  // When the purchase lands, start the finish step without waiting for a tap (once per purchase).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoFinish || !fundsArrived || !intent || intent.sandbox || busy || autoStarted.current) return;
    autoStarted.current = true;
    void finishCardDeposit();
  });

  const withdrawObn = useMemo(() => {
    if (withdrawAll) return stakeRaw > 0n ? formatUnits(stakeRaw, 18) : null;
    const value = Number(withdrawUsd);
    if (!obnPrice || !Number.isFinite(value) || value <= 0) return null;
    const raw = parseUnits((value / obnPrice).toFixed(6), 18);
    return formatUnits(raw > stakeRaw ? stakeRaw : raw, 18);
  }, [withdrawAll, withdrawUsd, obnPrice, stakeRaw]);

  const primaryLabel = depositing ? stageLabel[stage]
    : signingIn ? "Sign in with your wallet…"
    : openingCheckout ? "Preparing Apple Pay…"
    : !validAmount ? `Choose ${usd(MIN_USD)}–${usd(MAX_USD)}`
    : `Deposit ${usd(amountUsd)}`;

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {intent && (
        <div role="status" className="w-full rounded-xl border p-3 text-center text-sm" style={{ borderColor: GREEN, backgroundColor: "var(--card-bg)", color: "var(--card-text)" }}>
          {checkout ? (
            <p>Complete your {usd(intent.amountUsd)} payment in the Apple Pay window.</p>
          ) : intent.sandbox ? (
            <p>Test purchase complete (Coinbase sandbox). No money was charged and no USDC is delivered, so there is nothing to deposit.</p>
          ) : fundsArrived ? (
            <>
              <p className="mb-2">Your {usd(usdcToUsd(arrived))} purchase arrived.{autoFinish ? " Confirm the deposit in your wallet." : ""}</p>
              <button type="button" disabled={busy} onClick={() => void finishCardDeposit()}
                className="w-full rounded-lg py-2.5 font-semibold text-white disabled:opacity-60" style={{ backgroundColor: GREEN }}>
                {depositing ? stageLabel[stage] : `Finish ${usd(Math.min(usdcToUsd(arrived), intent.amountUsd))} deposit`}
              </button>
            </>
          ) : (
            <p>Waiting for your {usd(intent.amountUsd)} purchase to arrive. This usually takes a minute or two.</p>
          )}
          <button type="button" className="mt-2 text-xs underline" style={{ color: "var(--card-subtext)" }} onClick={() => { clearIntent(); setIntent(null); }}>
            Dismiss
          </button>
        </div>
      )}

      <p className="text-sm font-semibold" style={{ color: "var(--card-text)" }}>Choose an amount to deposit</p>
      <div className="grid grid-cols-4 gap-2 w-full" role="radiogroup" aria-label="Deposit amount">
        {PRESETS.map(preset => {
          const active = selected === preset;
          return (
            <button key={preset} type="button" role="radio" aria-checked={active} disabled={busy}
              onClick={() => { setSelected(preset); setCustom(""); }}
              className="rounded-lg border py-2.5 text-sm font-bold transition disabled:opacity-60"
              style={{ borderColor: GREEN, backgroundColor: active ? GREEN : "transparent", color: active ? "#ffffff" : "var(--card-text)" }}>
              ${preset}
            </button>
          );
        })}
      </div>

      <label className="flex w-full items-center gap-1 rounded-lg border px-3.5 py-2.5 text-sm focus-within:ring-2 focus-within:ring-green-500 cursor-text"
        style={{ borderColor: selected === null && custom ? GREEN : "var(--card-border)", backgroundColor: "var(--card-bg)", color: "var(--card-text)" }}>
        <span aria-hidden="true">$</span>
        <input type="text" inputMode="decimal" placeholder="Other amount" aria-label="Custom deposit amount in US dollars" disabled={busy}
          value={custom}
          onFocus={() => setSelected(null)}
          onChange={event => { if (/^\d{0,4}(\.\d{0,2})?$/.test(event.target.value)) { setCustom(event.target.value); setSelected(null); } }}
          className="w-full min-w-0 border-0 bg-transparent p-0 outline-none text-inherit" />
      </label>

      <button type="button" disabled={busy || !validAmount} onClick={handlePrimary}
        className="w-full rounded-lg py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: GREEN }}>
        {primaryLabel}
      </button>

      <p className="text-xs text-center" style={{ color: "var(--card-subtext)" }}>
        Pay securely with Apple Pay through Coinbase, using any debit card in your Apple Wallet. Your dollars are converted to OBN and deposited in this pool.
      </p>

      {EARLY_ACCESS_NOTE && (
        <p className="w-full rounded-lg border px-3 py-2 text-xs text-center" role="note"
          style={{ borderColor: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.1)", color: "var(--card-text)" }}>
          {EARLY_ACCESS_NOTE}
        </p>
      )}

      <div className="flex items-center gap-4 text-xs">
        <button type="button" className="underline disabled:opacity-60" style={{ color: "var(--card-subtext)" }} disabled={busy}
          onClick={() => setShowWithdraw(value => !value)} aria-expanded={showWithdraw}>
          Withdraw
        </button>
        <button type="button" className="underline disabled:opacity-60" style={{ color: "var(--card-subtext)" }} disabled={busy} onClick={onCollect}>
          Collect rewards
        </button>
      </div>

      {checkout && (
        <PaymentSheet
          checkout={checkout}
          onPaid={() => {
            setCheckout(null);
            toast.success("Payment complete. Depositing your purchase…");
            void refetchUsdc();
          }}
          onClose={(reason) => {
            setCheckout(null);
            // Nothing was bought: forget the purchase. After a charge, keep waiting for delivery.
            if (reason !== "charged") { clearIntent(); setIntent(null); }
          }}
        />
      )}

      {showWithdraw && (
        <div className="w-full flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)" }}>
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-1 rounded-lg border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-green-500"
              style={{ borderColor: "var(--card-border)", color: "var(--card-text)" }}>
              <span aria-hidden="true">$</span>
              <input type="text" inputMode="decimal" placeholder="Amount" aria-label="Withdrawal amount in US dollars" value={withdrawUsd}
                onChange={event => { if (/^\d{0,7}(\.\d{0,2})?$/.test(event.target.value)) { setWithdrawUsd(event.target.value); setWithdrawAll(false); } }}
                className="w-full min-w-0 border-0 bg-transparent p-0 outline-none text-inherit" />
            </label>
            <button type="button" className="rounded-lg border px-3 text-xs font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--card-text)" }}
              disabled={!obnPrice || stakeRaw === 0n} onClick={() => { setWithdrawUsd((Number(formatUnits(stakeRaw, 18)) * (obnPrice ?? 0)).toFixed(2)); setWithdrawAll(true); }}>
              All
            </button>
          </div>
          <button type="button" disabled={busy || !withdrawObn || Number(withdrawObn) <= 0}
            onClick={() => withdrawObn && onWithdraw(withdrawObn)}
            className="rounded-lg border py-2 text-sm font-semibold transition disabled:opacity-60" style={{ borderColor: "#dc2626", color: "#dc2626" }}>
            Withdraw
          </button>
          <p className="text-[11px] text-center" style={{ color: "var(--card-subtext)" }}>
            Withdrawals return OBN to your wallet at today&apos;s price.
          </p>
        </div>
      )}
    </div>
  );
}

type SheetEvent = { eventName?: string; data?: { errorCode?: string; errorMessage?: string } };

/**
 * Coinbase's embedded order page (Apple Pay, plus the phone/email verification Coinbase runs itself),
 * shown over the pool page. Coinbase reports progress through postMessage events.
 * https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
 */
function PaymentSheet({ checkout, onPaid, onClose }: {
  checkout: Checkout;
  onPaid: () => void;
  onClose: (reason: "cancelled" | "charged") => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [charged, setCharged] = useState(false);
  const callbacks = useRef({ onPaid, onClose });
  useEffect(() => { callbacks.current = { onPaid, onClose }; });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== COINBASE_ORIGIN) return;
      let message: SheetEvent;
      try { message = (typeof event.data === "string" ? JSON.parse(event.data) : event.data) as SheetEvent; } catch { return; }
      const detail = message?.data?.errorMessage;
      switch (message?.eventName) {
        case "onramp_api.load_success": setLoaded(true); break;
        case "onramp_api.commit_success":
        case "onramp_api.polling_start":
          setCharged(true);
          setStatus("Payment received. Coinbase is sending your USDC…");
          break;
        case "onramp_api.polling_success": callbacks.current.onPaid(); break;
        case "onramp_api.cancel": callbacks.current.onClose("cancelled"); break;
        case "onramp_api.polling_error":
          setCharged(true);
          setStatus(detail || "Coinbase had a problem delivering your purchase. If you were charged, it will still arrive or be refunded.");
          break;
        case "onramp_api.load_error":
        case "onramp_api.commit_error":
        case "onramp_api.validate_merchant_error":
        case "onramp_api.session_error":
          setStatus(detail || "Apple Pay couldn't complete this purchase. You weren't charged.");
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Pay with Apple Pay">
      <div className="w-full sm:max-w-md max-h-dvh overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 flex flex-col gap-3"
        style={{ backgroundColor: "var(--card-bg)", color: "var(--card-text)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Deposit {usd(checkout.amountUsd)}</p>
            {checkout.purchaseAmount && (
              <p className="text-xs" style={{ color: "var(--card-subtext)" }}>
                {checkout.paymentTotal ? `${usd(Number(checkout.paymentTotal))} total, including Coinbase fees. ` : ""}
                About {Number(checkout.purchaseAmount).toFixed(2)} USDC will be converted and deposited.
              </p>
            )}
          </div>
          <button type="button" className="text-sm underline shrink-0" style={{ color: "var(--card-subtext)" }}
            onClick={() => onClose(charged ? "charged" : "cancelled")}>
            {charged ? "Close" : "Cancel"}
          </button>
        </div>

        {status && <p role="status" className="text-sm rounded-lg border p-2" style={{ borderColor: "var(--card-border)" }}>{status}</p>}

        {!loaded && !status && <p className="text-sm text-center" style={{ color: "var(--card-subtext)" }}>Loading Apple Pay…</p>}
        <iframe
          src={checkout.url}
          title="Coinbase Apple Pay checkout"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          allow="payment"
          className="w-full rounded-lg border-0"
          style={{ height: "min(560px, 65dvh)", backgroundColor: "#ffffff" }}
        />

        <p className="text-[11px] leading-snug" style={{ color: "var(--card-subtext)" }}>
          Payment is processed by Coinbase. By continuing, you agree to Coinbase&apos;s{" "}
          <a className="underline" href="https://www.coinbase.com/legal/guest-checkout/us" target="_blank" rel="noopener noreferrer">Guest Checkout Terms</a>,{" "}
          <a className="underline" href="https://www.coinbase.com/legal/user_agreement/united_states" target="_blank" rel="noopener noreferrer">User Agreement</a>, and{" "}
          <a className="underline" href="https://www.coinbase.com/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          Available to US residents 18+. Outside Safari, Apple Pay shows a code to scan with your iPhone.
        </p>
      </div>
    </div>
  );
}
