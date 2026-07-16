// Define a minimal type for window.farcaster
interface FarcasterWindow extends Window {
  farcaster?: {
    isMiniApp?: boolean;
    // add other fields if you need them later
  };
}

// Safe type guard for host detection
export const isFarcasterHost =
  typeof window !== "undefined" &&
  Boolean((window as FarcasterWindow).farcaster?.isMiniApp);
