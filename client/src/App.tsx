import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldCountries from 'world-atlas/countries-110m.json';
import { useIssFeed } from './inputs/useIssFeed';
import { useCrewFeed } from './inputs/useCrewFeed';
import { useWakeLock } from './inputs/useWakeLock';
import { solarElevationDeg } from './orbital/solarTerminator';
import { ISS_MEAN_ALTITUDE_KM, orbitalPhase as fallbackOrbitalPhase, groundSpeedToOrbitalSpeedKmS } from './orbital/orbitalMechanics';
import { computeGroundSpeedKmh, computeBearingDeg, pruneTrail, type TrackPoint } from './orbital/groundTrack';
import { findCountryAt, computeBBox, type CountryFeature, type CountryGeometry } from './orbital/countryLookup';
import { deriveOrbitalElements, propagateSubSatellitePoint, orbitalPhaseAt, type OrbitalElements } from './orbital/groundTrackPropagator';
import { predictTerminatorCrossings, predictVisiblePasses } from './orbital/eventPrediction';
import { loadTrail, saveTrail } from './lib/trailStore';
import { listLocations, saveLocation, deleteLocation, type LocationSource } from './lib/presetsStore';
import { buildShareUrl, readShareParamsFromLocation } from './lib/shareLink';
import { copyToClipboard } from './lib/clipboard';
import { exportMapAsPng } from './lib/exportMap';
import {
  hasSeenOnboarding, loadStoredMinElevation, loadStoredObserver, markOnboardingSeen,
  saveStoredMinElevation, saveStoredObserver,
} from './lib/localSettings';
import { MapScene } from './components/MapScene';
import { StatusTray } from './components/StatusTray';
import { OnboardingHint } from './components/OnboardingHint';
import { MissionDashboard } from './components/MissionDashboard';
import { PassPredictor, type GeolocationStatus } from './components/PassPredictor';
import type { LocationPreset, OrbitalTelemetry, SolarState } from './types';
import './App.css';

const TRAIL_RETENTION_MS = 24 * 60 * 60_000;
const CROSSING_WINDOW_MS = 6 * 60 * 60_000;
const PASS_WINDOW_MS = 24 * 60 * 60_000;
const PREDICTED_TRAIL_HORIZON_MS = 3 * 60 * 60_000;
const PREDICTED_TRAIL_STEP_MS = 2 * 60_000;
const TWILIGHT_BAND_DEG = 8;

function resolveSolarState(isDaylight: boolean, elevationDeg: number): SolarState {
  if (Math.abs(elevationDeg) < TWILIGHT_BAND_DEG) return 'twilight';
  return isDaylight ? 'day' : 'night';
}

