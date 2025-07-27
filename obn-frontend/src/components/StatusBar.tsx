"use client";

import { useAccount, useBalance, useDisconnect } from "wagmi";
import { formatEther } from "viem";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const OBN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OBN_TOKEN as `0x${string}`;

export function StatusBar() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  // Access Ethereum balance using wagmi
  const { data: ethBalanceData, refetch: refetchEth } = useBalance({ address });
  const { data: obnBalanceData, refetch: refetchObn } = useBalance({
    address,
    token: OBN_TOKEN_ADDRESS,
  });

  const [ethBalance, setEthBalance] = useState(0);
  const [obnBalance, setObnBalance] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateBalances = () => {
    if (ethBalanceData) setEthBalance(parseFloat(formatEther(ethBalanceData.value)));
    if (obnBalanceData) setObnBalance(parseFloat(formatEther(obnBalanceData.value)));
  };

  useEffect(() => {
    updateBalances();

    const interval = setInterval(async () => {
      await refetchEth();
      await refetchObn();
      updateBalances();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [ethBalanceData, obnBalanceData, address, refetchEth, refetchObn]);

  const handleDisconnect = () => {
    disconnect();
    router.push("/"); // Redirect to homepage
  };

  return (
    <div
      className="
        bg-base-200 text-foreground text-sm md:text-base
        p-3 md:p-4 flex flex-col items-center justify-center
        shadow-inner space-y-2
      "
    >
      <span className="font-medium">OBN Balance: {obnBalance.toFixed(2)}</span>
      <span className="font-medium">ETH Balance: {ethBalance.toFixed(4)}</span>

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
