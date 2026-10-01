// src/app/providers.tsx
"use client";

import { type ReactNode } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { AutoConnectWrapper } from "@/components/AutoConnectWrapper";
import { FarcasterConfigProvider } from "@/components/FarcasterConfigProvider";
import { MiniAppWalletProvider } from "@/components/MiniAppWalletProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <FarcasterConfigProvider>
      <RainbowKitProvider>
        <AutoConnectWrapper>
          <MiniAppWalletProvider>{children}</MiniAppWalletProvider>
        </AutoConnectWrapper>
      </RainbowKitProvider>
    </FarcasterConfigProvider>
  );
}
