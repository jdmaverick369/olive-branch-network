"use client";

import { useAccount, useBalance, usePublicClient, useDisconnect } from "wagmi";
import { formatEther } from "viem";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`;
const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;

const stakingAbi = [
  {
    name: "poolLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getUserStaked",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export function StatusBar() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const publicClient = usePublicClient();

  const { data: ethBalanceData, refetch: refetchEth } = useBalance({ address });
  const { data: obnBalanceData, refetch: refetchObn } = useBalance({
    address,
    token: OBN_TOKEN_ADDRESS,
  });

  const [ethBalance, setEthBalance] = useState(0);
  const [obnBalance, setObnBalance] = useState(0);
  const [obnStaked, setObnStaked] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchTotalStaked = async () => {
    if (!publicClient || !address) {
      setObnStaked(0);
      return;
    }

    try {
      const poolLength = (await publicClient.readContract({
        address: STAKING_CONTRACT,
        abi: stakingAbi,
        functionName: "poolLength",
      })) as bigint;

      let total = 0n;
      for (let pid = 0; pid < Number(poolLength); pid++) {
        const staked = (await publicClient.readContract({
          address: STAKING_CONTRACT,
          abi: stakingAbi,
          functionName: "getUserStaked",
          args: [pid, address],
        })) as bigint;
        total += staked;
      }

      setObnStaked(Number(total) / 1e18);
    } catch (err) {
      console.error("❌ Error fetching total staked:", err);
      setObnStaked(0);
    }
  };

  useEffect(() => {
    const updateBalances = () => {
      if (ethBalanceData) setEthBalance(parseFloat(formatEther(ethBalanceData.value)));
      if (obnBalanceData) setObnBalance(parseFloat(formatEther(obnBalanceData.value)));
    };
    updateBalances();
    fetchTotalStaked();

    const interval = setInterval(async () => {
      await refetchEth();
      await refetchObn();
      updateBalances();
      await fetchTotalStaked();
    }, 10000);

    return () => clearInterval(interval);
  }, [publicClient, address, ethBalanceData, obnBalanceData]);

  const handleDisconnect = () => {
    disconnect();
    router.push("/"); // 👈 return to landing page
  };

  return (
    <div
      className="
        fixed bottom 0 left-0 w-full
        bg-base-200 text-foreground text-sm md:text-base
        p-3 md:p-4 flex flex-col items-center justify-center
        shadow-inner z-50 space-y-2
      "
    >
      <span className="font-medium">OBN Balance: {obnBalance.toFixed(2)}</span>
      <span className="font-medium">Total OBN Staked: {obnStaked.toFixed(2)}</span>
      <span className="font-medium">ETH: {ethBalance.toFixed(4)}</span>

      {mounted && address && (
        <button
          onClick={handleDisconnect}
          className="
            mt-2 px-4 py-2 text-sm font-semibold
            rounded-md border border-red-500 text-red-600
            hover:bg-red-500 hover:text-white transition-colors
          "
        >
          Disconnect
        </button>
      )}
    </div>
  );
}