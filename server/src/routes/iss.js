import { Router } from 'express';

const router = Router();

// Primary feed: wheretheiss.at. Free, no key, served over HTTPS, and unlike
// Open Notify it reports the station's real altitude and velocity, so the
// dashboard can show measured numbers instead of a cited constant.
const PRIMARY_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

// Fallback feed: Open Notify. Position only (lat/lon/timestamp). Plain http
// on purpose: its HTTPS listener frequently refuses connections outright.
const FALLBACK_URL = 'http://api.open-notify.org/iss-now.json';

// Short in-memory cache so bursty polling from many open tabs never hammers
// either upstream. wheretheiss.at asks clients to stay near 1 request/sec.
const CACHE_MS = 4000;
let cache = null; // { expires, payload }

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchPrimary() {
  const response = await fetch(PRIMARY_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`wheretheiss.at responded ${response.status}`);
  const data = await response.json();

  const lat = finiteOrNull(data?.latitude);
  const lon = finiteOrNull(data?.longitude);
  if (lat === null || lon === null) throw new Error('wheretheiss.at returned a malformed position');

  const ts = finiteOrNull(data?.timestamp);
  return {
    lat,
    lon,
    timestampMs: ts !== null ? ts * 1000 : Date.now(),
    altitudeKm: finiteOrNull(data?.altitude),
    velocityKmh: finiteOrNull(data?.velocity),
    visibility: typeof data?.visibility === 'string' ? data.visibility : null,
    source: 'wheretheiss.at',
  };
}

async function fetchFallback() {
  const response = await fetch(FALLBACK_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Open Notify responded ${response.status}`);
  const data = await response.json();

  const lat = finiteOrNull(data?.iss_position?.latitude);
  const lon = finiteOrNull(data?.iss_position?.longitude);
  if (lat === null || lon === null) throw new Error('Open Notify returned a malformed position');

  const ts = finiteOrNull(data?.timestamp);
  return {
    lat,
    lon,
    timestampMs: ts !== null ? ts * 1000 : Date.now(),
    altitudeKm: null,
    velocityKmh: null,
    visibility: null,
    source: 'open-notify',
  };
}

router.get('/', async (_req, res) => {
  try {
    if (cache && cache.expires > Date.now()) {
      return res.json({ ...cache.payload, cached: true });
    }

    let position;
    try {
      position = await fetchPrimary();
    } catch (primaryErr) {
      console.error('[iss] wheretheiss.at failed, trying Open Notify:', primaryErr.message);
      position = await fetchFallback();
    }

    const payload = { position, fetchedAt: new Date().toISOString() };
    cache = { expires: Date.now() + CACHE_MS, payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[iss] failed:', err.message);
    res.status(502).json({ error: 'iss_unavailable', message: err.message });
  }
});

export default router;
