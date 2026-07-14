import { Router } from 'express';

const router = Router();

// Everyone currently in space, not just aboard the ISS (Open Notify's
// astros.json also includes Tiangong crew, when occupied) — see the
// README's Honest Limitations section on this.
const ASTROS_URL = 'https://api.open-notify.org/astros.json';

// Crew manifests change on the order of days, not seconds — a long cache
// TTL is honest here, not just a rate-limit courtesy.
const CACHE_MS = 60_000;
let cache = null; // { expires, payload }

router.get('/', async (_req, res) => {
  try {
    if (cache && cache.expires > Date.now()) {
      return res.json({ ...cache.payload, cached: true });
    }

    const response = await fetch(ASTROS_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Open Notify responded ${response.status}`);
    const data = await response.json();

    const people = Array.isArray(data?.people)
      ? data.people.map((p) => ({ name: p.name ?? 'Unknown', craft: p.craft ?? 'Unknown' }))
      : [];

    const payload = {
      count: typeof data?.number === 'number' ? data.number : people.length,
      people,
      fetchedAt: new Date().toISOString(),
    };

    cache = { expires: Date.now() + CACHE_MS, payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[astros] failed:', err.message);
    res.status(502).json({ error: 'astros_unavailable', message: err.message });
  }
});

export default router;
