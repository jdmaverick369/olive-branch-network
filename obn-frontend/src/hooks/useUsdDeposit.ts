"use client";

import { useCallback, useState } from "react";
import { useCapabilities, usePublicClient, useReadContract } from "wagmi";
import { concat, encodeFunctionData, erc20Abi, numberToHex, parseAbi, parseSignature, size, type Address, type Hex } from "viem";
import { toast } from "sonner";
import { stakingAbi } from "@/lib/stakingAbi";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { validateSwapQuote, validateSwapRouter, swapRegistryRead, type ExecutableSwapQuote } from "@/lib/swapQuoteValidation";
import type { useWalletTransaction } from "@/hooks/useWalletTransaction";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);
const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as Address;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as Address;
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
export const USDC_ADDRESS = (CHAIN_ID === 84532
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address;
const SLIPPAGE_BPS = 100;
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

export type DepositStage = "idle" | "quoting" | "approving" | "signing" | "swapping" | "depositing";

function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) return "Cancelled.";
  if (lower.includes("insufficient funds")) return "Your wallet needs a small amount of ETH on Base to pay network fees.";
  return message.length > 180 ? "The deposit could not be completed. Please try again." : message;
}

/**
 * Web2 deposit: spend an exact USDC amount, swap it to OBN, and deposit the OBN
 * into a pool. Base Account (batch + paymaster) does it in one sponsored step and
 * deposits the quote's guaranteed minimum; other wallets swap first and then
 * deposit exactly the OBN the swap produced.
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
  const { data: capabilities } = useCapabilities({ account, query: { enabled: !!account, retry: false } });
  const chainCapabilities = capabilities?.[CHAIN_ID] as { atomic?: { status?: string }; atomicBatch?: { supported?: boolean } } | undefined;
  const canBundle = canBatch || chainCapabilities?.atomic?.status === "supported" || chainCapabilities?.atomicBatch?.supported === true;

  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account, staleTime: 15_000 },
  });

  const fetchQuote = useCallback(async (owner: Address, usdcAmount: bigint) => {
    const response = await fetch("/api/swap/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromToken: USDC_ADDRESS, toToken: OBN_TOKEN_ADDRESS, fromAmount: usdcAmount.toString(), taker: owner, slippageBps: SLIPPAGE_BPS }),
    });
    const quote = await response.json() as Quote;
    if (!response.ok) throw new Error(quote.error || "Unable to price this deposit right now.");
    if (!quote.liquidityAvailable) throw new Error("Deposits are temporarily unavailable. Please try again shortly.");
    if (quote.issues?.balance) throw new Error("Your wallet doesn't have enough USDC for this amount.");
    return quote;
  }, []);

  const verify = useCallback(async (quote: Quote, owner: Address, usdcAmount: bigint) => {
    validateSwapQuote(quote, { chainId: CHAIN_ID, account: owner, fromToken: USDC_ADDRESS, toToken: OBN_TOKEN_ADDRESS, fromAmount: usdcAmount });
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

  /** Deposit OBN a swap just produced: one bundle, a free permit + one transaction, or approve + deposit. */
  const stakeObn = useCallback(async (owner: Address, amount: bigint) => {
    if (canBundle) {
      setStage("depositing");
      await tx.sendCallsAsync({
        calls: [
          { to: OBN_TOKEN_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, amount] }) },
          { to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), amount] }) },
        ],
        capabilities: canBatch
          ? { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } }
          : { dataSuffix: { value: DATA_SUFFIX, optional: true } },
        forceAtomic: true,
      });
      return;
    }
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
      await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "depositWithPermit",
        args: [BigInt(pid), amount, owner, permit.deadline, permit.v, permit.r, permit.s], dataSuffix: DATA_SUFFIX });
    } else {
      await tx.writeContractAsync({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, amount], dataSuffix: DATA_SUFFIX });
      await waitForAllowance(OBN_TOKEN_ADDRESS, owner, STAKING_CONTRACT, amount);
      await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), amount], dataSuffix: DATA_SUFFIX });
    }
  }, [canBundle, canBatch, publicClient, tx, pid, waitForAllowance]);

  /**
   * Swap exactly `usdcAmount` (6 decimals) of USDC and deposit only the OBN that swap produced.
   * Callers pass only newly purchased USDC; other wallet funds are never touched. Resolves true on success.
   */
  const deposit = useCallback(async (usdcAmount: bigint) => {
    let succeeded = false;
    await tx.run("Deposit", async () => {
    if (!account || !publicClient || usdcAmount <= 0n) return;
    try {
      setStage("quoting");
      let quote = await fetchQuote(account, usdcAmount);
      const allowance = quote.issues?.allowance;

      if (canBundle && quote.transaction) {
        // One atomic batch (gas-sponsored when available): [approve USDC] → swap → approve OBN → deposit(minimum received).
        await verify(quote, account, usdcAmount);
        const swapData = await signedSwapData(quote);
        await verify(quote, account, usdcAmount);
        const total = BigInt(quote.minToAmount!);
        setStage("depositing");
        await tx.sendCallsAsync({
          calls: [
            ...(allowance ? [{ to: USDC_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [allowance.spender, usdcAmount] }) }] : []),
            { to: quote.transaction.to, data: swapData },
            { to: OBN_TOKEN_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, total] }) },
            { to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), total] }) },
          ],
          capabilities: canBatch
            ? { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } }
            : { dataSuffix: { value: DATA_SUFFIX, optional: true } },
          forceAtomic: true,
        });
      } else {
        if (allowance) {
          await verify(quote, account, usdcAmount);
          setStage("approving");
          await tx.writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [allowance.spender, usdcAmount], dataSuffix: DATA_SUFFIX });
          await waitForAllowance(USDC_ADDRESS, account, allowance.spender, usdcAmount);
          quote = await fetchQuote(account, usdcAmount);
        }
        await verify(quote, account, usdcAmount);
        const swapData = await signedSwapData(quote);
        await verify(quote, account, usdcAmount);

        const obnBefore = await publicClient.readContract({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account] });
        setStage("swapping");
        await tx.sendTransactionAsync({ to: quote.transaction!.to, data: swapData, value: 0n, dataSuffix: DATA_SUFFIX });
        // The swap is confirmed, but a load-balanced RPC node can briefly serve an older block.
        let received = 0n;
        for (let attempt = 0; attempt < 6 && received <= 0n; attempt++) {
          if (attempt) await new Promise(resolve => setTimeout(resolve, 500));
          const obnAfter = await publicClient.readContract({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account] });
          received = obnAfter - obnBefore;
        }
        if (received <= 0n) throw new Error("The swap finished but no OBN arrived yet. Refresh in a moment; your funds are in your wallet balance.");
        await stakeObn(account, received);
      }
      succeeded = true;
      toast.success("Deposit complete. Thank you for supporting this nonprofit!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setStage("idle");
      void refetchUsdc();
      void onComplete();
    }
    });
    return succeeded;
  }, [account, publicClient, tx, pid, canBatch, canBundle, fetchQuote, verify, signedSwapData, waitForAllowance, stakeObn, refetchUsdc, onComplete]);

  return { usdcBalance, refetchUsdc, stage, busy: stage !== "idle", deposit };
}
