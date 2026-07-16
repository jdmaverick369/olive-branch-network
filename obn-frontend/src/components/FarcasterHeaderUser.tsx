// src/components/FarcasterHeaderUser.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";

type MiniAppUser = {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type Props = {
  onMiniAppDetected?: (isInMiniApp: boolean) => void;
};

export function FarcasterHeaderUser({ onMiniAppDetected }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<MiniAppUser | null>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(inMiniApp);
        onMiniAppDetected?.(inMiniApp);

        if (inMiniApp) {
          const context = await sdk.context;
          setUser(context.user);
        }
      } catch (e) {
        console.debug("Mini app context not available:", e);
      }
    };

    load();
  }, [onMiniAppDetected]);

  if (!isInMiniApp || !user) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/profile")}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
    >
      {user.pfpUrl && (
        <div className="flex items-center justify-center rounded-md p-0.5 border border-white/70 bg-white dark:border-white/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.pfpUrl}
            alt="Profile"
            className="h-5 w-5 rounded-full"
          />
        </div>
      )}
      <span className="text-sm text-white">
        {user.username ? `@${user.username}` : `FID ${user.fid}`}
      </span>
    </button>
  );
}
