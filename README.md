# Umbra: A Living Cartography of the ISS's Real Orbit

A full-stack visualization and prediction engine built entirely around the International Space Station's real, live position from Open Notify — no audio, no themed skin bolted on top. A full-viewport world map renders real cartography, a live day/night shading raster sampled directly from solar geometry, and a **ground-track trail that persists across visits**, slowly drawing the real interlocking weave pattern an orbit inclined at 51.6° traces as Earth rotates underneath it. Alongside the map, a from-scratch closed-form orbital propagator — derived from nothing but two consecutive position fixes — powers a genuinely predictive **"when can I see it from here?"** pass finder, using the actual astronomical condition that makes ISS passes visible (the station lit by the sun, your sky dark enough, both geometrically lined up), not a lookup table or a gimmick.

> **What it's for:** leave it open in a tab and the map itself becomes a slowly-accumulating piece of real cartography — evidence of an actual orbit, not a simulation — while Mission Control tells you exactly when to step outside and look up.

## Disclaimer

This project is for personal and educational use. It is **not a spaceflight-tracking tool, a scientific instrument, or a safety-critical application of any kind**, and makes no claims to that effect. Open Notify's `iss-now.json` reports only latitude, longitude, and a timestamp — **altitude, orbital velocity, inclination, and every prediction are derived** from that alone plus a couple of cited real-world constants, not looked up from an authoritative ephemeris. "Currently over [country]" is a coarse point-in-polygon lookup against simplified 110m-resolution borders. Every pass and crossing prediction assumes a circular, non-precessing orbit (see Honest Limitations) — treat the times shown as good estimates for planning an evening, not a launch.

## Features

### Living Cartography

- The ISS's real ground track **persists in your browser across sessions** (`lib/trailStore.ts`) — the longer you've had Umbra open (or come back to it), the more of the real interlocking weave pattern the map draws, capped at 24 hours / 4,000 points so it can't grow unbounded.
- A **live day/night shading raster**, independently sampled from solar-elevation geometry at every cell of a coarse lat/lon grid — not an approximated polygon, so it's correct straight through the poles and the antimeridian.
- A **dashed preview of where the ISS is headed next** (the following 3 hours), traced by the same orbital propagator that powers the predictions — past and future, both real math, rendered distinctly.
- **Export the current map as a PNG** at any time — a snapshot of your personal accumulated cartography, captured entirely client-side (nothing uploaded).

### A Real Orbital Propagator, Derived From One Fix

This is the novel core of the project. Open Notify gives you a single lat/lon/timestamp every ~5 seconds — nothing else. From two consecutive fixes (`orbital/groundTrackPropagator.ts`):

1. **Orbit determination**: given the ISS's real, cited inclination (51.6°) and orbital period, a single (lat, lon, direction-of-travel) fix is enough to solve — in closed form — for the satellite's argument of latitude and its Earth-fixed ascending-node longitude. This is genuine (if idealized) orbit determination, not a lookup.
2. **Propagation**: from those two elements, the sub-satellite point can be projected forward or backward *hours* at a time — correctly capturing the ground track's real curvature (inclination + Earth's rotation dragging the node westward), unlike a naive "current bearing and speed, held constant" extrapolation.

Every prediction in the app — upcoming terminator crossings, upcoming visible passes, orbit-progress percentage, the future-track preview — is built on this one propagator.

### "Can I See It Tonight?"

A real visibility calculation (`orbital/visibility.ts`), not a gimmick: the ISS is visible to the naked eye only when **it's high enough above your local horizon** (a spherical-Earth look-angle formula), **it's lit by the sun** (it has no lights of its own — this is why passes cluster around dawn/dusk, never local noon or local midnight), and **your own sky is dark enough** that a moving point of reflected sunlight would actually stand out. `orbital/eventPrediction.ts` walks the propagated ground track forward up to 24 hours, evaluates all three conditions at every step, and surfaces the next several passes with a start time, duration, and peak elevation — plus a full rise-to-set azimuth/elevation track, which the dock renders as a real polar sky-plot (`components/SkyPlot.tsx`): the same rise/peak/set chart amateur satellite trackers use to know which direction to physically point, not an illustration.

### Mission Dashboard

Live-updating altitude, ground speed, derived orbital velocity, an orbit-progress ring showing real position within the current ~92.68-minute orbit, current crew roster, and a running tally of sunrises/sunsets detected this session — each one fired the instant the continuously-recomputed solar geometry says it actually happened, not just reported after the fact by a network poll.

### Saved Locations & Sharing

