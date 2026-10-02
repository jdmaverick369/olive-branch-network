"use client";

import { useCallback, useState } from "react";
import { useAccount, useBalance, useCapabilities, usePublicClient, useReadContract } from "wagmi";
import { canQueryCapabilities } from "@/lib/walletCapabilities";
import { concat, encodeFunctionData, erc20Abi, numberToHex, parseAbi, parseEther, parseSignature, size, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { estimateL1Fee } from "viem/op-stack";
import { toast } from "sonner";
import { stakingAbi } from "@/lib/stakingAbi";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { validateSwapQuote, validateSwapRouter, swapRegistryRead, NATIVE_TOKEN, type ExecutableSwapQuote } from "@/lib/swapQuoteValidation";
import { autoClaimAbi } from "@/lib/autoClaimAbi";
import { STAKING_PROXY } from "@/lib/contracts";
import type { useWalletTransaction } from "@/hooks/useWalletTransaction";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);
const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as Address;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as Address;
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
export const USDC_ADDRESS = (CHAIN_ID === 84532
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address;
const SLIPPAGE_BPS = 100;

/** What a card purchase delivers: ETH, which also pays the network fees (USDC for purchases made before that). */
export type DepositSource = "USDC" | "ETH";

// Gas ceilings for an ETH purchase's transactions. A step that needs more is not sent.
const GAS_CAP = { swap: 900_000n, approve: 120_000n, deposit: 450_000n, autoclaim: 150_000n } as const;
const PLANNED_GAS = GAS_CAP.swap + GAS_CAP.approve + GAS_CAP.deposit + GAS_CAP.autoclaim;
const L1_FEE_FALLBACK = parseEther("0.000002"); // Base's L1 data fee per transaction, when it can't be estimated
const KEEP_PURCHASE = "Your purchase is still in your wallet; tap Finish deposit to try again later.";

// One fee plan per ETH purchase, shared by the page's estimate and the spending guard: the ETH kept
// from the purchase covers every step at its gas ceiling and twice today's fee (headroom for rises while
// the steps confirm), plus Base's L1 data fees. What the steps don't use stays in the wallet for a later
// withdrawal or claim. Above RESERVE_MAX (a fee spike) the deposit waits rather than eat a small purchase.
const RESERVE_MIN = parseEther("0.00003");
const RESERVE_MAX = parseEther("0.0003");
type EthFeePlan = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; keep: bigint };
async function ethFeePlan(client: PublicClient): Promise<EthFeePlan> {
  const fees = await client.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas * 2n;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas < maxFeePerGas ? fees.maxPriorityFeePerGas : maxFeePerGas;
  const planned = PLANNED_GAS * maxFeePerGas + 4n * L1_FEE_FALLBACK;
  return { maxFeePerGas, maxPriorityFeePerGas, keep: planned > RESERVE_MIN ? planned : RESERVE_MIN };
}
/** The ETH an ETH purchase keeps for network fees right now (the deposit recomputes it when it runs). */
export async function ethGasReserve(client: PublicClient | undefined) {
  try { return (await ethFeePlan(client!)).keep; } catch { return RESERVE_MAX; }
}
const permitAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])",
]);

const isRejection = (err: unknown) => /user rejected|user denied|rejected the request/i.test(err instanceof Error ? err.message : String(err));

type Quote = ExecutableSwapQuote & {
  liquidityAvailable?: boolean;
  error?: string;
  issues?: { allowance?: { spender: Address }; balance?: unknown };
};

export type DepositStage = "idle" | "quoting" | "approving" | "signing" | "swapping" | "depositing" | "autoclaim";

/** Gas limit and fee caps for one transaction, from the ETH spending guard. */
type FeeLimits = { gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
type SpendGuard = (request: { to: Address; data: Hex; value?: bigint }, cap: bigint) => Promise<FeeLimits>;

function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) return "Cancelled.";
  if (lower.includes("insufficient funds")) return "Your wallet doesn't have enough ETH on Base to pay network fees.";
  return message.length > 180 ? "The deposit could not be completed. Please try again." : message;
}

/**
 * Web2 deposit: spend an exact USDC or ETH amount, swap it to OBN, deposit the OBN into a pool,
 * and optionally turn on monthly autoclaim. Wallets that batch (Base Account sponsors the gas) do it
 * in one step and deposit the quote's guaranteed minimum; other wallets swap first and then deposit
 * exactly the OBN the swap produced.
 */
