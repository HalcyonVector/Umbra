# Umbra

**A live International Space Station tracker that tells you when you can see it with your own eyes.**

**Live demo:** [umbra-0nnj.onrender.com](https://umbra-0nnj.onrender.com/) (free hosting, so the first load after a quiet spell can take up to a minute)

Umbra shows where the ISS is right now on a real world map, who is on board, and when it will next pass over you bright enough to spot without a telescope. Each pass comes with a sky chart showing which direction to face, how high it climbs, and where it disappears.

## Features

### Live dashboard
- **Full-screen live map** (Leaflet with Esri Dark Gray Canvas tiles) with the station's position, the track it has already flown, a dotted preview of the next 3 hours, and the night side of Earth shaded in real time.
- **Follow mode** keeps the station centered. Drag the map and it lets go; one click brings it back.
- **Headline telemetry**: the country (or ocean) it is over, measured altitude and speed, whether the station is in sunlight or Earth's shadow, and progress through the current ~93 minute orbit.
- **Live feed status** in the header, so you always know if the data is fresh.

### Pass predictor
- Set your location with your device's location, a click on the map, or typed coordinates.
- See a countdown to the next visible pass, then a list of upcoming passes with date, time, length, peak height, rise direction, and a quality rating.
- A **polar sky chart** plots the pass across your sky from rise to set.
- A slider for the minimum elevation that counts, for horizons blocked by trees or buildings.
- A **best view on Earth right now** callout naming the country with the best viewing conditions at this moment.
- When nothing is visible in the next 24 hours, Umbra searches up to 10 days ahead for the next good one.

### Mission panel
- **People in space**: the current crew with role and agency, grouped by station, plus the ISS expedition number.
- **Session stats**: distance flown, orbits completed, sunrises and sunsets the crew has seen, and every country overflown since you opened the tab.
- Milestone notifications (first 1,000 km, 5 countries, and so on).

### Everywhere
- Responsive: a three-panel dashboard on desktop, a map plus tabs (Live map, Passes, Mission) on phones.
- Installable as a PWA, keeps the screen awake while open, and respects reduced-motion settings.
- The ground track you have seen is saved in your browser and redrawn on your next visit.

## How visibility works

The ISS has no lights you can see from the ground. You see it because it reflects sunlight, so three things must be true at once:

1. **It is above your horizon** by at least your chosen minimum elevation.
2. **The station is in sunlight.** From about 420 km up it keeps seeing the sun until the sun is roughly 20 degrees below the horizon beneath it. That is why passes happen after dusk and before dawn.
3. **Your sky is dark**, with the sun at least 6 degrees below your horizon (past civil twilight).

Umbra derives the orbit from consecutive live position fixes and the station's known inclination (51.6 degrees), propagates it forward, and checks these three conditions every few seconds of predicted time.

## Data sources

| Data | Primary | Fallback |
| --- | --- | --- |
| ISS position, altitude, speed | [wheretheiss.at](https://wheretheiss.at/w/developer) | [Open Notify](http://open-notify.org/) (position only) |
| Crew roster | [people-in-space](https://github.com/corquaid/international-space-station-APIs) | Open Notify `astros.json` |
| Map tiles | [Esri World Dark Gray Canvas](https://www.esri.com) (no key needed) | none |
| Country borders | [world-atlas](https://github.com/topojson/world-atlas) (bundled, offline) | none |

All are free and need no API key. The Express server proxies and caches the live feeds (4 seconds for position, 10 minutes for crew) so many open tabs never hammer the upstream services, and it switches to the fallback automatically if the primary is down.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite |
| Map | Leaflet with Esri Dark Gray Canvas tiles |
| Backend | Node.js, Express |
| Tests | Vitest, Supertest |
| Hosting | Render (blueprint in `render.yaml`) |

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run install:all
npm run dev
```

This starts the API on port 3003 and the Vite dev server on port 5275 (proxying `/api` to the API). Open http://localhost:5275.

### Tests

```bash
npm test
```

### Production build

```bash
npm run build
npm start
```

`npm start` serves both the API and the built client from one Express process on `PORT` (default 3003).

## Deploying to Render

The repo includes a `render.yaml` blueprint.

1. In Render, choose **New > Blueprint** and select this repository, or create a **Web Service** by hand with:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
2. Render sets `PORT` automatically. No other environment variables are needed.

Note that free Render instances sleep when idle, so the first load after a quiet period can take a few seconds.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/iss` | Current position, plus altitude, velocity, and sunlight state when the primary feed is up |
| GET | `/api/astros` | Everyone currently in space, with role and agency when available |
| GET | `/api/health` | Liveness check |

## Project structure

```
umbra/
├── client/
│   └── src/
│       ├── components/   # MapScene, TopBar, StatStrip, MissionPanel, PassPanel, SkyPlot, ...
│       ├── orbital/      # orbit derivation, propagation, solar geometry, visibility, country lookup
│       ├── inputs/       # ISS and crew feed hooks, screen wake lock
│       ├── lib/          # formatting, persistence, milestones
│       └── map/          # sky chart projection
├── server/
│   └── src/
│       ├── routes/       # iss.js, astros.js
│       └── app.js, index.js
└── render.yaml
```

## Limitations

Umbra is a hobby and learning project, not a scientific or safety tool.

- **Simplified orbit model.** Predictions assume a circular orbit at a fixed inclination, including the orbit plane's ~5 degree per day drift (J2 nodal precession) but not atmospheric drag. They are good for planning an evening of skywatching and get less precise a few days out. Use a TLE-based tool such as Heavens-Above or NASA's Spot the Station for exact times.
- **No refraction.** The sunlight and twilight calculations ignore atmospheric refraction, so times right at the edges can be off by a little.
- **Coarse borders.** "Currently over" uses simplified 110m-resolution country outlines, so it can be wrong near coastlines and borders.
- **Free upstream services.** The data feeds have no uptime guarantees. When both the primary and the fallback are down the header shows "Signal lost" and the app keeps propagating the last known orbit rather than inventing data.
- **Map tiles need a connection.** The basemap has no offline fallback.

## Ideas for later

- TLE/SGP4 propagation for precise multi-day predictions.
- Pass reminders via browser notifications.
- City search for setting your location.
- Brightness (magnitude) estimates for each pass.

## License

MIT. See [LICENSE](./LICENSE).