Named viewing locations (home, a family member's address, wherever) save to the backend with a `localStorage` fallback and an honest "offline · saved locally" badge when the backend's unreachable. A location plus your elevation threshold encode into a shareable `?watch=` link.

### PWA

Installable, hand-written `manifest.webmanifest` and `sw.js` (stale-while-revalidate app shell; `/api/*` is explicitly never cached).

### UI/UX: "Instrument Console"

Not a media-player skin: a permanent three-pane console — a left telemetry rail, the map filling the center, a right predictor dock — modeled on real satellite-tracking instrumentation rather than an app-store aesthetic. A top status bar frames the whole thing (live-feed indicator, UTC clock, export). Flat opaque panels, hairline borders, Archivo for display type and IBM Plex Mono for every number (tabular numerals throughout), one phosphor-teal accent reserved for the chrome itself — amber and indigo are semantic, used only for day/night state, never decoration. The dock's polar sky-plot is the centerpiece: the same rise/peak/set chart real satellite-tracking software uses, plotted from a real predicted pass's azimuth/elevation track, not an illustration.

### Resilience & Accessibility

Top-level `ErrorBoundary`, disambiguated `aria-label`s throughout, a responsive single-column fallback below 860px, and `prefers-reduced-motion` respected for every animated element.

## Data Source

[Open Notify](http://open-notify.org/) — a free, no-key hobby API providing real-time ISS position (`iss-now.json`) and current space-station occupancy (`astros.json`). It is **not an officially maintained or commercially supported service**: there is no published rate limit, no uptime SLA, and it has a documented history of intermittent downtime. This project treats it accordingly — short server-side caches, defensive parsing (rejecting malformed or non-finite coordinates rather than propagating `NaN`), and honest fallbacks throughout.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite |
| Cartography | `world-atlas` (bundled TopoJSON land + country borders) + `topojson-client` |
| Type | Archivo (display), IBM Plex Sans (UI), IBM Plex Mono (all telemetry, tabular numerals) |
| Backend | Node.js, Express |
| Testing | Vitest (+ Supertest for the API) |
| Orchestration | `concurrently` + `cross-env` for the dev workflow |

## Prerequisites

- Node.js 18+ (native `fetch` and `AbortSignal.timeout` are used server-side)
- npm

## Quick Start

```bash
npm run install:all
npm run dev
```

This starts the Express API on port **3003** and the Vite dev server on port **5275** (proxying `/api` to the server), so it can run side-by-side with Petrichor (3001/5273) and Fault-Line (3002/5274).

### Production

```bash
npm run build
npm start
```

### Tests

```bash
npm test
```

## Project Structure

```
umbra/
├── client/
│   └── src/
│       ├── orbital/          # pure orbital-mechanics/solar-geometry/propagator/visibility math + tests
│       ├── map/               # equirectangular projection, trail paths, night-mask grid + tests
│       ├── inputs/            # useIssFeed, useCrewFeed, useWakeLock
│       ├── lib/                # clipboard, formatTime, localSettings, presetsStore, shareLink, trailStore, exportMap
│       └── components/         # MapScene, TelemetryRail, PredictorDock, SkyPlot, TopBar, ...
└── server/
    └── src/
        ├── routes/            # iss.js, astros.js, presets.js
        └── app.js, index.js
```

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/iss` | Current ISS position (cached ~4s) |
| GET | `/api/astros` | Current space-station crew census (cached ~60s) |
| GET | `/api/presets` | List saved observer locations |
| POST | `/api/presets` | Save/overwrite a location (`{ name, params: { lat, lon } }`) |
| DELETE | `/api/presets/:name` | Delete a saved location |
| GET | `/api/health` | Liveness check |

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3003` | Express server port |
| `PRESETS_DATA_FILE` | `server/data/presets.json` | Overridable path for the saved-locations store (used by tests) |

## Architecture

```
Open Notify (iss-now.json, astros.json)
        │  (cached proxy, 4s / 60s TTL)
        ▼
   Express server ──/api/iss, /api/astros, /api/presets──▶ React client
                                                                 │
                          useIssFeed / useCrewFeed (poll)        │
                                                                 ▼
                  orbital/groundTrack.ts (speed/bearing from 2 fixes)
                                                                 │
                                                                 ▼
             orbital/groundTrackPropagator.ts (derive + propagate orbit)
                                                                 │
                              ┌──────────────────────────────────┴───────────────────────┐
                              ▼                                                            ▼
              orbital/eventPrediction.ts (crossings, passes)                map/* + components/MapScene.tsx
              orbital/visibility.ts (look-angle, sunlit, darkness)          land + night mask + trail + marker
                              │
                              ▼
                 components/TelemetryRail.tsx, PredictorDock.tsx (+ SkyPlot.tsx)
```

## Testing

Every pure function in `orbital/`, `map/`, and `lib/` has a matching Vitest suite, including physical-sanity and round-trip assertions: `visVivaSpeedKmS` reproduces the ISS's real ~7.66km/s, `periodFromAltitudeMin` reproduces its real ~92.68-minute period, `propagateSubSatellitePoint` never exceeds ±inclination and reaches exactly the inclination at the orbit's peak latitude, `deriveOrbitalElements` correctly recovers a known ground truth over a 6-hour horizon from a single seed fix, and `evaluateVisibility`/`predictVisiblePasses` are tested against geometrically-engineered scenarios (a satellite placed exactly on the terminator, an observer placed exactly past civil twilight) rather than hoping a real pass happens to exist on a given date. `MapScene.tsx` is deliberately excluded from unit coverage — a DOM+canvas+SVG animation is exercised by manual/browser testing rather than unit tests, the same testing philosophy as Petrichor and Fault-Line. The server's `routes/` are covered with Supertest against a mocked `fetch`, including the malformed-coordinate and upstream-failure paths.

## Honest Limitations

- **This is not a spaceflight-tracking or scientific instrument.** Nothing here should inform any real decision about the ISS, its crew, or its trajectory.
- **Open Notify has no documented rate limit or uptime SLA.** It's a free hobby project with a history of intermittent downtime. When it's unavailable, `/api/iss` and `/api/astros` return `502`s and the UI shows "measuring…"/"gathering telemetry…" rather than fabricating numbers — and since the whole predictor is built on derived orbital elements, an extended outage means no new predictions until it recovers (the persisted trail and previously-derived predictions don't silently keep counting as if nothing happened, either — they age out honestly).
- **The orbital propagator assumes a circular, non-precessing orbit at a fixed cited inclination (51.6°) and period (~92.68min).** It deliberately does not model atmospheric drag (the ISS's real altitude and period slowly decay between reboosts), J2 nodal precession (~-5deg/day for the ISS — small next to the ~360deg/day Earth-rotation term this app does model, but not zero), or orbital eccentricity. Predictions are accurate over the windows shown (hours), not week-scale.
- **Altitude is a cited constant, not a live measurement.** Open Notify doesn't report it; the real ISS altitude varies roughly 370–460km between reboosts.
- **Orbital velocity is derived**, scaled from ground-track speed by the ratio of orbital to Earth radius; this doesn't separately correct for Earth's own rotation (~0.46km/s at the equator, small next to the ISS's ~7.66km/s).
- **The equation-of-time and solar-declination formulas are low-order approximations** (NOAA's simplified forms), accurate to roughly a degree — not observatory-grade ephemeris, but plenty for a twilight/visibility threshold.
- **The country lookup is coarse and antimeridian-naive**, using `world-atlas`'s 110m-resolution borders without special-casing countries whose bounding box wraps the ±180° seam.
- **The night-mask shading is a sampled raster** (a 120×60 grid, independently solar-elevation-tested per cell), giving a soft/blocky edge rather than a mathematically exact terminator curve — a deliberate trade for robustness across the poles and the antimeridian.
- **"Everyone in space" isn't ISS-only.** `astros.json` includes any currently-occupied station (historically also Tiangong).
- **No two orbital elements are ever cross-validated against each other** — each derivation trusts its most recent 2-fix pair; a single corrupted-but-plausible pair of Open Notify samples could seed a bad prediction for a few minutes until the next fix corrects it.
- **The PWA icons aren't maskable-safe.** Tagged `purpose: "any"`, not `"maskable"`.
- **The PNG export approximates the night mask's CSS blur/blend-mode** with a canvas filter rather than reproducing them exactly; the exported image is a close but not pixel-identical match to the live view.

## Suggested Future Features

- TLE-based propagation (e.g. SGP4) as an optional, more precise source when a TLE feed is reachable, falling back to the current derived-from-scratch propagator otherwise.
- J2 nodal-precession correction for multi-day-ahead predictions.
- A downloadable log of actually-observed (not just predicted) passes and crossings, timestamped against your saved locations.
- Per-country "time spent overhead" statistics accumulated from the persisted trail.

## Author

Sagnik

## 📄 License

MIT License. See [LICENSE](./LICENSE). Free to use, modify, and distribute, with no warranty.
