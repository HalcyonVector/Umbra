import { Router } from 'express';

const router = Router();

// Open Notify has no documented rate limit or update-cadence SLA — this is
// a hobby project's free API, not a maintained commercial one. Deliberately
// plain http, not https: Open Notify's HTTPS listener frequently refuses
// the connection outright (confirmed directly — https times out at the TCP
// level while http on the same host returns instantly), a known long-running
// issue with the service, not something a client-side fix can work around.
// Observed behavior when it's up is a fresh position roughly every ~5s. See
// the README's Honest Limitations section.
const ISS_URL = 'http://api.open-notify.org/iss-now.json';

// A second, independently-run, free, no-key ISS position API — used only
// when Open Notify is unreachable. Two hobby APIs being down at once is
// unlikely, so this turns "Open Notify is having an outage" from a dead app
// into a same-second failover instead.
const FALLBACK_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

// In-memory cache so bursty client polling never hammers either upstream. A
// 4s TTL sits comfortably under the observed ~5s update cadence.
const CACHE_MS = 4000;
let cache = null; // { expires, payload }

async function fetchOpenNotify() {
  const response = await fetch(ISS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Open Notify responded ${response.status}`);
  const data = await response.json();

  const lat = Number(data?.iss_position?.latitude);
  const lon = Number(data?.iss_position?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Open Notify returned a malformed position');
  }

  return { lat, lon, timestampMs: (data.timestamp ?? Math.floor(Date.now() / 1000)) * 1000, source: 'open-notify' };
}

async function fetchFallback() {
  const response = await fetch(FALLBACK_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`wheretheiss.at responded ${response.status}`);
  const data = await response.json();

  const lat = Number(data?.latitude);
  const lon = Number(data?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('wheretheiss.at returned a malformed position');
  }

  const timestampMs = Number.isFinite(Number(data?.timestamp)) ? Number(data.timestamp) * 1000 : Date.now();
  return { lat, lon, timestampMs, source: 'wheretheiss.at' };
}

router.get('/', async (_req, res) => {
  try {
    if (cache && cache.expires > Date.now()) {
      return res.json({ ...cache.payload, cached: true });
    }

    let position;
    try {
      position = await fetchOpenNotify();
    } catch (primaryErr) {
      console.error('[iss] open-notify failed, trying fallback:', primaryErr.message);
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
