import { useEffect, useState } from 'react';

// Phase values come back from /api as numbers
type Phase = {
  start: number; // unix seconds
  end: number;   // unix seconds
  bps: number;   // contract (gross) BPS
  contractPct: number;
  stakerPct: number;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPhaseApi(x: unknown): x is Phase {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  return isFiniteNumber(obj.start) &&
    isFiniteNumber(obj.end) &&
    isFiniteNumber(obj.bps) &&
    isFiniteNumber(obj.contractPct) &&
    isFiniteNumber(obj.stakerPct);
}

export function useStakingPhase() {
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [daysUntilNext, setDaysUntilNext] = useState<number>(0);
  const [phases, setPhases] = useState<Phase[]>([]);

  // Fetch all 5 phases in one request (multicall on the server)
  useEffect(() => {
    let cancelled = false;

    async function fetchPhases() {
      try {
        const raw: unknown = await fetch('/api/phases', { cache: 'no-store' }).then((r) => r.json());

        if (!Array.isArray(raw)) return;

        const normalized: Phase[] = raw.map((p) =>
          isPhaseApi(p)
            ? p
            : { start: 0, end: 0, bps: 0, contractPct: 0, stakerPct: 0 }
        );

        if (!cancelled) setPhases(normalized);
      } catch {
        // swallow; UI will simply not show phase data if fetch fails
      }
    }

    fetchPhases();

    // Optional refresh every 5 minutes
    const t = setInterval(fetchPhases, 300_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Update current phase and countdown using NUMBER math
  useEffect(() => {
    if (phases.length === 0) return;

    const updatePhaseInfo = () => {
      const now = Math.floor(Date.now() / 1000); // seconds
      const idx = phases.findIndex((ph) => now >= ph.start && now < ph.end);

      if (idx >= 0) {
        setCurrentPhase(idx);
        const secondsLeft = Math.max(0, phases[idx].end - now);
        const daysLeft = Math.ceil(secondsLeft / 86_400);
        setDaysUntilNext(daysLeft);
      }
    };

    updatePhaseInfo();
    const t = setInterval(updatePhaseInfo, 60_000);
    return () => clearInterval(t);
  }, [phases]);

  return {
    currentPhase,
    daysUntilNext,
    phaseBps: phases[currentPhase]?.bps, // number (contract/gross BPS for current phase)
    contractPct: phases[currentPhase]?.contractPct,
    stakerPct: phases[currentPhase]?.stakerPct,
  };
}
