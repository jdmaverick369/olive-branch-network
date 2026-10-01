"use client";
import { ObnUsd } from "@/components/ObnUsd";
import { useTheme } from "@/hooks/useTheme";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccount,
  useBalance,
  usePublicClient,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowUpDown, Check, ChevronDown, Copy, Loader2 } from "lucide-react";
import {
  concat,
  erc20Abi,
  formatUnits,
  numberToHex,
  parseUnits,
  size,
  type Address,
  type Hex,
} from "viem";
import { useWalletTransaction, TransactionRecovery } from "@/hooks/useWalletTransaction";
import { validateSwapQuote, validateSwapRouter, swapRegistryRead } from "@/lib/swapQuoteValidation";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { EURC_BASE_ADDRESS, EURC_BASE_SEPOLIA_ADDRESS } from "@/lib/eurc";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as Address;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);
const OBN_CAIP19 = `eip155:${CHAIN_ID}/erc20:${OBN_TOKEN_ADDRESS}`;
const ETH_CAIP19 = `eip155:${CHAIN_ID}/native`;
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
const USDC_ADDRESS = (CHAIN_ID === 84532
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address;
const ETH_IMAGE = "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png";
const USDC_IMAGE = "/usdc.svg";
const EURC_ADDRESS = CHAIN_ID === 84532 ? EURC_BASE_SEPOLIA_ADDRESS : EURC_BASE_ADDRESS;
const SLIPPAGE_BPS = 100;
const ETH_GAS_RESERVE = 50_000_000_000_000n;

type SettlementTokenSymbol = "ETH" | "USDC" | "EURC";
type TokenSymbol = SettlementTokenSymbol | "OBN";
type TradeDirection = "buy" | "sell";

type SwapToken = {
  symbol: TokenSymbol;
  address: Address;
  decimals: number;
  image: string;
};

type QuoteResponse = {
  liquidityAvailable?: boolean;
  error?: string;
  fromToken?: Address;
  toToken?: Address;
  fromAmount?: string;
  toAmount?: string;
  minToAmount?: string;
  fees?: { gasFee?: { amount?: string; token?: Address } };
  issues?: {
    allowance?: { currentAllowance: string; spender: Address };
    balance?: { currentBalance: string; requiredBalance: string };
    simulationIncomplete?: boolean;
  };
  transaction?: { to: Address; data: Hex; value: string; gas: string };
  permit2?: { eip712: unknown } | null;
};

const TOKENS: Record<TokenSymbol, SwapToken> = {
  ETH: { symbol: "ETH", address: ETH_ADDRESS, decimals: 18, image: ETH_IMAGE },
  USDC: { symbol: "USDC", address: USDC_ADDRESS, decimals: 6, image: USDC_IMAGE },
  EURC: { symbol: "EURC", address: EURC_ADDRESS, decimals: 6, image: "/eurc.svg" },
  OBN: { symbol: "OBN", address: OBN_TOKEN_ADDRESS, decimals: 18, image: "/logo.png" },
};

function SettlementTokenSelect({ value, onChange, label, disabled }: {
  value: SettlementTokenSymbol;
  onChange: (symbol: SettlementTokenSymbol) => void;
  label: string;
  disabled: boolean;
}) {
  const theme = useTheme();
  const menuColors = { backgroundColor: "var(--card-bg)", color: "var(--card-text)" };

  return (
    <div className="relative flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full font-semibold text-sm shrink-0 focus-within:ring-2 focus-within:ring-green-500" style={{ backgroundColor: "var(--card-bg)", color: "var(--card-text)", border: "1px solid var(--card-border)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={TOKENS[value].image} alt="" className="w-6 h-6 rounded-full" />
      <span>{value}</span><ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
      <select value={value} onChange={(event) => onChange(event.target.value as SettlementTokenSymbol)} aria-label={label} disabled={disabled} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" style={{ ...menuColors, colorScheme: theme }}>
        <option value="ETH" style={menuColors}>ETH</option>
        <option value="USDC" style={menuColors}>USDC</option>
        <option value="EURC" style={menuColors}>EURC</option>
      </select>
    </div>
  );
}

function usePageBackground() {
  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "var(--page-bg-to)";
    return () => { document.body.style.backgroundColor = originalBg; };
  }, []);
}

function formatTokenAmount(value: bigint, decimals: number, maxDigits = 6) {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: maxDigits,
  });
}

