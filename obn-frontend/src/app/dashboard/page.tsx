"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import PoolCard from "@/components/PoolCard";
import { POOLS } from "@/lib/pools";

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);

  // Sort A→Z by name, then by pid (stable)
  const sortedPools = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    return [...POOLS].sort((a, b) => {
      const byName = collator.compare(a.name, b.name);
      return byName !== 0 ? byName : a.pid - b.pid;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex flex-col">
      <main className="px-4 py-8 flex flex-col items-center">
        <h1 className="text-center text-3xl md:text-4xl font-extrabold mb-6">
          Stake With Purpose
        </h1>

        <div className="w-full max-w-7xl grid gap-8 grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] justify-items-center">
          {sortedPools.map((pool) => (
            <PoolCard
              key={pool.pid}
              pid={pool.pid}
              logo={pool.logo}
              name={pool.name}
              description={pool.listDescription}
              live={pool.live}
            />
          ))}
        </div>
      </main>

      {/* Footer disclaimer */}
      <footer className="mt-auto py-4 text-center text-[11px] text-gray-500">
        Olive Branch Network is a decentralized protocol and does not have any direct
        affiliation with any of the organizations displayed.
      </footer>
    </div>
  );
}
