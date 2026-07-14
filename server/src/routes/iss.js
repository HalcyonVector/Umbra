import { Router } from 'express';

const router = Router();

// Open Notify has no documented rate limit or update-cadence SLA — this is
// a hobby project's free API, not a maintained commercial one, and it has a
// history of intermittent downtime. Observed behavior is a fresh position
// roughly every ~5s. See the README's Honest Limitations section.
const ISS_URL = 'https://api.open-notify.org/iss-now.json';

// In-memory cache so bursty client polling never hammers Open Notify. A 4s
// TTL sits comfortably under the observed ~5s update cadence.
const CACHE_MS = 4000;
let cache = null; // { expires, payload }

router.get('/', async (_req, res) => {
  try {
    if (cache && cache.expires > Date.now()) {
      return res.json({ ...cache.payload, cached: true });
    }

    const response = await fetch(ISS_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Open Notify responded ${response.status}`);
    const data = await response.json();

    const lat = Number(data?.iss_position?.latitude);
    const lon = Number(data?.iss_position?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Open Notify returned a malformed position');
    }

    const payload = {
      position: { lat, lon, timestampMs: (data.timestamp ?? Math.floor(Date.now() / 1000)) * 1000 },
      fetchedAt: new Date().toISOString(),
    };

    cache = { expires: Date.now() + CACHE_MS, payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[iss] failed:', err.message);
    res.status(502).json({ error: 'iss_unavailable', message: err.message });
  }
});

export default router;