function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Transaction cancelled.";
  }
  return message.length > 180 ? "The swap could not be completed. Please try again." : message;
}

export default function TradePage() {
  return <Suspense fallback={null}><TradeEntry /></Suspense>;
}

function TradeEntry() {
  const searchParams = useSearchParams();
  const buyEth = searchParams.get("buy") === "ETH";
  return <TradeContent key={buyEth ? "buy-eth" : "default"} buyEth={buyEth} />;
}

function TradeContent({ buyEth }: { buyEth: boolean }) {
  usePageBackground();
  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const tx = useWalletTransaction(CHAIN_ID, address);
  const { sendTransactionAsync, writeContractAsync, signTypedDataAsync } = tx;
  const miniSwapOpening = useRef(false);

  const { data: ethBalance } = useBalance({ address, query: { enabled: !!address } });
  const { data: usdcBalance, refetch: refetchUsdc } = useBalance({
    address,
    token: USDC_ADDRESS,
    query: { enabled: !!address },
  });
  const { data: obnBalance, refetch: refetchObn } = useBalance({
    address,
    token: OBN_TOKEN_ADDRESS,
    query: { enabled: !!address && !!OBN_TOKEN_ADDRESS },
  });
  const { data: eurcBalance, refetch: refetchEurc } = useBalance({
    address,
    token: EURC_ADDRESS,
    query: { enabled: !!address },
  });

  const [isInMiniApp, setIsInMiniApp] = useState<boolean | null>(null);
  const [openingMiniAppSwap, setOpeningMiniAppSwap] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [direction, setDirection] = useState<TradeDirection>(buyEth ? "sell" : "buy");
  const [settlementToken, setSettlementToken] = useState<SettlementTokenSymbol>("ETH");
  const [fromAmount, setFromAmount] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [priceImpact, setPriceImpact] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [swapStage, setSwapStage] = useState<"idle" | "quoting" | "approving" | "signing" | "swapping">("idle");
  const [swapError, setSwapError] = useState("");
  const [swapHash, setSwapHash] = useState<Hex | null>(null);

  const fromToken = direction === "buy" ? TOKENS[settlementToken] : TOKENS.OBN;
  const toToken = direction === "buy" ? TOKENS.OBN : TOKENS[settlementToken];
  const selectedBalance = fromToken.symbol === "ETH"
    ? ethBalance?.value
    : fromToken.symbol === "USDC"
      ? usdcBalance?.value
      : fromToken.symbol === "EURC"
        ? eurcBalance?.value
        : obnBalance?.value;

  useEffect(() => {
    sdk.isInMiniApp().then(setIsInMiniApp).catch(() => setIsInMiniApp(false));
  }, []);

  useEffect(() => {
    document.body.style.overflow = showSwap ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showSwap]);

  useEffect(() => {
    setFromAmount("");
    setQuote(null);
    setPriceImpact(null);
    setSwapError("");
  }, [direction, settlementToken]);

  useEffect(() => {
    if (!showSwap) {
      setFromAmount("");
      setQuote(null);
      setPriceImpact(null);
      setSwapError("");
      setSwapHash(null);
      setSwapStage("idle");
    }
  }, [showSwap]);

  const quoteUrl = useCallback((tokenIn: SwapToken, tokenOut: SwapToken, atomicAmount: string) => {
    const params = new URLSearchParams({
      fromToken: tokenIn.address,
      toToken: tokenOut.address,
      fromAmount: atomicAmount,
      taker: address || "",
      slippageBps: String(SLIPPAGE_BPS),
    });
    return `/api/swap/price?${params.toString()}`;
  }, [address]);

  useEffect(() => {
    if (!fromAmount || !address || Number(fromAmount) <= 0) {
      setQuote(null);
      setPriceImpact(null);
      setIsLoadingPrice(false);
      return;
    }

    let cancelled = false;
    setIsLoadingPrice(true);
    setSwapError("");
    const timer = window.setTimeout(async () => {
      try {
        const amount = parseUnits(fromAmount, fromToken.decimals);
        const referenceHuman = fromToken.symbol === "ETH" ? "0.001" : fromToken.symbol === "OBN" ? "1000" : "1";
        const referenceAmount = parseUnits(referenceHuman, fromToken.decimals);
        const [actualResponse, referenceResponse] = await Promise.all([
          fetch(quoteUrl(fromToken, toToken, amount.toString())),
          fetch(quoteUrl(fromToken, toToken, referenceAmount.toString())),
        ]);
        const [actual, reference] = await Promise.all([
          actualResponse.json() as Promise<QuoteResponse>,
          referenceResponse.json() as Promise<QuoteResponse>,
        ]);
        if (cancelled) return;
        if (!actualResponse.ok || !actual.liquidityAvailable || !actual.toAmount) {
          setQuote(null);
          setPriceImpact(null);
          setSwapError(actual.error || "No liquidity is available for this trade.");
          return;
        }
        setQuote(actual);
        if (reference.liquidityAvailable && reference.toAmount) {
          const idealOut = BigInt(reference.toAmount) * amount / referenceAmount;
          const actualOut = BigInt(actual.toAmount);
          const impact = idealOut > actualOut && idealOut > 0n
            ? Number((idealOut - actualOut) * 10_000n / idealOut) / 100
            : 0;
          setPriceImpact(impact);
        } else {
          setPriceImpact(null);
        }
      } catch {
        if (!cancelled) {
          setQuote(null);
          setPriceImpact(null);
          setSwapError("Unable to load a swap quote.");
        }
      } finally {
        if (!cancelled) setIsLoadingPrice(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, fromAmount, fromToken, quoteUrl, toToken]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(OBN_TOKEN_ADDRESS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleMiniAppSwap = async () => {
    if (miniSwapOpening.current) return;
    miniSwapOpening.current = true;
    setOpeningMiniAppSwap(true);
    try {
      await sdk.actions.swapToken({
        sellToken: buyEth ? OBN_CAIP19 : ETH_CAIP19,
        buyToken: buyEth ? ETH_CAIP19 : OBN_CAIP19,
      });
    } catch (err) {
      console.error("Swap cancelled or failed:", err);
    } finally {
      miniSwapOpening.current = false;
      setOpeningMiniAppSwap(false);
    }
  };

  const fetchExecutableQuote = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet first.");
    const amount = parseUnits(fromAmount, fromToken.decimals).toString();
    const response = await fetch("/api/swap/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: amount,
        taker: address,
        slippageBps: SLIPPAGE_BPS,
      }),
    });
    const data = await response.json() as QuoteResponse;
    if (!response.ok) throw new Error(data.error || "Unable to create a swap quote.");
    if (!data.liquidityAvailable) throw new Error("No liquidity is available for this trade.");
    if (data.fromToken?.toLowerCase() !== fromToken.address.toLowerCase()
      || data.toToken?.toLowerCase() !== toToken.address.toLowerCase()
      || data.fromAmount !== amount) {
      throw new Error("The returned quote did not match the requested trade.");
    }
    validateSwapQuote(data, { chainId: CHAIN_ID, account: address, fromToken: fromToken.address, toToken: toToken.address, fromAmount: BigInt(amount) });
    if (!publicClient) throw new Error("Unable to verify the swap router.");
    await validateSwapRouter(data, name => publicClient.readContract(swapRegistryRead(name)));
    return data;
  }, [address, fromAmount, fromToken, toToken, publicClient]);

  const handleSwap = useCallback(async () => tx.run("Swap", async () => {
    if (!fromAmount || !address || Number(fromAmount) <= 0) return;
    setSwapError("");
    setSwapStage("quoting");
    try {
      let executableQuote = await fetchExecutableQuote();
      if (executableQuote.issues?.balance) throw new Error("Your token balance is too low for this trade.");

      if (fromToken.symbol !== "ETH" && executableQuote.issues?.allowance) {
        setSwapStage("approving");
        const approvalAmount = parseUnits(fromAmount, fromToken.decimals);
        const approvalSpender = executableQuote.issues.allowance.spender;
        await writeContractAsync({
          address: fromToken.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [approvalSpender, approvalAmount],
        });
        if (!publicClient) throw new Error("Unable to confirm the token approval.");

        // The quote service can briefly report its pre-approval allowance even
        // after the approval is mined. Verify the canonical on-chain allowance
        // before requesting fresh transaction/Permit2 data.
        const onChainAllowance = await publicClient.readContract({
          address: fromToken.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, approvalSpender],
        });
        if (onChainAllowance < approvalAmount) {
          throw new Error("The token approval did not complete. Please try again.");
        }

        executableQuote = await fetchExecutableQuote();
      }

      if (!executableQuote.transaction) throw new Error("The swap provider did not return transaction data.");
      let transactionData = executableQuote.transaction.data;
      if (executableQuote.permit2?.eip712) {
        setSwapStage("signing");
        const signature = await signTypedDataAsync(
          executableQuote.permit2.eip712 as Parameters<typeof signTypedDataAsync>[0],
        );
        transactionData = concat([
          transactionData,
          numberToHex(size(signature), { signed: false, size: 32 }),
          signature,
        ]);
      }

      // A wallet can stay open past the permit deadline or a router deployment.
      validateSwapQuote(executableQuote, { chainId: CHAIN_ID, account: address, fromToken: fromToken.address, toToken: toToken.address, fromAmount: parseUnits(fromAmount, fromToken.decimals) });
      if (!publicClient) throw new Error("Unable to verify the swap router.");
      await validateSwapRouter(executableQuote, name => publicClient.readContract(swapRegistryRead(name)));
      setSwapStage("swapping");
      const hash = await sendTransactionAsync({
        to: executableQuote.transaction.to,
        data: transactionData,
        value: BigInt(executableQuote.transaction.value),
        dataSuffix: DATA_SUFFIX,
      });
      setSwapHash(hash);
      setSwapStage("idle");
      void refetchUsdc();
      void refetchEurc();
      void refetchObn();
    } catch (err) {
      setSwapError(friendlyError(err));
      setSwapStage("idle");
    }
  }), [tx, address, fetchExecutableQuote, fromAmount, fromToken, toToken, publicClient, refetchObn, refetchUsdc, refetchEurc, sendTransactionAsync, signTypedDataAsync, writeContractAsync]);

  const maxAmount = useMemo(() => {
    if (selectedBalance === undefined) return "";
    const usable = fromToken.symbol === "ETH"
      ? selectedBalance > ETH_GAS_RESERVE ? selectedBalance - ETH_GAS_RESERVE : 0n
      : selectedBalance;
    return formatUnits(usable, fromToken.decimals);
  }, [fromToken, selectedBalance]);

  const showGasWarning = fromToken.symbol === "ETH" && !!fromAmount && (() => {
    try { return (ethBalance?.value ?? 0n) - parseUnits(fromAmount, 18) < ETH_GAS_RESERVE; }
    catch { return false; }
  })();
  const isBusy = swapStage !== "idle";
  const estimatedOut = quote?.toAmount ? formatTokenAmount(BigInt(quote.toAmount), toToken.decimals, 6) : "";
  const minimumOut = quote?.minToAmount ? formatTokenAmount(BigInt(quote.minToAmount), toToken.decimals, 6) : "";
  const buttonLabel = swapStage === "quoting" ? "Checking quote" : swapStage === "approving" ? `Approve ${fromToken.symbol}`
    : swapStage === "signing" ? "Confirm permit"
      : swapStage === "swapping" ? "Submitting swap" : "Swap";

  return (
    <div className="flex flex-col relative page-bg overflow-hidden" style={{ height: "calc(100dvh - var(--obn-header-h))", minHeight: 0 }}>
      <main className={`main-content px-4 pb-4 flex flex-col items-center flex-1 min-h-0 ${!isInMiniApp ? "pt-5 md:pt-10" : ""}`} style={{ paddingTop: isInMiniApp ? "24px" : undefined }}>
        <div className="w-full flex flex-col md:flex-row md:items-center md:justify-center gap-3 mb-4 md:mb-6 md:max-w-2xl">
          <div className="flex items-center justify-center gap-4 md:shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="OBN" className="w-14 h-14 rounded-full shadow" />
            <div>
              <p className="text-xl font-bold" style={{ color: "var(--card-text)" }}>OBN Token</p>
              <p className="text-sm" style={{ color: "var(--card-subtext)" }}>Olive Branch Network · Base</p>
            </div>
          </div>
          <div className="w-full md:flex-1 rounded-xl px-4 py-3 flex items-center justify-between gap-2" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="min-w-0">
              <p className="text-xs font-medium mb-0.5" style={{ color: "var(--card-subtext)" }}>Contract Address</p>
              <p className="text-xs font-mono truncate" style={{ color: "var(--card-text)" }}>{OBN_TOKEN_ADDRESS}</p>
            </div>
            <button onClick={copyAddress} className="shrink-0 p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: "var(--card-subtext)" }} aria-label="Copy contract address">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="w-full max-w-4xl rounded-xl overflow-hidden mb-4 md:mb-6 flex-1 min-h-0 max-h-[53vh] md:max-h-[55vh]" style={{ border: "1px solid var(--card-border)" }}>
          <iframe src="https://dexscreener.com/base/0x8fce8be03745fa2821cb25f7dfebbfc5573a9beaca433f69a53c998a6fff1e94?embed=1&theme=dark&trades=0&info=0" className="w-full h-full" title="OBN price chart" referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-write" />
        </div>

        <div className="w-full max-w-lg mb-0">
          {isInMiniApp ? (
            <button onClick={handleMiniAppSwap} disabled={openingMiniAppSwap} className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60" style={{ backgroundColor: "#16a34a" }}>
              {openingMiniAppSwap ? <span>Opening swap...</span> : <><ArrowUpDown className="w-4 h-4" /><span>Trade OBN</span></>}
            </button>
          ) : (
            <button onClick={() => setShowSwap(true)} disabled={isInMiniApp === null} className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60" style={{ backgroundColor: "#16a34a" }}>
              <ArrowUpDown className="w-4 h-4" /><span>Trade OBN</span>
            </button>
          )}
        </div>
      </main>

      {showSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.92)" }} onClick={() => !isBusy && setShowSwap(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="swap-title" className="w-full max-w-sm rounded-2xl p-5" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p id="swap-title" className="font-semibold" style={{ color: "var(--card-text)" }}>Trade OBN</p>
              <button onClick={() => setShowSwap(false)} disabled={isBusy} aria-label="Close swap" className="w-8 h-8 flex items-center justify-center rounded-lg text-base hover:opacity-70 transition-opacity disabled:opacity-40" style={{ color: "var(--card-subtext)" }}>✕</button>
            </div>

            <TransactionRecovery control={tx} />
            {swapHash ? (
              <div className="text-center py-6">
                <p className="text-green-500 font-semibold text-lg">Swap confirmed!</p>
                <a href={`https://basescan.org/tx/${swapHash}`} target="_blank" rel="noopener noreferrer" className="inline-block text-sm mt-2 underline" style={{ color: "var(--card-subtext)" }}>View on BaseScan</a>
              </div>
            ) : (
              <>
                <div className="rounded-xl p-4 mb-1" style={{ backgroundColor: "var(--page-bg-to)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs" style={{ color: "var(--card-subtext)" }}>You pay</p>
                    {selectedBalance !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: "var(--card-subtext)" }}>{formatTokenAmount(selectedBalance, fromToken.decimals)} {fromToken.symbol} {fromToken.symbol === "OBN" && <ObnUsd amount={selectedBalance} />}</span>
                        <button disabled={isBusy} onClick={() => setFromAmount(maxAmount)} className="text-xs font-semibold hover:opacity-70" style={{ color: "#16a34a" }}>Max</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input disabled={isBusy} type="number" min="0" step="any" inputMode="decimal" placeholder="0.0" value={fromAmount} onChange={(event) => setFromAmount(event.target.value)} className="flex-1 bg-transparent text-2xl font-semibold outline-none min-w-0" style={{ color: "var(--card-text)" }} aria-label={`Amount of ${fromToken.symbol} to sell`} />
                    {fromToken.symbol === "OBN" ? (
                      <div className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full font-semibold text-sm shrink-0" style={{ backgroundColor: "var(--card-bg)", color: "var(--card-text)", border: "1px solid var(--card-border)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fromToken.image} alt="" className="w-6 h-6 rounded-full" /><span>{fromToken.symbol}</span>
                      </div>
                    ) : (
                      <SettlementTokenSelect value={settlementToken} onChange={setSettlementToken} label="Payment token" disabled={isBusy} />
                    )}
                  </div>
                </div>

                {fromToken.symbol === "OBN" && fromAmount && <ObnUsd amount={fromAmount} />}
                {showGasWarning && <p className="text-xs text-yellow-500 px-1 mb-1 -mt-0.5">Leave enough ETH to cover the network fee.</p>}

                <div className="flex justify-center my-1">
                  <button disabled={isBusy} onClick={() => setDirection(direction === "buy" ? "sell" : "buy")} aria-label="Reverse trade direction" className="p-1.5 rounded-lg" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                    <ArrowUpDown className="w-4 h-4" style={{ color: "var(--card-subtext)" }} />
                  </button>
                </div>

                <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "var(--page-bg-to)" }}>
                  <p className="text-xs mb-2" style={{ color: "var(--card-subtext)" }}>You receive</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-2xl font-semibold min-w-0" style={{ color: isLoadingPrice ? "var(--card-subtext)" : "var(--card-text)" }}>
                      {isLoadingPrice ? <Loader2 className="w-5 h-5 animate-spin" /> : estimatedOut || "0.0"}
                      {toToken.symbol === "OBN" && quote?.toAmount && !isLoadingPrice && <ObnUsd amount={BigInt(quote.toAmount)} />}
                    </div>
                    {toToken.symbol === "OBN" ? (
                      <div className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full font-semibold text-sm shrink-0" style={{ backgroundColor: "var(--card-bg)", color: "var(--card-text)", border: "1px solid var(--card-border)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={toToken.image} alt="" className="w-6 h-6 rounded-full" /><span>{toToken.symbol}</span>
                      </div>
                    ) : (
                      <SettlementTokenSelect value={settlementToken} onChange={setSettlementToken} label="Receiving token" disabled={isBusy} />
                    )}
                  </div>
                </div>

                {quote && (
                  <div className="rounded-xl px-4 py-3 mb-4 flex flex-col gap-1.5" style={{ backgroundColor: "var(--page-bg-to)" }}>
                    <div className="flex justify-between text-xs"><span style={{ color: "var(--card-subtext)" }}>Minimum received</span><span style={{ color: "var(--card-text)" }}>{minimumOut} {toToken.symbol} {toToken.symbol === "OBN" && quote.minToAmount && <ObnUsd amount={BigInt(quote.minToAmount)} />}</span></div>
                    <div className="flex justify-between text-xs"><span style={{ color: "var(--card-subtext)" }}>Max slippage</span><span style={{ color: "var(--card-text)" }}>1.00%</span></div>
                    {priceImpact !== null && <div className="flex justify-between text-xs"><span style={{ color: "var(--card-subtext)" }}>Price impact</span><span className={priceImpact < 1 ? "text-green-500" : priceImpact < 5 ? "text-yellow-500" : "text-red-500"}>{priceImpact < 0.01 ? "<0.01" : priceImpact.toFixed(2)}%</span></div>}
                    {priceImpact !== null && priceImpact >= 5 && <p className="text-xs text-red-500 pt-1">High price impact — you may receive significantly less than expected.</p>}
                  </div>
                )}

                {fromToken.symbol !== "ETH" && quote?.issues?.allowance && <p className="text-xs text-center mb-3" style={{ color: "var(--card-subtext)" }}>Your wallet will request a one-time {fromToken.symbol} approval before the swap.</p>}
                {address && chainId !== CHAIN_ID && <p role="alert" className="text-xs text-red-500 mb-3">Switch your wallet to {CHAIN_ID === 8453 ? "Base" : "Base Sepolia"} to trade.</p>}
                {swapError && <p className="text-xs text-red-500 mb-3 text-center" role="alert">{swapError}</p>}

                <button onClick={address ? handleSwap : () => openConnectModal?.()} disabled={isBusy || (!!address && chainId !== CHAIN_ID) || (!!address && (!quote || !fromAmount || Number(fromAmount) <= 0 || isLoadingPrice))} className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50" style={{ backgroundColor: "#16a34a" }}>
                  {isBusy ? <><Loader2 className="w-4 h-4 animate-spin" /><span>{buttonLabel}...</span></> : !address ? <span>Connect Wallet</span> : <><ArrowUpDown className="w-4 h-4" /><span>Swap</span></>}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
