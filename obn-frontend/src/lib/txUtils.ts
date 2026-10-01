const TX_TIMEOUT_MS = 60_000;

export function withTxTimeout<T>(promise: Promise<T>, ms = TX_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const msg = isXBrowser()
        ? "Wallet confirmation is unresolved. Open your wallet to check the request; do not submit it again."
        : "Confirmation is taking longer than expected. Check the pending transaction status before trying again.";
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