export default function App() {
  const mainRegionRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerHasMounted = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const nightCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevPositionRef = useRef<TrackPoint | null>(null);
  const prevDaylightRef = useRef<boolean | null>(null);

  const [observer, setObserverState] = useState<{ lat: number; lon: number } | null>(() => loadStoredObserver());
  const [minElevationDeg, setMinElevationDeg] = useState(() => loadStoredMinElevation(10));
  const [geolocationStatus, setGeolocationStatus] = useState<GeolocationStatus>('idle');
  const [locations, setLocations] = useState<LocationPreset[]>([]);
  const [locationsSource, setLocationsSource] = useState<LocationSource>('server');
  const [locationName, setLocationName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [trail, setTrail] = useState<TrackPoint[]>(() => loadTrail());
  const [groundSpeedKmh, setGroundSpeedKmh] = useState<number | null>(null);
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);
  const [orbitalElements, setOrbitalElements] = useState<OrbitalElements | null>(null);
  const [crossingPulse, setCrossingPulse] = useState<{ key: number; direction: 'sunrise' | 'sunset' } | null>(null);
  const [sunriseCount, setSunriseCount] = useState(0);
  const [sunsetCount, setSunsetCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    markOnboardingSeen();
  };

  // Leave-it-open-and-watch is the whole point here, so the wake lock is unconditional.
  useWakeLock(true);

  useEffect(() => {
    const shared = readShareParamsFromLocation();
    if (shared) {
      const loc = { lat: shared.lat, lon: shared.lon };
      setObserverState(loc);
      saveStoredObserver(loc);
      setMinElevationDeg(shared.minElevationDeg);
      saveStoredMinElevation(shared.minElevationDeg);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (mainRegionRef.current) mainRegionRef.current.inert = drawerOpen;
    if (drawerRef.current) drawerRef.current.inert = !drawerOpen;

    if (!drawerHasMounted.current) {
      drawerHasMounted.current = true;
      return;
    }
    if (drawerOpen) drawerCloseRef.current?.focus();
    else drawerToggleRef.current?.focus();
  }, [drawerOpen]);

  // Ticks once a second so solar elevation, orbit progress, and countdowns
  // all keep advancing smoothly between the ~5s ISS position polls.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { position: livePosition } = useIssFeed();
  const { count: crewFeedCount, people } = useCrewFeed();

  // world-atlas ships pre-built TopoJSON country polygons (ISC-licensed) —
  // loaded once and point-in-polygon tested on every position update,
  // entirely offline, no reverse-geocoding API or key.
  const countries = useMemo<CountryFeature[]>(() => {
    try {
      const topology = worldCountries as unknown as Parameters<typeof feature>[0];
      const objects = (topology as { objects: Record<string, unknown> }).objects;
      const countriesObject = objects.countries as Parameters<typeof feature>[1];
      const geo = feature(topology, countriesObject) as unknown as {
        type: string;
        features?: { properties?: { name?: string }; geometry: CountryGeometry }[];
      };
      if (geo.type !== 'FeatureCollection' || !geo.features) return [];
      return geo.features
        .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
        .map((f) => ({
          name: f.properties?.name ?? 'Unknown territory',
          geometry: f.geometry,
          bbox: computeBBox(f.geometry),
        }));
    } catch {
      return [];
    }
  }, []);

  // Ground-track bookkeeping: derives speed/bearing/orbital elements from
  // consecutive real fixes, and grows the persisted "living cartography"
  // trail — but only from genuinely new samples (not a cached poll repeat).
  useEffect(() => {
    if (!livePosition) return;
    const curr: TrackPoint = { lat: livePosition.lat, lon: livePosition.lon, timeMs: livePosition.timestampMs };
    const prev = prevPositionRef.current;
    if (prev && prev.timeMs === curr.timeMs) return;

    if (prev) {
      const speed = computeGroundSpeedKmh(prev, curr);
      const bearing = computeBearingDeg(prev, curr);
      setGroundSpeedKmh(speed);
      setBearingDeg(bearing);
      if (bearing !== null) {
        setOrbitalElements(deriveOrbitalElements(curr.lat, curr.lon, bearing, curr.timeMs));
      }
    }
    prevPositionRef.current = curr;
    setTrail((t) => {
      const next = pruneTrail([...t, curr], curr.timeMs, TRAIL_RETENTION_MS);
      saveTrail(next);
      return next;
    });
  }, [livePosition]);

  // The smoothly-propagated "where is it right now" position, used for
  // display (map marker, dashboard readouts) — falls back to the last raw
  // fix until enough samples exist to derive real orbital elements.
  const displayPosition = useMemo(() => {
    if (orbitalElements) return propagateSubSatellitePoint(orbitalElements, nowMs);
    if (livePosition) return { lat: livePosition.lat, lon: livePosition.lon };
    return null;
  }, [orbitalElements, nowMs, livePosition]);

  const telemetry: OrbitalTelemetry = useMemo(() => {
    const crewCount = crewFeedCount ?? 0;
    const phase = orbitalElements ? orbitalPhaseAt(orbitalElements, nowMs) : fallbackOrbitalPhase(nowMs);

    if (!displayPosition) {
      return {
        altitudeKm: ISS_MEAN_ALTITUDE_KM,
        groundSpeedKmh: null,
        orbitalSpeedKmS: null,
        bearingDeg: null,
        elevationDeg: 0,
        isDaylight: true,
        country: null,
        crewCount,
        orbitalPhase: phase,
      };
    }

    const date = new Date(nowMs);
    const elevationDeg = solarElevationDeg(displayPosition.lat, displayPosition.lon, date);
    const orbitalSpeedKmS = groundSpeedKmh != null ? groundSpeedToOrbitalSpeedKmS(groundSpeedKmh, ISS_MEAN_ALTITUDE_KM) : null;

    return {
      altitudeKm: ISS_MEAN_ALTITUDE_KM,
      groundSpeedKmh,
      orbitalSpeedKmS,
      bearingDeg,
      elevationDeg,
      isDaylight: elevationDeg > 0,
      country: findCountryAt(displayPosition.lon, displayPosition.lat, countries),
      crewCount,
      orbitalPhase: phase,
    };
  }, [displayPosition, orbitalElements, nowMs, countries, groundSpeedKmh, bearingDeg, crewFeedCount]);

  const solarState = resolveSolarState(telemetry.isDaylight, telemetry.elevationDeg);
  const vignette = solarState === 'day' ? 0.15 : solarState === 'twilight' ? 0.35 : 0.55;

  // Fires the instant the continuously-ticking solar computation says the
  // ISS actually crossed the terminator — a detected, not merely reported, event.
  useEffect(() => {
    const prevDaylight = prevDaylightRef.current;
    prevDaylightRef.current = telemetry.isDaylight;
    if (prevDaylight === null || prevDaylight === telemetry.isDaylight) return;
    const direction: 'sunrise' | 'sunset' = telemetry.isDaylight ? 'sunrise' : 'sunset';
    if (direction === 'sunrise') setSunriseCount((n) => n + 1);
    else setSunsetCount((n) => n + 1);
    setCrossingPulse({ key: Date.now(), direction });
  }, [telemetry.isDaylight]);

  // Expensive multi-hour walks only re-run when the orbital elements
  // themselves change (roughly once per ~5-8s poll); filtering the results
  // down to "still upcoming" against the ticking clock is cheap.
  const predictedCrossings = useMemo(
    () => (orbitalElements ? predictTerminatorCrossings(orbitalElements, orbitalElements.epochMs, CROSSING_WINDOW_MS) : []),
    [orbitalElements],
  );
  const upcomingCrossings = useMemo(() => predictedCrossings.filter((c) => c.atMs > nowMs), [predictedCrossings, nowMs]);

  const predictedPasses = useMemo(
    () =>
      orbitalElements && observer
        ? predictVisiblePasses(orbitalElements, observer.lat, observer.lon, ISS_MEAN_ALTITUDE_KM, orbitalElements.epochMs, PASS_WINDOW_MS, { minElevationDeg })
        : [],
    [orbitalElements, observer?.lat, observer?.lon, minElevationDeg],
  );
  const upcomingPasses = useMemo(() => predictedPasses.filter((p) => p.endMs > nowMs), [predictedPasses, nowMs]);

  const predictedTrail = useMemo(() => {
    if (!orbitalElements) return [];
    const points = [];
    for (let t = 0; t <= PREDICTED_TRAIL_HORIZON_MS; t += PREDICTED_TRAIL_STEP_MS) {
      points.push(propagateSubSatellitePoint(orbitalElements, orbitalElements.epochMs + t));
    }
    return points;
  }, [orbitalElements]);

  useEffect(() => {
    listLocations().then(({ locations: loaded, source }) => {
      setLocations(loaded);
      setLocationsSource(source);
    });
  }, []);

  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeolocationStatus('unsupported');
      return;
    }
    setGeolocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setObserverState(loc);
        saveStoredObserver(loc);
        setGeolocationStatus('idle');
      },
      (err) => {
        setGeolocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const handleSetObserver = (loc: { lat: number; lon: number }) => {
    setObserverState(loc);
    saveStoredObserver(loc);
  };

  const handleMinElevationChange = (v: number) => {
    setMinElevationDeg(v);
    saveStoredMinElevation(v);
  };

  const handleSaveLocation = async () => {
    const name = locationName.trim();
    if (!name || !observer) return;
    const { location, source } = await saveLocation(name, observer);
    setLocations((prev) => [...prev.filter((l) => l.name !== name), location]);
    setLocationsSource(source);
    setLocationName('');
  };

  const handleLoadLocation = (name: string) => {
    const loc = locations.find((l) => l.name === name);
    if (loc) {
      setObserverState(loc.params);
      saveStoredObserver(loc.params);
    }
  };

  const handleDeleteLocation = async (name: string) => {
    const { source } = await deleteLocation(name);
    setLocations((prev) => prev.filter((l) => l.name !== name));
    setLocationsSource(source);
  };

  const handleCopyShareLink = async () => {
    if (!observer) return;
    const ok = await copyToClipboard(buildShareUrl({ lat: observer.lat, lon: observer.lon, minElevationDeg }));
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleExportMap = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportMapAsPng(svgRef.current, nightCanvasRef.current);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <div ref={mainRegionRef}>
        <MapScene
          position={displayPosition}
          observedTrail={trail}
          predictedTrail={predictedTrail}
          observer={observer}
          nowMs={nowMs}
          vignette={vignette}
          crossingPulse={crossingPulse}
          svgRef={svgRef}
          nightCanvasRef={nightCanvasRef}
        />

        <div className="brand">Umbra</div>

        <main className="stage">
          <div className="tray-wrap">
            {showOnboarding && <OnboardingHint onDismiss={dismissOnboarding} />}
            <StatusTray
              telemetry={telemetry}
              solarState={solarState}
              drawerOpen={drawerOpen}
              onToggleDrawer={() => setDrawerOpen((v) => !v)}
              onExportMap={handleExportMap}
              exporting={exporting}
              exportError={exportError}
              drawerToggleRef={drawerToggleRef}
            />
          </div>
        </main>
      </div>

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside ref={drawerRef} className={`drawer${drawerOpen ? ' drawer--open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-inner">
          <div className="drawer-header">
            <span>Mission Control</span>
            <button ref={drawerCloseRef} className="drawer-close" onClick={() => setDrawerOpen(false)}>
              ✕ Close
            </button>
          </div>

          <MissionDashboard telemetry={telemetry} solarState={solarState} crew={people} sunriseCount={sunriseCount} sunsetCount={sunsetCount} />

          <PassPredictor
            observer={observer}
            onSetObserver={handleSetObserver}
            minElevationDeg={minElevationDeg}
            onMinElevationChange={handleMinElevationChange}
            passes={upcomingPasses}
            crossings={upcomingCrossings}
            telemetryReady={orbitalElements !== null}
            nowMs={nowMs}
            geolocationStatus={geolocationStatus}
            onUseMyLocation={handleUseMyLocation}
            locations={locations}
            locationsSource={locationsSource}
            locationName={locationName}
            onLocationNameChange={setLocationName}
            onSaveLocation={handleSaveLocation}
            onLoadLocation={handleLoadLocation}
            onDeleteLocation={handleDeleteLocation}
            onCopyShareLink={handleCopyShareLink}
            linkCopied={linkCopied}
          />

          <p className="drawer-footnote">
            Position via Open Notify; altitude, orbital speed, and every prediction are derived from real
            orbital mechanics (Kepler's third law, a closed-form circular ground-track propagator) — see the
            README.
          </p>
          <p className="drawer-footnote">
            Predictions assume a circular, non-precessing orbit at a fixed known inclination: accurate over
            the windows shown here, but not a substitute for a real TLE-based ephemeris.
          </p>
        </div>
      </aside>
    </div>
  );
}
