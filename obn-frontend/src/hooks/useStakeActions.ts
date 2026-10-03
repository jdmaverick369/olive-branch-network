"use client";

import { useState } from "react";
import { useAccount, useCapabilities, usePublicClient } from "wagmi";
import { encodeFunctionData, erc20Abi } from "viem";
import { stakingAbi } from "@/lib/stakingAbi";
import { DATA_SUFFIX } from "@/lib/builderCode";
import { useWalletTransaction } from "@/hooks/useWalletTransaction";
import { canQueryCapabilities } from "@/lib/walletCapabilities";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);

/**
 * Stake / unstake / claim for any pool, shared by the pool page and Ask Oliver:
 * Base Account batches approve+deposit through the paymaster; other wallets go sequentially.
 * Each action resolves true only once the wallet confirmed it on-chain.
 */
export function useStakeActions(account: `0x${string}` | undefined) {
  const { connector } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { data: capabilities } = useCapabilities({
    account,
    query: { enabled: !!account && canQueryCapabilities(connector?.id) },
  });
  const canBatch = !!(capabilities?.[CHAIN_ID]?.paymasterService?.supported && PAYMASTER_URL);
  const tx = useWalletTransaction(CHAIN_ID, account);
  const [busy, setBusy] = useState(false);

  const guarded = async (label: string, task: () => Promise<void>) => {
    if (busy) return false;
    let ok = false;
    setBusy(true);
    try {
      // run() toasts its own errors; we only need to know whether the task finished.
      await tx.run(label, async () => { await task(); ok = true; });
    } finally {
      setBusy(false);
    }
    return ok;
  };

  const batch = (calls: { to: `0x${string}`; data: `0x${string}` }[]) => tx.sendCallsAsync({
    calls,
    capabilities: { paymasterService: { url: PAYMASTER_URL }, dataSuffix: { value: DATA_SUFFIX, optional: true } },
  }).then(() => undefined);

  const allowance = () => publicClient!.readContract({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [account!, STAKING_CONTRACT] });

  /**
   * Stake into one or more pools. The approval is skipped when the existing one already covers the
   * total (one fewer wallet prompt, which matters on hardware wallets); otherwise a single approval
   * covers every pool. Base Account sends it all as one batch. `done` lists pools that were staked.
   */
  const stakeMany = async (items: { pid: number; amount: bigint }[]) => {
    const done: number[] = [];
    const ok = await guarded("Stake", async () => {
      if (!account || !publicClient) throw new Error("Connect your wallet first.");
      const total = items.reduce((sum, item) => sum + item.amount, 0n);
      const approved = await allowance().catch(() => 0n);
      const needsApproval = approved < total;
      const approveCall = { to: OBN_TOKEN_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, total] }) };
      const deposits = items.map(item => ({ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [BigInt(item.pid), item.amount] }) }));
      if (canBatch) {
        await batch(needsApproval ? [approveCall, ...deposits] : deposits);
        done.push(...items.map(item => item.pid));
        return;
      }
      if (needsApproval) {
        await tx.writeContractAsync({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, total], dataSuffix: DATA_SUFFIX });
        // Poll allowance to ride out RPC lag before depositing.
        for (let attempt = 0; ; attempt++) {
          if ((await allowance().catch(() => 0n)) >= total) break;
          if (attempt >= 10) throw new Error("Allowance not confirmed after polling.");
          await new Promise(r => setTimeout(r, 500));
        }
      }
      for (const item of items) {
        await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "deposit", args: [BigInt(item.pid), item.amount], dataSuffix: DATA_SUFFIX });
        done.push(item.pid);
      }
    });
    return { ok, done };
  };

  const stake = async (pid: number, amount: bigint) => (await stakeMany([{ pid, amount }])).ok;

  const unstake = (pid: number, amount: bigint) => guarded("Unstake", async () => {
    if (canBatch) return batch([{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "withdraw", args: [BigInt(pid), amount] }) }]);
    await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "withdraw", args: [BigInt(pid), amount], dataSuffix: DATA_SUFFIX });
  });

  const claim = (pid: number) => guarded("Claim rewards", async () => {
    if (canBatch) return batch([{ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claim", args: [BigInt(pid)] }) }]);
    await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "claim", args: [BigInt(pid)], dataSuffix: DATA_SUFFIX });
  });

  /** Claim several pools: one batched request on Base Account, otherwise one wallet prompt per pool. */
  const claimMany = async (pids: number[]) => {
    const done: number[] = [];
    const ok = await guarded("Claim rewards", async () => {
      if (canBatch) {
        await batch(pids.map(pid => ({ to: STAKING_CONTRACT, data: encodeFunctionData({ abi: stakingAbi, functionName: "claim", args: [BigInt(pid)] }) })));
        done.push(...pids);
        return;
      }
      for (const pid of pids) {
        await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "claim", args: [BigInt(pid)], dataSuffix: DATA_SUFFIX });
        done.push(pid);
      }
    });
    return { ok, done };
  };

  return { stake, stakeMany, unstake, claim, claimMany, busy, canBatch, tx };
}
