import { useEffect, useRef } from "react";

/**
 * Clears stuck loading states when a user returns to the browser after a failed
 * wallet handoff (e.g. MetaMask in X/Twitter in-app browser).
 *
 * If the tab was hidden while a transaction was in flight and the user comes back
 * after recoveryDelayMs, we assume the wallet handoff failed and clear the state.
 */
export function useMobileTxRecovery(
  isProcessing: boolean,
  clearProcessing: () => void,
  recoveryDelayMs = 10_000,
) {
  const clearRef = useRef(clearProcessing);
  clearRef.current = clearProcessing;

  const processingRef = useRef(isProcessing);
  processingRef.current = isProcessing;

  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const onHide = () => {
      if (processingRef.current) {
        hiddenAtRef.current = Date.now();
      }
    };

    const onShow = () => {
      if (hiddenAtRef.current !== null && processingRef.current) {
        const elapsed = Date.now() - hiddenAtRef.current;
        if (elapsed > recoveryDelayMs) {
          clearRef.current();
        }
      }
      hiddenAtRef.current = null;
    };

    const onVisChange = () => {
      if (document.hidden) onHide();
      else onShow();
    };

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, [recoveryDelayMs]);
}
