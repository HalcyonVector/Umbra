import { useEffect, useRef, useState } from 'react';
import type { AstrosFeedResponse, CrewMember } from '../types';

const POLL_MS = 5 * 60_000; // who's in space changes on the order of days, not seconds

/**
 * Polls the server's crew census (GET /api/astros). Deliberately slow: the
 * roster only changes when a crew launches or lands.
 */
export function useCrewFeed(pollMs: number = POLL_MS) {
  const [count, setCount] = useState<number | null>(null);
  const [people, setPeople] = useState<CrewMember[]>([]);
  const [expedition, setExpedition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function poll() {
      try {
        const res = await fetch('/api/astros');
        if (!res.ok) throw new Error(`astros API responded ${res.status}`);
        const data: AstrosFeedResponse = await res.json();
        if (cancelledRef.current) return;
        setCount(data.count);
        setPeople(data.people);
        setExpedition(data.expedition ?? null);
        setError(null);
      } catch (err) {
        if (!cancelledRef.current) setError(err instanceof Error ? err.message : 'astros feed fetch failed');
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { count, people, expedition, error };
}
