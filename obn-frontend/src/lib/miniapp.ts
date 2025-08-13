export type MiniAppSession = {
  fid: number;
  username?: string;
  displayName?: string;
};

type FarcasterUser = {
  fid?: number;
  username?: string;
  displayName?: string;
};

type FarcasterSession = {
  fid: number;
  username?: string;
  displayName?: string;
  user?: FarcasterUser;
};

type FarcasterBridge = {
  getSession?: () => Promise<FarcasterSession | undefined>;
  getUser?: () => Promise<FarcasterUser | undefined>;
  session?: FarcasterSession;
};

type FrameworkFarcaster = {
  farcaster?: {
    session?: FarcasterSession;
  };
};

type WindowMaybeFarcaster = Window & {
  farcaster?: FarcasterBridge;
  __FRAMEWORK?: FrameworkFarcaster;
};

export function isMiniAppRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as WindowMaybeFarcaster;
  return Boolean(w.farcaster || w.__FRAMEWORK?.farcaster);
}

/**
 * Try to read a Farcaster Mini App session (fid/username) if we're running
 * inside Warpcast’s Mini App webview. This is best-effort and safe to call
 * in any client component.
 */
export async function readMiniAppSession(): Promise<MiniAppSession | null> {
  if (typeof window === "undefined" || !isMiniAppRuntime()) return null;

  const w = window as WindowMaybeFarcaster;

  // 1) Newer bridges: farcaster.getSession()
  try {
    if (typeof w.farcaster?.getSession === "function") {
      const s = await w.farcaster.getSession();
      if (s && typeof s.fid === "number") {
        return {
          fid: s.fid,
          username: s.username ?? s.user?.username,
          displayName: s.displayName ?? s.user?.displayName,
        };
      }
    }
  } catch {
    /* noop */
  }

  // 2) Older bridges: farcaster.getUser()
  try {
    if (typeof w.farcaster?.getUser === "function") {
      const u = await w.farcaster.getUser();
      if (u && typeof u.fid === "number") {
        return {
          fid: u.fid,
          username: u.username,
          displayName: u.displayName,
        };
      }
    }
  } catch {
    /* noop */
  }

  // 3) Last resort: session-like object
  const maybe = w.farcaster?.session ?? w.__FRAMEWORK?.farcaster?.session;
  if (maybe && typeof maybe.fid === "number") {
    return {
      fid: maybe.fid,
      username: maybe.username,
      displayName: maybe.displayName,
    };
  }

  return null;
}

/** Tiny helper for an “Open in app” banner */
export function getMiniAppDeepLink(currentUrl: string): string {
  // Warpcast can open normal https links; return as-is.
  // If you later get a custom scheme, convert it here.
  return currentUrl;
}
