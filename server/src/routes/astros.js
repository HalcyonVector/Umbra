import { Router } from 'express';

const router = Router();

// Primary: a community-maintained "people in space" feed that includes each
// person's agency, role, and country, which lets the dashboard show a real
// crew roster instead of a row of anonymous dots.
const PRIMARY_URL = 'https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json';

// Fallback: Open Notify's census (name + craft only). Plain http on purpose,
// see routes/iss.js.
const FALLBACK_URL = 'http://api.open-notify.org/astros.json';

// Crew manifests change on the order of days, not seconds.
const CACHE_MS = 10 * 60_000;
let cache = null; // { expires, payload }

function str(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function fetchPrimary() {
  const response = await fetch(PRIMARY_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`people-in-space responded ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data?.people)) throw new Error('people-in-space returned no roster');

  const people = data.people.map((p) => ({
    name: str(p?.name) ?? 'Unknown',
    craft: str(p?.spacecraft) ?? str(p?.craft) ?? (p?.iss ? 'ISS' : 'Unknown'),
    agency: str(p?.agency),
    role: str(p?.position),
    country: str(p?.country),
  }));

  return {
    count: typeof data?.number === 'number' ? data.number : people.length,
    expedition: typeof data?.iss_expedition === 'number' ? data.iss_expedition : null,
    people,
    source: 'people-in-space',
  };
}

async function fetchFallback() {
  const response = await fetch(FALLBACK_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Open Notify responded ${response.status}`);
  const data = await response.json();

  const people = Array.isArray(data?.people)
    ? data.people.map((p) => ({
        name: str(p?.name) ?? 'Unknown',
        craft: str(p?.craft) ?? 'Unknown',
        agency: null,
        role: null,
        country: null,
      }))
    : [];

  return {
    count: typeof data?.number === 'number' ? data.number : people.length,
    expedition: null,
    people,
    source: 'open-notify',
  };
}

router.get('/', async (_req, res) => {
  try {
    if (cache && cache.expires > Date.now()) {
      return res.json({ ...cache.payload, cached: true });
    }

    let census;
    try {
      census = await fetchPrimary();
    } catch (primaryErr) {
      console.error('[astros] people-in-space failed, trying Open Notify:', primaryErr.message);
      census = await fetchFallback();
    }

    const payload = { ...census, fetchedAt: new Date().toISOString() };
    cache = { expires: Date.now() + CACHE_MS, payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[astros] failed:', err.message);
    res.status(502).json({ error: 'astros_unavailable', message: err.message });
  }
});

export default router;
