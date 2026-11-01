import { useEffect, useRef, useState } from 'react';
import type { IssFeedResponse, IssPosition } from '../types';

const POLL_MS = 5000;

/**
 * Polls the server's ISS position proxy (GET /api/iss) on an interval. The
 * server caches for ~4s (see server/src/routes/iss.js), so this cadence is
 * matched to that. The caller is responsible for noticing when
 * `position.timestampMs` actually changed (a new sample) vs. a cached repeat.
 */
export function useIssFeed(pollMs: number = POLL_MS) {
  const [position, setPosition] = useState<IssPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [lastFixMs, setLastFixMs] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function poll() {
      try {
        const res = await fetch('/api/iss');
        if (!res.ok) throw new Error(`iss API responded ${res.status}`);
        const data: IssFeedResponse = await res.json();
        if (cancelledRef.current) return;
        setPosition(data.position);
        setError(null);
        setConsecutiveFailures(0);
        setLastFixMs(Date.now());
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : 'ISS feed fetch failed');
          setConsecutiveFailures((n) => n + 1);
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { position, error, loading, consecutiveFailures, lastFixMs };
}
