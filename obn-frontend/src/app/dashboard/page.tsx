"use client";

import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { useEffect } from "react";
import PoolCard from "@/components/PoolCard";
import { StatusBar } from "@/components/StatusBar";
import { stakingAbi } from "@/lib/stakingAbi";
import { useDisconnect } from "wagmi";

const pools = [
  {
    pid: 0,
    name: "Main Charity Pool",
    logo: "/charity1.png",
    description:
      "Support environmental projects worldwide by staking your OBN here.",
  },
  {
    pid: 1,
    name: "Education Fund",
    logo: "/charity2.png",
    description:
      "Stake OBN to help build schools and provide learning resources.",
  },
  {
    pid: 2,
    name: "Clean Water Initiative",
    logo: "/charity3.png",
    description:
      "Bring clean water to communities in need with your staked OBN.",
  },
];

// ✅ helper hook to read live data for a pool
function usePoolData(pid: number) {
  const { address } = useAccount();

  // read pool info (struct: [charityWallet, active, totalStaked, accRewardPerShare, lastRewardTime])
  const { data: poolData } = useReadContract({
    address: process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`,
    abi: stakingAbi,
    functionName: "pools",
    args: [pid],
  });

  const { disconnect } = useDisconnect();
// read user info (struct: [amount, rewardDebt, withTreasury])
  const { data: userData } = useReadContract({
    address: process.env.NEXT_PUBLIC_STAKING_CONTRACT as `0x${string}`,
    abi: stakingAbi,
    functionName: "userInfo",
    args: [pid, address as `0x${string}`],
    query: { enabled: !!address },
  });

  const totalStaked = poolData ? Number((poolData as any)[2]) / 1e18 : 0;
  const userStake = userData ? Number((userData as any)[0]) / 1e18 : 0;

  return { totalStaked, userStake };
}

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);

  return (
    <div className="relative min-h-screen bg-[#a9c7f9] flex flex-col">
      <div></div>

      {/* ✅ Main section is flex-grow with center alignment */}
      <main
        className="
          flex-1
          flex
          flex-col
          items-center
          justify-center
          pt-20
          pb-20
          px-4
        "
      >
        <h1 className="text-center text-3xl md:text-4xl font-extrabold mb-12">
          Start earning OBN rewards by staking OBN to one of the following pools:
        </h1>

        {/* ✅ Responsive grid */}
        <div
          className="
            grid
            gap-8
            w-full
            max-w-7xl
            grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]
            justify-items-center
          "
        >
          {pools.map((pool, index) => {
            console.log("pool.pid:", pool.pid, "index:", index);
            return (
            <PoolCard
              key={index}
              pid={pool.pid ?? index}
              logo={pool.logo}
              name={pool.name}
              description={pool.description}
            />
        );
        
    })}
        </div>
      </main><div className="fixed top-0 left-0 w-full z-50">
        <StatusBar />
      </div>

    </div>
  );
}