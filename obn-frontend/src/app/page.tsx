"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (isConnected) {
      router.push("/dashboard");
    }
  }, [isConnected, router]);

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-base-100 px-4 text-center">
      {/* 🌱 Header */}
      <h1
        className="
          text-[clamp(2.5rem,8vw,4rem)]
          font-extrabold
          flex flex-wrap justify-center items-center gap-3
          mb-6
        "
      >
        <span
          className="inline-block animate-bounce"
          style={{ animationDuration: "2s" }}
        >
          🌱
        </span>
        Olive Branch Network
      </h1>

      {/* 📄 Description + Button */}
      <div className="flex flex-col items-center gap-y-8 max-w-md">
        <p className="text-lg md:text-xl">
          A decentralized staking protocol designed to support those in need.
        </p>
        <ConnectButton />
      </div>
    </main>
  );
}