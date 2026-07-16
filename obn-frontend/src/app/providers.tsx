// src/app/providers.tsx
"use client";

import { type ReactNode } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { OnchainKitProvider } from "@coinbase/onchainkit";

import { targetChain } from "@/wagmiConfig";
import { AutoConnectWrapper } from "@/components/AutoConnectWrapper";
import { FarcasterConfigProvider } from "@/components/FarcasterConfigProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <FarcasterConfigProvider>
      <OnchainKitProvider
        apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
        projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID}
        chain={targetChain}
      >
        <RainbowKitProvider>
          <AutoConnectWrapper>{children}</AutoConnectWrapper>
        </RainbowKitProvider>
      </OnchainKitProvider>
    </FarcasterConfigProvider>
  );
}
