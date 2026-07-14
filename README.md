# Umbra: A Suspended Generative Soundscape from the ISS's Real Orbit

A full-stack generative soundscape engine that composes and synthesizes sound **in real time, with no sample playback**: every drone layer, terminator swell, and telemetry beacon is built from oscillators, filters, and envelopes via the Web Audio API, continuously reshaped by the International Space Station's real live position from Open Notify. The same position drives a full-viewport animated world map — real cartography, a live day/night shading raster sampled directly from solar geometry, and a fading ground-track trail — the visual read-out of exactly what the audio engine is reacting to, not a themed skin bolted on afterward. Built with React, TypeScript, Tone.js, and Express — the third in a small family of sibling projects alongside [Petrichor](../Petrichor) (weather/time/activity → ambient music) and [Fault-Line](../Fault-Line) (global earthquake activity → tense drone), this one pushed out into orbit: suspended and weightless rather than cozy or tense.

> **What it's for:** a self-playing soundscape you leave running in a tab while you work, where the music's shape tracks something real happening 400km overhead — who's up there, whether they're currently over an ocean or a country, and whether they're about to watch a sunrise.

## Disclaimer

This project is for personal and educational use. It is **not a spaceflight tracking tool, a scientific instrument, or a safety-critical application of any kind**, and makes no claims to that effect. Open Notify's `iss-now.json` reports only latitude, longitude, and a timestamp — **altitude and orbital velocity are not part of that feed**; this project derives them from real orbital mechanics (the vis-viva equation, Kepler's third law) rather than inventing numbers, but they remain estimates layered on top of a hobby API with no uptime guarantee, not authoritative telemetry. "Currently over [country]" is a coarse point-in-polygon lookup against simplified 110m-resolution borders, not a precise geodetic claim. Generated audio is unbounded and probabilistic; volume and intensity can vary as real orbital events occur, so use your device's volume controls.

## Features

### Synthesis Engine (no samples)