export function useUsdDeposit({ pid, account, tx, canBatch, onComplete }: {
  pid: number;
  account: Address | undefined;
  tx: ReturnType<typeof useWalletTransaction>;
  canBatch: boolean;
  onComplete: () => Promise<unknown>;
}) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [stage, setStage] = useState<DepositStage>("idle");

  // Bundle the whole deposit into one confirmation whenever the wallet already executes
  // atomic batches (EIP-5792 "supported"; legacy atomicBatch). "ready" would first ask the
  // user to upgrade their account, which is confusing here, so it takes the step-by-step path.
  const { connector } = useAccount();
  const { data: capabilities } = useCapabilities({ account, query: { enabled: !!account && canQueryCapabilities(connector?.id), retry: false } });
  const chainCapabilities = capabilities?.[CHAIN_ID] as { atomic?: { status?: string }; atomicBatch?: { supported?: boolean } } | undefined;
  const canBundle = canBatch || chainCapabilities?.atomic?.status === "supported" || chainCapabilities?.atomicBatch?.supported === true;

  const { data: ethBalance, refetch: refetchEth } = useBalance({
    address: account, chainId: CHAIN_ID, query: { enabled: !!account, staleTime: 15_000 },
  });
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account, staleTime: 15_000 },
  });

  const fetchQuote = useCallback(async (owner: Address, fromToken: Address, amount: bigint) => {
    const response = await fetch("/api/swap/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromToken, toToken: OBN_TOKEN_ADDRESS, fromAmount: amount.toString(), taker: owner, slippageBps: SLIPPAGE_BPS }),
    });
    const quote = await response.json() as Quote;
    if (!response.ok) throw new Error(quote.error || "Unable to price this deposit right now.");
    if (!quote.liquidityAvailable) throw new Error("Deposits are temporarily unavailable. Please try again shortly.");
    if (quote.issues?.balance) throw new Error(`Your wallet doesn't have enough ${fromToken === NATIVE_TOKEN ? "ETH" : "USDC"} for this amount.`);
    return quote;
  }, []);

  const verify = useCallback(async (quote: Quote, owner: Address, fromToken: Address, amount: bigint) => {
    validateSwapQuote(quote, { chainId: CHAIN_ID, account: owner, fromToken, toToken: OBN_TOKEN_ADDRESS, fromAmount: amount });
    if (!publicClient) throw new Error("Unable to verify the swap route.");
    await validateSwapRouter(quote, name => publicClient.readContract(swapRegistryRead(name)));
  }, [publicClient]);

  const signedSwapData = useCallback(async (quote: Quote) => {
    if (!quote.transaction) throw new Error("The swap provider did not return transaction data.");
    if (!quote.permit2?.eip712) return quote.transaction.data;
    setStage("signing");
    const signature = await tx.signTypedDataAsync(quote.permit2.eip712 as Parameters<typeof tx.signTypedDataAsync>[0]);
    return concat([quote.transaction.data, numberToHex(size(signature), { signed: false, size: 32 }), signature]) as Hex;
  }, [tx]);

  // An approval is confirmed before this runs, but a load-balanced RPC node can briefly
  // serve an older block. Re-read for up to ~10s (as the Stake flow does) before giving up.
  const waitForAllowance = useCallback(async (token: Address, owner: Address, spender: Address, amount: bigint) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 500));
      try {
        if (await publicClient!.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] }) >= amount) return;
      } catch { /* Retry transient RPC errors. */ }
    }
    throw new Error("Your approval is confirmed but the network hasn't caught up yet. Please tap the button again in a moment.");
  }, [publicClient]);

  /** The autoclaim opt-in call, when monthly autoclaim is live and this wallet hasn't turned it on yet. */
  const autoClaimCall = useCallback(async (owner: Address) => {
    try {
      const [[enabled], executor] = await Promise.all([
        publicClient!.readContract({ address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimPreference", args: [owner] }),
        publicClient!.readContract({ address: STAKING_PROXY, abi: autoClaimAbi, functionName: "autoClaimExecutor" }),
      ]);
      if (enabled || executor === zeroAddress) return null;
      return { to: STAKING_PROXY, data: encodeFunctionData({ abi: autoClaimAbi, functionName: "setAutoClaimEnabled", args: [true] }) };
    } catch {
      return null; // Autoclaim is optional: never block a deposit on it.
    }
  }, [publicClient]);

  /**
   * Spending guard for a card purchase paid in ETH: the workflow may spend only the purchased ETH
   * (`budget`), never ETH the wallet already held. Every transaction gets an explicit gas limit and the
   * plan's fee caps, so its worst-case cost is fixed before it's sent, and it isn't sent if that cost
   * could reach the wallet's own ETH.
   */
  const ethSpendGuard = useCallback(async (owner: Address, budget: bigint, { maxFeePerGas, maxPriorityFeePerGas }: EthFeePlan): Promise<SpendGuard> => {
    const client = publicClient!;
    const start = await client.getBalance({ address: owner });
    const ownEth = start > budget ? start - budget : 0n;
    return async ({ to, data, value = 0n }, cap) => {
      const sent = concat([data, DATA_SUFFIX]); // What the wallet actually sends.
      const estimate = await client.estimateGas({ account: owner, to, data: sent, value });
      if (estimate > cap) throw new Error(`This step needs more network fees than planned. ${KEEP_PURCHASE}`);
      const padded = estimate * 5n / 4n;
      const gas = padded < cap ? padded : cap;
      let l1Fee = L1_FEE_FALLBACK;
      try { l1Fee = await estimateL1Fee(client, { account: owner, chain: client.chain, to, data: sent, value }) * 2n; } catch { /* Fallback. */ }
      const balance = await client.getBalance({ address: owner });
      if (balance < ownEth + value + gas * maxFeePerGas + l1Fee) {
        throw new Error(`Stopped so this deposit doesn't use ETH you already had. ${KEEP_PURCHASE}`);
      }
      return { gas, maxFeePerGas, maxPriorityFeePerGas };
    };
  }, [publicClient]);

  /** Deposit OBN a swap just produced: a free permit + one transaction, or approve + deposit. */
  const stakeObn = useCallback(async (owner: Address, amount: bigint, limit: SpendGuard | null) => {
    // OBN supports EIP-2612, so a plain wallet signs a free approval and deposits in one
    // transaction (depositWithPermit pulls from the sender and credits the beneficiary).
    // Smart contract wallets can't produce that signature and use approve + deposit.
    let permit: { deadline: bigint; v: number; r: Hex; s: Hex } | null = null;
    const code = await publicClient!.getCode({ address: owner });
    if (!code || code === "0x") {
      try {
        const [domain, nonce] = await Promise.all([
          publicClient!.readContract({ address: OBN_TOKEN_ADDRESS, abi: permitAbi, functionName: "eip712Domain" }),
          publicClient!.readContract({ address: OBN_TOKEN_ADDRESS, abi: permitAbi, functionName: "nonces", args: [owner] }),
        ]);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
        setStage("signing");
        const signature = await tx.signTypedDataAsync({
          domain: { name: domain[1], version: domain[2], chainId: CHAIN_ID, verifyingContract: OBN_TOKEN_ADDRESS },
          types: { Permit: [
            { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
          ] },
          primaryType: "Permit",
          message: { owner, spender: STAKING_CONTRACT, value: amount, nonce, deadline },
        });
        const { r, s, v, yParity } = parseSignature(signature);
        permit = { deadline, r, s, v: Number(v ?? BigInt(27 + (yParity ?? 0))) };
      } catch (err) {
        if (isRejection(err)) throw err;
        permit = null; // Wallet can't sign permits: fall back to approve + deposit.
      }
    }
    setStage("depositing");
    if (permit) {
      const args = [BigInt(pid), amount, owner, permit.deadline, permit.v, permit.r, permit.s] as const;
      const limits = limit ? await limit({ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "depositWithPermit", args }) }, GAS_CAP.deposit) : {};
      await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "depositWithPermit", args, dataSuffix: DATA_SUFFIX, ...limits });
    } else {
      const approveLimits = limit ? await limit({ to: OBN_TOKEN_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, amount] }) }, GAS_CAP.approve) : {};
      await tx.writeContractAsync({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, amount], dataSuffix: DATA_SUFFIX, ...approveLimits });
      await waitForAllowance(OBN_TOKEN_ADDRESS, owner, STAKING_CONTRACT, amount);
      const depositLimits = limit ? await limit({ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), amount] }) }, GAS_CAP.deposit) : {};
      await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), amount], dataSuffix: DATA_SUFFIX, ...depositLimits });
    }
  }, [publicClient, tx, pid, waitForAllowance]);

  /**
   * Deposit newly purchased funds and only the OBN their swap produced; other wallet funds are never
   * touched. USDC: swap exactly `amount` (6 decimals). ETH: `amount` is the purchased ETH (wei); part is
   * kept for network fees (ethFeePlan), the rest is swapped, and the swap plus every fee stays inside
   * `amount` (ethSpendGuard). With `enableAutoClaim`, monthly autoclaim is turned on in the same batch, or
   * as a last step for wallets that can't batch. Resolves true once the deposit succeeds, whether or not
   * autoclaim was turned on.
   */
  const deposit = useCallback(async (source: DepositSource, amount: bigint, { enableAutoClaim = false } = {}) => {
    const fromToken = source === "ETH" ? NATIVE_TOKEN : USDC_ADDRESS;
    // A batch can't carry fee caps, so ETH purchases batch only when the paymaster pays every fee.
    const bundle = source === "ETH" ? canBatch : canBundle;
    let succeeded = false;
    await tx.run("Deposit", async () => {
    if (!account || !publicClient || amount <= 0n) return;
    let autoClaimed = false;
    try {
      setStage("quoting");
      let spend = amount;
      let plan: EthFeePlan | null = null;
      if (source === "ETH") {
        plan = await ethFeePlan(publicClient);
        if (plan.keep > RESERVE_MAX) throw new Error(`Network fees are unusually high right now. ${KEEP_PURCHASE}`);
        spend = amount - plan.keep;
        if (spend <= 0n) throw new Error("This purchase is too small to cover network fees.");
      }
      let quote = await fetchQuote(account, fromToken, spend);
      const allowance = quote.issues?.allowance;
      const autoClaim = enableAutoClaim ? await autoClaimCall(account) : null;

      if (bundle && quote.transaction) {
        // One atomic batch (gas-sponsored when available):
        // [approve USDC] → swap → approve OBN → deposit(minimum received) → [turn on autoclaim].
        // For ETH this path is sponsored, so the only ETH spent is the swap's value: part of the purchase.
        await verify(quote, account, fromToken, spend);
        const swapData = await signedSwapData(quote);
        await verify(quote, account, fromToken, spend);
        const total = BigInt(quote.minToAmount!);
        setStage("depositing");
        await tx.sendCallsAsync({
          calls: [
            ...(allowance ? [{ to: USDC_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [allowance.spender, spend] }) }] : []),
            { to: quote.transaction.to, data: swapData, value: BigInt(quote.transaction.value) },
            { to: OBN_TOKEN_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, total] }) },
            { to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), total] }) },
            ...(autoClaim ? [autoClaim] : []),
          ],
          capabilities: canBatch
            ? { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } }
            : { dataSuffix: { value: DATA_SUFFIX, optional: true } },
          forceAtomic: true,
        });
        autoClaimed = !!autoClaim;
      } else {
        // ETH needs no approval: native swaps carry the amount as the transaction value.
        // Every ETH step is fee-capped so the whole workflow stays inside the purchased ETH.
        const limit = plan ? await ethSpendGuard(account, amount, plan) : null;
        if (allowance) {
          await verify(quote, account, fromToken, spend);
          setStage("approving");
          await tx.writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [allowance.spender, spend], dataSuffix: DATA_SUFFIX });
          await waitForAllowance(USDC_ADDRESS, account, allowance.spender, spend);
          quote = await fetchQuote(account, fromToken, spend);
        }
        await verify(quote, account, fromToken, spend);
        const swapData = await signedSwapData(quote);
        await verify(quote, account, fromToken, spend);

        const obnBefore = await publicClient.readContract({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account] });
        setStage("swapping");
        const swap = { to: quote.transaction!.to, data: swapData, value: BigInt(quote.transaction!.value) };
        const swapLimits = limit ? await limit(swap, GAS_CAP.swap) : {};
        await tx.sendTransactionAsync({ ...swap, dataSuffix: DATA_SUFFIX, ...swapLimits });
        // The swap is confirmed, but a load-balanced RPC node can briefly serve an older block.
        let received = 0n;
        for (let attempt = 0; attempt < 6 && received <= 0n; attempt++) {
          if (attempt) await new Promise(resolve => setTimeout(resolve, 500));
          const obnAfter = await publicClient.readContract({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account] });
          received = obnAfter - obnBefore;
        }
        if (received <= 0n) throw new Error("The swap finished but no OBN arrived yet. Refresh in a moment; your funds are in your wallet balance.");
        await stakeObn(account, received, limit);
        if (autoClaim) {
          // Its own step: the deposit already succeeded, so a cancel or failure here only skips autoclaim.
          try {
            setStage("autoclaim");
            const autoLimits = limit ? await limit(autoClaim, GAS_CAP.autoclaim) : {};
            await tx.writeContractAsync({ address: STAKING_PROXY, abi: autoClaimAbi, functionName: "setAutoClaimEnabled", args: [true], dataSuffix: DATA_SUFFIX, ...autoLimits });
            autoClaimed = true;
          } catch {
            toast.message("Monthly autoclaim wasn't turned on. You can turn it on anytime with the Auto button.");
          }
        }
      }
      succeeded = true;
      toast.success(autoClaimed
        ? "Deposit complete and monthly autoclaim is on. Thank you for supporting this nonprofit!"
        : "Deposit complete. Thank you for supporting this nonprofit!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setStage("idle");
      void refetchUsdc();
      void refetchEth();
      void onComplete();
    }
    });
    return succeeded;
  }, [account, publicClient, tx, pid, canBatch, canBundle, fetchQuote, verify, signedSwapData, waitForAllowance, ethSpendGuard, stakeObn, autoClaimCall, refetchUsdc, refetchEth, onComplete]);

  return { usdcBalance, refetchUsdc, ethBalance: ethBalance?.value, refetchEth, stage, busy: stage !== "idle", deposit };
}
