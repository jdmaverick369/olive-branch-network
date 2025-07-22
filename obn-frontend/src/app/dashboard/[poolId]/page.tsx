"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useWriteContract, useReadContract, useAccount } from "wagmi";
import { StatusBar } from "@/components/StatusBar";
import { stakingAbi } from "@/lib/stakingAbi";
import { parseUnits, erc20Abi, formatEther } from "viem";

// ✅ environment variables
const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;

export default function PoolDetailPage() {
  const { poolId } = useParams() as { poolId: string };
  const pid = poolId ? Number(poolId) : NaN;

  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  // ---- 🔥 Live balances ----
  const { data: poolData, refetch: refetchPool } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "pools",
    args: [pid],
    query: { enabled: !isNaN(pid),
     },
  });

  const { data: userData, refetch: refetchUser } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "userInfo",
    args: [pid, address ?? `0x0000000000000000000000000000000000000000`],
    query: { enabled: !!address && !isNaN(pid),
     },
  });

  // ✅ pending rewards
  const { data: pendingData, refetch: refetchPending } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "pendingRewards",
    args: address ? [pid, address] : undefined,
    query: { enabled: !!address && !isNaN(pid),
     },
  });

  const [totalStaked, setTotalStaked] = useState(0);
  const [yourStake, setYourStake] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);

  useEffect(() => {
    if (poolData) {
      const struct = poolData as unknown as [string, boolean, bigint, bigint, bigint];
      setTotalStaked(Number(struct[2]) / 1e18);
    }
    if (userData) {
      const struct = userData as unknown as [bigint, bigint, boolean];
      setYourStake(Number(struct[0]) / 1e18);
    }
    if (pendingData !== undefined) {
      setPendingRewards(Number(pendingData as bigint) / 1e18);
    }
  }, [poolData, userData, pendingData]);

  // poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchPool();
      refetchUser();
      refetchPending();
    }, 1000);
    return () => clearInterval(interval);
  }, [refetchPool, refetchUser, refetchPending]);
  // ---- 🔥 End live balances ----

  const { writeContractAsync } = useWriteContract();

  const handleStake = async () => {
    if (!amount || isNaN(Number(amount))) return alert("Enter a valid amount");
    if (isNaN(pid) || pid < 0) return alert("Invalid pool ID");

    setLoading(true);
    try {
      const amountToStake = parseUnits(amount, 18);

      await writeContractAsync({
        address: OBN_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [STAKING_CONTRACT, amountToStake],
      });

      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "deposit",
        args: [pid, amountToStake],
      });

      alert("✅ Staked successfully!");
      refetchPool();
      refetchUser();
      refetchPending();
    } catch (err) {
      console.error("❌ Stake transaction failed:", err);
      alert("Transaction failed. Check console for details.");
    }
    setLoading(false);
  };

  const handleAutoCompound = async () => {
    if (!amount || isNaN(Number(amount))) return alert("Enter a valid amount");
    if (isNaN(pid) || pid < 0) return alert("Invalid pool ID");

    setLoading(true);
    try {
      const amountToStake = parseUnits(amount, 18);

      await writeContractAsync({
        address: OBN_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [STAKING_CONTRACT, amountToStake],
      });

      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "deposit",
        args: [pid, amountToStake],
      });

      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "compound",
        args: [pid],
      });

      alert("✅ Staked & Compounded!");
      refetchPool();
      refetchUser();
      refetchPending();
    } catch (err) {
      console.error("❌ Auto-compound failed:", err);
      alert("Transaction failed. Check console for details.");
    }
    setLoading(false);
  };

  const handleClaim = async () => {
    if (isNaN(pid) || pid < 0) return alert("Invalid pool ID");
    setLoading(true);
    try {
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "claim",
        args: [pid],
      });
      alert("✅ Claimed rewards!");
      refetchPool();
      refetchUser();
      refetchPending();
    } catch (err) {
      console.error("❌ Claim failed:", err);
      alert("Transaction failed. Check console for details.");
    }
    setLoading(false);
  };

  const handleUnstake = async () => {
    if (!amount || isNaN(Number(amount))) return alert("Enter a valid amount");
    if (isNaN(pid) || pid < 0) return alert("Invalid pool ID");
    setLoading(true);
    try {
      const amountToWithdraw = parseUnits(amount, 18);
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "withdraw",
        args: [pid, amountToWithdraw],
      });
      alert("✅ Unstaked successfully!");
      refetchPool();
      refetchUser();
      refetchPending();
    } catch (err) {
      console.error("❌ Unstake failed:", err);
      alert("Transaction failed. Check console for details.");
    }
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen bg-[#a9c7f9] flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-24">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-6 text-center">
          Pool #{poolId}
        </h1>

        <p className="text-lg mb-6 text-center">
          Staking Pool ID: <span className="font-mono">{poolId}</span>
        </p>

        {/* ✅ Live Pool Info */}
        <div className="mb-8 p-4 border rounded-lg bg-white shadow text-center">
          <p className="text-lg font-semibold">
            Pending Rewards: {pendingRewards.toFixed(2)} OBN
          </p>
          <p className="text-lg font-semibold">
            Staked Amount: {yourStake.toFixed(2)} OBN
          </p>
          <p className="text-lg font-semibold">
            Pool Size: {totalStaked.toFixed(2)} OBN
          </p>
        </div>

        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount of OBN"
          className="
            border border-gray-300 rounded-md px-4 py-2 mb-8
            w-64 text-center text-lg
            focus:outline-none focus:ring-2 focus:ring-green-500
          "
        />

        <div className="flex flex-wrap gap-4 justify-center">
          <button
            disabled={loading}
            onClick={handleStake}
            className="
              px-6 py-3 rounded-md border-2 border-green-600 text-green-700 font-semibold
              hover:bg-green-600 hover:text-white transition-colors
              disabled:opacity-50
            "
          >
            {loading ? "Staking..." : "Stake"}
          </button>

          <button
            disabled={loading}
            onClick={handleAutoCompound}
            className="
              px-6 py-3 rounded-md border-2 border-green-600 text-green-700 font-semibold
              hover:bg-green-600 hover:text-white transition-colors
              disabled:opacity-50
            "
          >
            {loading ? "Processing..." : "Stake + Auto‑Compound"}
          </button>

          <button
            disabled={loading}
            onClick={handleClaim}
            className="
              px-6 py-3 rounded-md border-2 border-green-600 text-green-700 font-semibold
              hover:bg-green-600 hover:text-white transition-colors
              disabled:opacity-50
            "
          >
            {loading ? "Claiming..." : "Claim"}
          </button>

          <button
            disabled={loading}
            onClick={handleUnstake}
            className="
              px-6 py-3 rounded-md border-2 border-green-600 text-green-700 font-semibold
              hover:bg-green-600 hover:text-white transition-colors
              disabled:opacity-50
            "
          >
            {loading ? "Unstaking..." : "Unstake"}
          </button>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 w-full z-50">
        <StatusBar />
      </div>
    </div>
  );
}