- A bank of up to **six oscillator drone layers — one active voice per person currently in space** (Open Notify's `astros.json`), each a warm sine fundamental plus a soft `triangle6` overtone partial, continuously ramped in pitch, gain, and detune. Nothing is ever hard-cut or restarted; every parameter change is a multi-second `rampTo`.
- A slow four-stage modal chord progression (`audio/orbitalTheory.ts`) that completes once per real ISS orbit (~92.68 minutes), plus a continuous ±2.5-semitone "breathing" drift in the drone root on the same cycle — the piece has an actual musical arc tied to a real orbital period, not an arbitrary loop length.
- A **terminator-crossing swell**: a slow multi-second synth swell (not a click) fired the instant real solar geometry says the ISS just crossed from day into night or back — sunrise and sunset are voiced an octave apart.
- A **telemetry beacon**: a soft, brief ping fired exactly when a genuinely new position sample arrives from the server (not a cached repeat) — an audible heartbeat for the data feed itself.
- A long, spacious reverb tail that grows more diffuse over open ocean and tightens up over land — "grounded" is not just a metaphor here.

### Live Inputs

- **Live ISS position** — `GET /api/iss`, proxying and caching Open Notify's `iss-now.json`.
- **Live crew census** — `GET /api/astros`, proxying and caching Open Notify's `astros.json` (everyone currently in space, not filtered to the ISS specifically).
- **Derived altitude & orbital velocity** — Open Notify reports neither. Ground-track speed is computed from consecutive position fixes (haversine distance / elapsed time, with sanity guards against stale or teleporting samples); that ground speed is then scaled into true orbital velocity via the ratio of orbital radius to Earth's radius. Altitude uses a cited mean figure (408km) since deriving it live would require observing a full ~93-minute orbit.
- **The day/night terminator** — computed entirely offline from solar declination and the equation of time (no external sunrise/sunset API), giving a continuous solar-elevation value at the ISS's exact position and instant, not just a binary day/night flag.
- **"Currently over"** — an offline point-in-polygon lookup against `world-atlas`'s bundled 110m country borders, with a bounding-box fast-reject before the precise ray-casting test.

### Novel Mechanics

- **One real orbit, one musical cycle.** `orbital/orbitalMechanics.ts`'s `orbitalPhase()` maps wall-clock time onto a continuous 0..1 phase that wraps every 92.68 minutes — the ISS's real mean orbital period — and the chord progression and root drift are keyed directly off it. Leave it running for a full orbit and you hear a complete arc, not a repeating loop chosen for convenience.
- **A literal sonic census.** The number of drone voices audibly playing *is* the number of people in space right now (`orbital/crewCensus.ts`). When someone launches or lands, the texture actually thickens or thins.
- **Predicted, not just detected, terminator crossings.** `orbital/solarTerminator.ts`'s `predictNextCrossing()` walks the ground track forward from the current bearing and speed, sampling solar elevation, and returns an ETA and direction for the next sunrise or sunset — shown live in the Telemetry panel. The crossing swell itself fires from a continuously-ticking clock re-evaluating real solar geometry every second, independent of the ~5s network poll cadence — the event happens when astronomy says it happens, not when the feed happens to catch up.
- **A night mask sampled from physics, not drawn as a shape.** Rather than constructing an exact terminator polygon (fiddly across the antimeridian and the poles), `map/projection.ts`'s `computeNightMaskGrid()` independently classifies each cell of a coarse lat/lon grid via the same `isDaylight()` solar-elevation test the audio engine uses, painted as a soft blurred canvas overlay. The shading you see is the same computation shaping the sound, sampled at a different resolution.

### Session Capture

- **Recording** — the engine's live master bus is tapped into a `MediaStreamAudioDestinationNode` and recorded client-side with `MediaRecorder`; nothing is ever uploaded.
- **Screen Wake Lock** while playing, and **Media Session API** integration so the transport is controllable from the OS lock screen / notification shade.

### Backend

A thin Express layer exists purely to shield Open Notify from bursty client polling and to give the client a stable, same-origin API — not for CORS reasons. `GET /api/iss` caches for 4s (under the observed ~5s update cadence); `GET /api/astros` caches for 60s (crew manifests change on the order of days). Both return `cached: true/false` so the honesty is visible end-to-end, not just internal.

### Presets: Local-First

Presets snapshot the one tunable engine parameter — **terminator-crossing sensitivity** (how wide a solar-elevation band around 0° counts as "twilight," in degrees). Presets try the backend first and transparently fall back to `localStorage` on any failure, with an honest "offline · saved locally" badge when that happens.

### Sharing

The resolved crossing-sensitivity value encodes into a `?orbit=` query param (base64 JSON), decoded once on load and then stripped from the URL.

### PWA

Installable, hand-written `manifest.webmanifest` and a hand-written `sw.js` (stale-while-revalidate app shell; `/api/*` is explicitly never cached, so ISS position, crew census, and presets always hit the network).

### UI/UX: "Ground Track"

The background **is** the interface: a full-viewport world map whose land silhouette, live night shading, fading ground-track trail, and pulsing ISS marker are all computed directly from the real position feed and real solar geometry — the same inputs driving the synthesis engine, rendered instead of just logged. A brief radial glow, colored gold for sunrise or cool blue for sunset, pulses across the whole viewport exactly when a terminator crossing fires.

### Resilience & Accessibility

Top-level `ErrorBoundary`, a real `inert`-based focus trap for the Telemetry drawer, disambiguated `aria-label`s, a Space-bar transport shortcut, and `prefers-reduced-motion` respected for every animated element (the ISS pulse, the crossing glow, the onboarding hint).

## Data Source

[Open Notify](http://open-notify.org/) — a free, no-key hobby API providing real-time ISS position (`iss-now.json`) and current space-station occupancy (`astros.json`). It is **not an officially maintained or commercially supported service**: there is no published rate limit, no uptime SLA, and it has a documented history of intermittent downtime. This project treats it accordingly — short server-side caches, defensive parsing (rejecting malformed or non-finite coordinates rather than propagating `NaN`), and honest fallbacks throughout, rather than assuming every poll succeeds.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite |
| Audio | Tone.js (Web Audio API) |
| Cartography | `world-atlas` (bundled TopoJSON land + country borders) + `topojson-client` |
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

Builds the client and serves it, along with the API, from a single Express process.

### Tests

```bash
npm test
```

## Project Structure

```
umbra/
├── client/
│   └── src/
│       ├── audio/          # AudioEngine.ts (Tone.js graph) + orbitalTheory.ts (chord/color pure functions)
│       ├── orbital/         # pure orbital-mechanics/solar-geometry/geometry math + tests
│       ├── mapping/         # telemetry -> synthesis-params pure mapping + tests
│       ├── map/              # equirectangular projection, trail paths, night-mask grid + tests
│       ├── inputs/           # useIssFeed, useCrewFeed, useRecorder, useWakeLock, useMediaSession
│       ├── lib/               # clipboard, formatTime, localSettings, presetsStore, shareLink
│       └── components/        # MapScene, ControlPanel, StatusPanel, NowPlayingTray, ...
└── server/
    └── src/
        ├── routes/           # iss.js, astros.js, presets.js
        └── app.js, index.js
```

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/iss` | Current ISS position (cached ~4s) |
| GET | `/api/astros` | Current space-station crew census (cached ~60s) |
| GET | `/api/presets` | List saved presets |
| POST | `/api/presets` | Save/overwrite a preset (`{ name, params }`) |
| DELETE | `/api/presets/:name` | Delete a preset |
| GET | `/api/health` | Liveness check |

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3003` | Express server port |
| `PRESETS_DATA_FILE` | `server/data/presets.json` | Overridable path for the presets store (used by tests) |

## Architecture

```
Open Notify (iss-now.json, astros.json)
        │  (cached proxy, 4s / 60s TTL)
        ▼
   Express server ──/api/iss, /api/astros, /api/presets──▶ React client
                                                                 │
                          useIssFeed / useCrewFeed (poll)        │
                                                                 ▼
                    orbital/* pure math (ground speed, orbital speed,
                    solar elevation, terminator proximity, country lookup)
                                                                 │
                                                                 ▼
                          mapping/parameterMapping.ts (pure)
                                                                 │
                              ┌──────────────────────────────────┴───────────────────────┐
                              ▼                                                            ▼
                     audio/AudioEngine.ts (Tone.js)                          map/* + components/MapScene.tsx
                     drone / crossing swell / beacon                          land + night mask + trail + marker
```

## Testing

Every pure function in `orbital/`, `mapping/`, `map/`, `lib/`, and `audio/orbitalTheory.ts` has a matching Vitest suite, including boundary and physical-sanity assertions (e.g. `visVivaSpeedKmS` reproducing the ISS's real ~7.66km/s, `periodFromAltitudeMin` reproducing its real ~92.68-minute period, a synthetic point exactly a quarter-circumference from the subsolar point reading ~0° solar elevation). `AudioEngine.ts` and `MapScene.tsx` are deliberately excluded from unit coverage — a stateful Tone.js audio graph and a DOM+canvas+SVG animation are exercised by manual/browser testing rather than unit tests, the same testing philosophy as Petrichor and Fault-Line. The server's `routes/` are covered with Supertest against a mocked `fetch`, including the malformed-coordinate and upstream-failure paths.

## Honest Limitations

- **This is not a spaceflight-tracking or scientific instrument.** Nothing here should inform any real decision about the ISS, its crew, or its trajectory.
- **Open Notify has no documented rate limit or uptime SLA.** It is a free hobby project, not a maintained commercial API, and has a history of intermittent downtime. When it's unavailable, `/api/iss` and `/api/astros` return `502`s and the client shows "measuring…"/"counting…" rather than fabricating numbers.
- **Altitude is a cited constant, not a live measurement.** Open Notify doesn't report it. The real ISS altitude varies roughly 370–460km as atmospheric drag lowers the orbit between reboosts; this project uses a single representative ~408km figure throughout.
- **Orbital velocity is derived, with a known simplification.** Ground-track speed is scaled into orbital speed by the ratio of orbital radius to Earth's radius; this does not separately correct for Earth's own rotation (~0.46km/s at the equator, small but non-zero next to the ISS's ~7.66km/s). It's a physically-motivated estimate, not a precise ephemeris value.
- **`predictNextCrossing` assumes a locally linear ground track.** It walks forward at the ISS's current bearing and speed held constant. The real ground track curves continuously (orbital inclination + Earth's rotation), so the prediction is accurate close-in and fuzzier the further out it reaches — treat the ETA as an estimate, not a countdown clock.
- **The country lookup is coarse and antimeridian-naive.** `findCountryAt` uses `world-atlas`'s 110m-resolution borders (not sub-kilometer-accurate) and doesn't special-case countries whose bounding box wraps the ±180° seam (e.g. Fiji, far-eastern Russia) — a known, minor edge case, in the same spirit as Fault-Line's coarse rectangular tectonic-region boxes.
- **The night-mask shading is a sampled raster, not an exact terminator polygon.** A 120×60 grid, independently solar-elevation-tested per cell, gives a soft/blocky edge rather than a mathematically precise curve — a deliberate trade for robustness across poles and the antimeridian over visual precision.
- **The equation-of-time and declination formulas are low-order approximations** (NOAA's simplified forms), accurate to roughly a degree — plenty for an ~8° default terminator band, not observatory-grade ephemeris.
- **"Everyone in space" isn't ISS-only.** `astros.json` includes any currently-occupied station (historically also Tiangong), so the crew count driving drone layers isn't strictly "people aboard the ISS."
- **No polyphony pooling for rapid manual triggers.** Mashing the Simulate mode's "Trigger sunrise"/"Trigger sunset" buttons retriggers the same swell voice rather than layering independent ones.
- **The PWA icons aren't maskable-safe.** Tagged `purpose: "any"`, not `"maskable"`.
- React's `<StrictMode>` is intentionally omitted: its dev-mode double effect invocation tears down and rebuilds the live Tone.js audio graph mid-session.

## Suggested Future Features

- A proper terminator-polygon overlay (great-circle geometry, antimeridian-safe) as a sharper alternative to the sampled night mask.
- TLE-based propagation (e.g. SGP4) as an optional, more precise altitude/velocity source when a TLE feed is reachable, falling back to the current cited-constant approach otherwise.
- Per-crew-member timbral identity (name/craft hashed into a stable pitch offset) instead of uniform layers.
- A historical "pass log" of recent terminator crossings and which countries were overflown, downloadable alongside a recording.

## Author

Sagnik

## 📄 License

MIT License. See [LICENSE](./LICENSE). Free to use, modify, and distribute, with no warranty.
