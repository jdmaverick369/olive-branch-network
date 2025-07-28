"use client"; // This directive ensures that the component is treated as a client component

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import PoolCard from "@/components/PoolCard";
import { StatusBar } from "@/components/StatusBar";

const pools = [
  {
    pid: 0,
    name: "Treasury Pool (LIVE)",
    logo: "/charity1.png",
    description:
      "Until we onboard charities, stake OBN to support the Olive Branch Network treasury. 80% of rewards go to users, 20% to the treasury. Treasury funds will be used for growth and development. This pool will be removed once the first charity is onboarded.",
    live: true, // 🆕 pool is live
  },
  {
    pid: 1,
    name: "Example Charity Pool (NOT LIVE)",
    logo: "/charity2.png",
    description:
      "Once we onboard charties, the reward structure will be 80% to the user, 15% to the charity, and 5% to the treasury (adjustable later from 1-5% when DAO is implemented, in which the user receives what the treasury does not).",
    live: false, // 🆕 pool is not live yet
  },
];

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) router.push("/"); // Redirect to homepage if not connected
  }, [isConnected, router]);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex flex-col">
      {/* ✅ Fixed top header */}
      <div className="fixed top-0 left-0 w-full bg-green-700 text-white py-3 text-center font-bold text-xl shadow-md z-50">
        🌱 Olive Branch Network
      </div>

      {/* Spacer so content doesn't hide behind header */}
      <div className="pt-16"></div>

      {/* ✅ Scrollable main content */}
      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <h1 className="text-center text-3xl md:text-4xl font-extrabold mb-6">
          Start earning rewards by staking OBN to one of the following pools:
        </h1>

        <div className="w-full max-w-7xl grid gap-8 grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] justify-items-center">
          {pools.map((pool, index) => (
            <PoolCard
              key={index}
              pid={pool.pid ?? index}
              logo={pool.logo}
              name={pool.name}
              description={pool.description}
              live={pool.live}
            />
          ))}
        </div>
      </main>

      {/* Spacer so last pool card isn’t hidden by StatusBar */}
      <div className="h-24"></div>

      {/* ✅ Fixed bottom StatusBar */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <StatusBar />
      </div>
    </div>
  );
}
