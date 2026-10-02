// Other wallets' in-app browsers and extensions often also claim isCoinbaseWallet for compatibility.
const OTHER_WALLET_FLAGS = [
  "isRainbow", "isTrust", "isTrustWallet", "isPhantom", "isOkxWallet", "isOKExWallet", "isRabby", "isZerion",
  "isBraveWallet", "isTokenPocket", "isBitKeep", "isExodus", "isCoin98", "isSafePal", "isMEWwallet", "isImToken",
] as const;

/**
 * Only the in-app browser of the Coinbase Wallet (Base) mobile app, the way Coinbase's own SDK detects
 * it (isCoinbaseBrowser). isCoinbaseWallet alone isn't enough: the desktop extension sets it, and so do
 * other wallets' in-app browsers (e.g. Rainbow) for compatibility.
 */
export function isCoinbaseWalletBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ethereum = (window as { ethereum?: Record<string, unknown> }).ethereum;
  if (!ethereum || ethereum.isCoinbaseBrowser !== true) return false;
  return !OTHER_WALLET_FLAGS.some((flag) => ethereum[flag]);
}
