"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useWriteContract, useReadContract, useAccount } from "wagmi";
import { stakingAbi } from "@/lib/stakingAbi";
import { parseUnits, erc20Abi } from "viem";
import { StatusBar } from "@/components/StatusBar";
import { useRouter } from "next/navigation";  // Add this import

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;

export default function PoolDetailPage() {
  const { poolId } = useParams() as { poolId: string };
  const pid = poolId ? Number(poolId) : NaN;
  const { address } = useAccount();
  const router = useRouter();  // Instantiate the useRouter hook

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const [totalStaked, setTotalStaked] = useState(0);
  const [userStake, setUserStake] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);

  // Fetch on-chain values
  const { data: poolData, refetch: refetchPool } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "getPoolInfo",
    args: [pid],
    query: { enabled: !isNaN(pid) },
  });

  const { data: userStakeData, refetch: refetchUserStake } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "getUserStakeValue",
    args: [pid, address ?? `0x0000000000000000000000000000000000000000`],
    query: { enabled: !!address && !isNaN(pid) },
  });

  const { data: pendingRewardsData, refetch: refetchPendingRewards } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "pendingRewards",
    args: [address ?? `0x0000000000000000000000000000000000000000`],
    query: { enabled: !!address && !isNaN(pid) },
  });

  // Update on-chain values when data is fetched
  useEffect(() => {
    if (poolData) {
      const [_charityWallet, _active, totalStakedRaw] = poolData as any;
      setTotalStaked(Number(totalStakedRaw) / 1e18);
    }
    if (userStakeData !== undefined) {
      setUserStake(Number(userStakeData) / 1e18);
    }
    if (pendingRewardsData !== undefined) {
      setPendingRewards(Number(pendingRewardsData) / 1e18);
    }
  }, [poolData, userStakeData, pendingRewardsData]);

  // Polling function to update balances and pending rewards periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refetchPool();
      refetchUserStake();
      refetchPendingRewards();
    }, 5000); // Every 5 seconds

    return () => clearInterval(interval); // Clean up interval on unmount
  }, [refetchPool, refetchUserStake, refetchPendingRewards]);

  // Refresh after actions
  const postTxnRefresh = async () => {
    await Promise.all([refetchPool(), refetchUserStake(), refetchPendingRewards()]);
  };

  // Actions (stake, unstake, claim, etc)
  const { writeContractAsync } = useWriteContract();

  const handleStake = async () => {
    if (!amount || isNaN(Number(amount))) return alert("Enter a valid amount");
    setLoading(true);
    try {
      const amt = parseUnits(amount, 18);
      await writeContractAsync({
        address: OBN_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [STAKING_CONTRACT, amt],
      });
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "deposit",
        args: [pid, amt],
      });
      alert("✅ Staked successfully!");
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
      alert("❌ Transaction failed");
    }
    setLoading(false);
  };

  const handleUnstake = async () => {
    if (!amount || isNaN(Number(amount))) return alert("Enter a valid amount");
    setLoading(true);
    try {
      const amt = parseUnits(amount, 18);
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "withdraw",
        args: [pid, amt],
      });
      alert("✅ Unstaked successfully!");
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
      alert("❌ Transaction failed");
    }
    setLoading(false);
  };

  const handleClaimToWallet = async () => {
    setLoading(true);
    try {
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "claimToWallet",
        args: [],
      });
      alert("✅ Claimed to wallet!");
      await postTxnRefresh();
    } catch (err) {
      console.error(err);
      alert("❌ Transaction failed");
    }
    setLoading(false);
  };

  // Navigate back to the dashboard
  const handleBackToDashboard = () => {
    router.push("/dashboard"); // Navigate to the dashboard page
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex flex-col">
      <header className="fixed top-0 left-0 w-full bg-green-700 text-white py-3 text-center font-bold text-xl shadow-md z-50">
        🌱 Olive Branch Network — Pool #{poolId}
      </header>

      <div className="pt-16"></div>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <section className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mb-6">
          <h2 className="text-2xl font-bold mb-4 text-center">Pool Details</h2>
          <div className="mb-4">
            <p className="text-gray-600">
              <strong>Total Staked:</strong> {totalStaked.toFixed(4)} OBN
            </p>
            <p className="text-gray-600">
              <strong>Your Stake:</strong> {userStake.toFixed(4)} OBN
            </p>
          </div>
          <div className="mb-6">
            <p className="text-gray-600">
              <strong>Pending Rewards:</strong> {pendingRewards.toFixed(6)} OBN
            </p>
          </div>
        </section>

        <div className="flex flex-col items-center w-full max-w-md">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter OBN amount"
            className="w-full border rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-green-500"
          />

          <div className="flex flex-wrap gap-4 justify-center">
            <button
              disabled={loading}
              onClick={handleStake}
              className="px-6 py-3 rounded-lg font-semibold border border-green-700 text-green-700 hover:bg-green-700 hover:text-white disabled:opacity-50 transition"
            >
              {loading ? "Processing..." : "Stake"}
            </button>

            <button
              disabled={loading}
              onClick={handleUnstake}
              className="px-6 py-3 rounded-lg font-semibold border border-red-600 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50 transition"
            >
              {loading ? "Processing..." : "Unstake"}
            </button>

            <button
              disabled={loading}
              onClick={handleClaimToWallet}
              className="px-6 py-3 rounded-lg font-semibold border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white disabled:opacity-50 transition"
            >
              {loading ? "Processing..." : "Claim to Wallet"}
            </button>
          </div>
        </div>

        <button
          onClick={handleBackToDashboard}
          className="mt-6 px-6 py-3 rounded-lg font-semibold border border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white disabled:opacity-50 transition"
        >
          Back to Dashboard
        </button>
      </main>

      <footer className="fixed bottom-0 left-0 w-full">
        <StatusBar />
      </footer>
    </div>
  );
}
