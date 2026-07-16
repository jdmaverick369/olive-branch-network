const TX_TIMEOUT_MS = 60_000;

export function withTxTimeout<T>(promise: Promise<T>, ms = TX_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const msg = isXBrowser()
        ? "Wallet confirmation didn't complete. Try opening this page in Safari, Chrome, or the MetaMask browser."
        : "Transaction timed out. Open your wallet app and try again.";
      reject(new Error(msg));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export function isXBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Twitter|XClient/i.test(navigator.userAgent);
}

// Detects the specific X mobile post-preview WebView context where wallet
// connection is structurally broken (no opener, fresh isolated WebView, t.co referrer).
export function isBlockedWebView(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    isXBrowser() &&
    document.referrer.startsWith("https://t.co") &&
    window.history.length === 1 &&
    window.opener === null
  );
}
