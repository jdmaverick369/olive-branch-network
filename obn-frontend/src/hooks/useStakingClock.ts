"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChainId } from "wagmi";

type ClockStorage = {
  accumulatedSec: number;
  lastStartAt?: number; // epoch seconds
  wasRunning?: boolean;
};

function key(chainId: number, addr: string, tokenId: string) {
  return `obn:clock:${chainId}:${addr.toLowerCase()}:${tokenId}`;
}

function readStore(k: string): ClockStorage {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return { accumulatedSec: 0 };
    return JSON.parse(raw);
  } catch {
    return { accumulatedSec: 0 };
  }
}

function writeStore(k: string, v: ClockStorage) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

/**
 * Accumulates time ONLY while (isEquipped && totalStaked > 0).
 * Pauses at totalStaked == 0; resumes on stake again.
 * Persists by (chainId, wallet, tokenId).
 *
 * XP Recovery: If localStorage is wiped, uses onChainElapsedSec as authoritative baseline.
 * Merges local and on-chain data: max(localStorage, onChainElapsedSec).
 *
 * @param onChainElapsedSec - Total staking seconds from contract's stakeElapsed(user).
 *                            Used to recover XP if localStorage is missing or behind.
 */
export function useStakingClock({
  tokenId,
  isEquipped,
  totalStaked,
  tickMs = 1000,
  walletAddress,
  onChainElapsedSec = 0,
}: {
  tokenId: string;
  isEquipped: boolean;
  totalStaked: bigint;
  tickMs?: number;
  walletAddress?: string | null;
  onChainElapsedSec?: number;
}) {
  const chainId = useChainId();

  const effectiveAddress = walletAddress ?? "";

  const storageKey = useMemo(
    () => (effectiveAddress ? key(chainId, effectiveAddress, tokenId) : ""),
    [chainId, effectiveAddress, tokenId]
  );

  const [accumulatedSec, setAccumulatedSec] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const lastTickRef = useRef<number>(Math.floor(Date.now() / 1000));

  // Initialize from localStorage or on-chain fallback
  useEffect(() => {
    if (!storageKey) return;
    const store = readStore(storageKey);
    const now = Math.floor(Date.now() / 1000);
    const shouldRun = Boolean(isEquipped && totalStaked > 0n);

    // Merge localStorage and on-chain data: use whichever is higher
    const localSec = store.accumulatedSec || 0;
    const chainSec = onChainElapsedSec || 0;

    // If on-chain has more history than local, recover from chain
    let initialSec = localSec;
    if (chainSec > localSec) {
      initialSec = chainSec;
      console.debug("🔄 Recovering XP from on-chain stakeElapsed:", {
        localStorage: localSec,
        onChain: chainSec,
        recovered: chainSec,
        recoveredDays: (chainSec / 86400).toFixed(2)
      });
    }

    setAccumulatedSec(initialSec);

    // Resume from previous running state if applicable
    if (store.wasRunning && store.lastStartAt) {
      const delta = Math.max(0, now - store.lastStartAt);
      const next = initialSec + delta;
      setAccumulatedSec(next);
      writeStore(storageKey, { accumulatedSec: next, wasRunning: true, lastStartAt: now });
    } else {
      // Fresh initialization - write merged value to localStorage
      writeStore(storageKey, {
        accumulatedSec: initialSec,
        wasRunning: shouldRun,
        lastStartAt: shouldRun ? now : undefined,
      });
    }
  }, [storageKey, onChainElapsedSec, isEquipped, totalStaked]);

  const shouldRun = Boolean(isEquipped && totalStaked > 0n);

  useEffect(() => {
    if (!storageKey) return;
    const now = Math.floor(Date.now() / 1000);
    const store = readStore(storageKey);

    if (shouldRun && !running) {
      lastTickRef.current = now;
      writeStore(storageKey, { accumulatedSec: store.accumulatedSec || 0, wasRunning: true, lastStartAt: now });
      setRunning(true);
    } else if (!shouldRun && running) {
      const delta = Math.max(0, now - lastTickRef.current);
      const next = (store.accumulatedSec || 0) + delta;
      writeStore(storageKey, { accumulatedSec: next, wasRunning: false, lastStartAt: undefined });
      setAccumulatedSec(next);
      setRunning(false);
    }
  }, [shouldRun, running, storageKey]);

  useEffect(() => {
    if (!running || !storageKey) return;
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const delta = Math.max(0, now - lastTickRef.current);
      if (delta > 0) {
        lastTickRef.current = now;
        setAccumulatedSec((s) => {
          const next = s + delta;
          writeStore(storageKey, { accumulatedSec: next, wasRunning: true, lastStartAt: now });
          return next;
        });
      }
    }, tickMs);
    return () => clearInterval(timer);
  }, [running, storageKey, tickMs]);

  const reset = () => {
    if (!storageKey) return;
    const now = Math.floor(Date.now() / 1000);
    const runningNow = shouldRun;
    writeStore(storageKey, {
      accumulatedSec: 0,
      wasRunning: runningNow,
      lastStartAt: runningNow ? now : undefined,
    });
    setAccumulatedSec(0);
    lastTickRef.current = now;
    setRunning(runningNow);
  };

  return { accumulatedSec, running, reset };
}
