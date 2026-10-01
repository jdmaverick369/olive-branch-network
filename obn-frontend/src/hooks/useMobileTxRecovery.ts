import { useEffect, useRef } from "react";

/**
 * Rechecks a pending request after a mobile wallet handoff. Visibility and elapsed
 * time are never evidence of cancellation: only a confirmed terminal result can
 * clear the processing state.
 */
export function useMobileTxRecovery(
  isProcessing: boolean,
  clearProcessing: () => void,
  reconcile: () => Promise<boolean>,
  recoveryDelayMs = 10_000,
) {
  const clearRef = useRef(clearProcessing);
  const reconcileRef = useRef(reconcile);

  const processingRef = useRef(isProcessing);
  useEffect(() => {
    clearRef.current = clearProcessing;
    reconcileRef.current = reconcile;
    processingRef.current = isProcessing;
  }, [clearProcessing, reconcile, isProcessing]);

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
          void reconcileRef.current().then(terminal => {
            if (terminal) clearRef.current();
          }).catch(() => { /* Keep pending on RPC or wallet errors. */ });
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
