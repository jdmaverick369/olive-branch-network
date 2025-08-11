// src/app/dashboard/[poolId]/page.tsx
"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract, useBalance } from "wagmi";
import { parseUnits, formatUnits, erc20Abi } from "viem";
import { stakingAbi } from "@/lib/stakingAbi";
import { ShareToFarcaster } from "@/components/ShareToFarcaster";
import { getPoolMeta } from "@/lib/pools";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// getPoolInfo returns: (address charityWallet, bool active, uint256 totalStaked)
type GetPoolInfoResult = readonly [`0x${string}`, boolean, bigint];

const fmt = (n: number, d = 4) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export default function PoolDetailPage() {
  const { poolId } = useParams() as { poolId?: string };
  const pid = Number(poolId);
  const router = useRouter();
  const { address } = useAccount();

  // Derived metadata (no early return; keep hooks order stable)
  const meta = Number.isFinite(pid) ? getPoolMeta(pid) : undefined;
  const invalid = !Number.isFinite(pid) || !meta;

  const title = meta?.name ?? `Pool #${Number.isFinite(pid) ? pid : "?"}`;
  const logo = meta?.logo ?? "/charity1.png";
  const detailDescription = meta?.detailDescription ?? meta?.listDescription ?? "";

  // Local UI state
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const [totalStaked, setTotalStaked] = useState(0);
  const [userStake, setUserStake] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);

  // Wallet balances (call hooks unconditionally)
  const userAddr = (address ?? ZERO_ADDR) as `0x${string}`;
  const { data: ethBal, refetch: refetchEth } = useBalance({ address: userAddr });
  const { data: obnBal, refetch: refetchObn } = useBalance({ address: userAddr, token: OBN_TOKEN_ADDRESS });
  const [ethBalance, setEthBalance] = useState(0);
  const [obnBalance, setObnBalance] = useState(0);

  // Reads (declare hooks always; gate with `enabled`)
  const effectivePid = useMemo(() => (Number.isFinite(pid) ? BigInt(pid) : 0n), [pid]);

  const { data: poolData, refetch: refetchPool } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "getPoolInfo",
    args: [effectivePid],
    query: { enabled: !invalid },
  });

  const { data: userStakeData, refetch: refetchUserStake } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "getUserStakeValue",
    args: [effectivePid, userAddr],
    query: { enabled: !invalid && address != null },
  });

  const { data: pendingRewardsData, refetch: refetchPendingRewards } = useReadContract({
    address: STAKING_CONTRACT,
    abi: stakingAbi,
    functionName: "pendingRewards",
    args: [userAddr],
    query: { enabled: !invalid && address != null },
  });

  // Push read results into UI state
  useEffect(() => {
    if (poolData) {
      const [, , totalStakedRaw] = poolData as GetPoolInfoResult;
      setTotalStaked(Number.parseFloat(formatUnits(totalStakedRaw, 18)));
    }
    if (typeof userStakeData !== "undefined") {
      setUserStake(Number.parseFloat(formatUnits(userStakeData as bigint, 18)));
    }
    if (typeof pendingRewardsData !== "undefined") {
      setPendingRewards(Number.parseFloat(formatUnits(pendingRewardsData as bigint, 18)));
    }
  }, [poolData, userStakeData, pendingRewardsData]);

  // Push balances into UI state
  useEffect(() => {
    if (ethBal) setEthBalance(Number.parseFloat(formatUnits(ethBal.value, ethBal.decimals)));
    if (obnBal) setObnBalance(Number.parseFloat(formatUnits(obnBal.value, obnBal.decimals)));
  }, [ethBal, obnBal]);

  // Light polling (only when valid)
  useEffect(() => {
    if (invalid) return;
    const id = setInterval(() => {
      refetchPool();
      refetchUserStake();
      refetchPendingRewards();
      refetchEth();
      refetchObn();
    }, 5000);
    return () => clearInterval(id);
  }, [invalid, refetchPool, refetchUserStake, refetchPendingRewards, refetchEth, refetchObn]);

  // Helpers
  const postTxnRefresh = async () => {
    await Promise.all([
      refetchPool(),
      refetchUserStake(),
      refetchPendingRewards(),
      refetchEth(),
      refetchObn(),
    ]);
  };

  // Actions
  const { writeContractAsync } = useWriteContract();

  const handleStake = async () => {
    if (!Number.isFinite(pid)) return alert("Invalid pool");
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
        args: [effectivePid, amt],
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
    if (!Number.isFinite(pid)) return alert("Invalid pool");
    if (!amount || isNaN(Number(amount))) return alert("Enter a valid amount");
    setLoading(true);
    try {
      const amt = parseUnits(amount, 18);
      await writeContractAsync({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "withdraw",
        args: [effectivePid, amt],
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

  const handleBackToDashboard = () => router.push("/dashboard");

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex flex-col">
      <main className="flex-1 px-4 py-7 flex flex-col items-center">
        {invalid ? (
          <section className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold mb-2">Pool not found</h2>
            <p className="text-sm text-gray-600 mb-4">
              The pool you’re looking for doesn’t exist or isn’t configured yet.
            </p>
            <button
              onClick={handleBackToDashboard}
              className="px-5 py-2.5 rounded-lg font-semibold border border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white transition text-sm"
            >
              Back to Dashboard
            </button>
          </section>
        ) : (
          <>
            <section className="bg-white rounded-xl shadow-lg p-5 max-w-md w-full mb-5">
              <h2 className="text-xl font-bold mb-3 text-center">{title}</h2>

              {/* Logo + description */}
              <div className="flex flex-col items-center mb-4">
                <Image
                  src={logo}
                  alt={`${title} logo`}
                  width={84}
                  height={84}
                  className="mb-1.5"
                  priority
                />
                {detailDescription && (
                  <p className="text-gray-700 text-center text-xs leading-relaxed">
                    {detailDescription}
                  </p>
                )}
              </div>

              {/* VERTICAL GROUPS */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 shadow-sm text-center">
                  <p className="text-gray-600 font-medium text-xs">Total Staked:</p>
                  <p className="font-semibold text-sm">{fmt(totalStaked)} OBN</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 shadow-sm text-center">
                  <p className="text-gray-600 font-medium text-xs">Your Stake:</p>
                  <p className="font-semibold text-sm mb-1.5">{fmt(userStake)} OBN</p>
                  <p className="text-gray-600 font-medium text-xs">Pending Rewards:</p>
                  <p className="font-semibold text-sm">{fmt(pendingRewards, 6)} OBN</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 shadow-sm text-center">
                  <p className="text-gray-600 font-medium text-xs">OBN Balance:</p>
                  <p className="font-semibold text-sm mb-1.5">{fmt(obnBalance, 2)} OBN</p>
                  <p className="text-gray-600 font-medium text-xs">ETH Balance:</p>
                  <p className="font-semibold text-sm">{fmt(ethBalance, 4)}</p>
                </div>
              </div>
            </section>

            <div className="flex flex-col items-center w-full max-w-md">
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter OBN amount"
                className="w-full border rounded-lg px-3.5 py-2.5 mb-3 text-center focus:ring-2 focus:ring-green-500 text-sm"
              />

              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  disabled={loading}
                  onClick={handleStake}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-green-700 text-green-700 hover:bg-green-700 hover:text-white disabled:opacity-50 transition text-sm"
                >
                  {loading ? "Processing..." : "Stake"}
                </button>

                <button
                  disabled={loading}
                  onClick={handleUnstake}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-red-600 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50 transition text-sm"
                >
                  {loading ? "Processing..." : "Unstake"}
                </button>

                <button
                  disabled={loading}
                  onClick={handleClaimToWallet}
                  className="px-5 py-2.5 rounded-lg font-semibold border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white disabled:opacity-50 transition text-sm"
                >
                  {loading ? "Processing..." : "Claim to Wallet"}
                </button>
              </div>

              <div className="mt-3">
                <ShareToFarcaster text={`I'm staking OBN in pool #${pid} 🌱 Join me:`} />
              </div>

              <button
                onClick={handleBackToDashboard}
                className="mt-4 px-6 py-2.5 rounded-lg font-semibold border border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white transition text-sm"
              >
                Back to Dashboard
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
