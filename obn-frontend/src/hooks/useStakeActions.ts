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

  const stake = (pid: number, amount: bigint) => guarded("Stake", async () => {
    if (!account || !publicClient) throw new Error("Connect your wallet first.");
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, amount] });
    const deposit = encodeFunctionData({ abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), amount] });
    if (canBatch) return batch([{ to: OBN_TOKEN_ADDRESS, data: approve }, { to: STAKING_CONTRACT, data: deposit }]);

    await tx.writeContractAsync({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [STAKING_CONTRACT, amount], dataSuffix: DATA_SUFFIX });
    // Poll allowance to ride out RPC lag before depositing.
    for (let attempt = 0; ; attempt++) {
      const allowance = await publicClient.readContract({ address: OBN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [account, STAKING_CONTRACT] }).catch(() => 0n);
      if (allowance >= amount) break;
      if (attempt >= 10) throw new Error("Allowance not confirmed after polling.");
      await new Promise(r => setTimeout(r, 500));
    }
    await tx.writeContractAsync({ address: STAKING_CONTRACT, abi: stakingAbi, functionName: "deposit", args: [BigInt(pid), amount], dataSuffix: DATA_SUFFIX });
  });

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

  return { stake, unstake, claim, claimMany, busy, canBatch, tx };
}
