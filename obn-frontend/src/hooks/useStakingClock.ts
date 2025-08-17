"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId } from "wagmi";

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
 */
export function useStakingClock({
  tokenId,
  isEquipped,
  totalStaked,
  tickMs = 1000,
}: {
  tokenId: string;
  isEquipped: boolean;
  totalStaked: bigint;
  tickMs?: number;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const storageKey = useMemo(
    () => (address ? key(chainId, address, tokenId) : ""),
    [chainId, address, tokenId]
  );

  const [accumulatedSec, setAccumulatedSec] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const lastTickRef = useRef<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!storageKey) return;
    const store = readStore(storageKey);
    setAccumulatedSec(store.accumulatedSec || 0);

    if (store.wasRunning && store.lastStartAt) {
      const now = Math.floor(Date.now() / 1000);
      const delta = Math.max(0, now - store.lastStartAt);
      const next = (store.accumulatedSec || 0) + delta;
      setAccumulatedSec(next);
      writeStore(storageKey, { accumulatedSec: next, wasRunning: true, lastStartAt: now });
    }
  }, [storageKey]);

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
