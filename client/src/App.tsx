import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldCountries from 'world-atlas/countries-110m.json';
import { useIssFeed } from './inputs/useIssFeed';
import { useCrewFeed } from './inputs/useCrewFeed';
import { useWakeLock } from './inputs/useWakeLock';
import { solarElevationDeg } from './orbital/solarTerminator';
import { ISS_MEAN_ALTITUDE_KM, orbitalPhase as fallbackOrbitalPhase, groundSpeedToOrbitalSpeedKmS, didOrbitWrap } from './orbital/orbitalMechanics';
import { computeGroundSpeedKmh, computeBearingDeg, pruneTrail, type TrackPoint } from './orbital/groundTrack';
import { findCountryAt, computeBBox, type CountryFeature, type CountryGeometry } from './orbital/countryLookup';
import { deriveOrbitalElements, propagateSubSatellitePoint, orbitalPhaseAt, type OrbitalElements } from './orbital/groundTrackPropagator';
import { predictTerminatorCrossings, predictVisiblePasses, predictLocalTwilightTransition, findBestViewingSpotNow } from './orbital/eventPrediction';
import { slantRangeKm } from './orbital/visibility';
import { haversineDistanceKm } from './orbital/greatCircle';
import { loadTrail, saveTrail } from './lib/trailStore';
import { crossedMilestones, DISTANCE_MILESTONES_KM, COUNTRY_MILESTONES, LAP_MILESTONES } from './lib/milestones';
import {
  hasSeenOnboarding, loadStoredMinElevation, loadStoredObserver, markOnboardingSeen,
  saveStoredMinElevation, saveStoredObserver,
} from './lib/localSettings';
import { MapScene } from './components/MapScene';
import { TopBar } from './components/TopBar';
import { OnboardingHint } from './components/OnboardingHint';
import { TelemetryRail } from './components/TelemetryRail';
import { PredictorDock, type GeolocationStatus } from './components/PredictorDock';
import { ToastStack, type ToastItem } from './components/ToastStack';
import type { OrbitalTelemetry, SolarState } from './types';
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
  const prevPositionRef = useRef<TrackPoint | null>(null);
  const prevDaylightRef = useRef<boolean | null>(null);
  const prevOrbitalPhaseRef = useRef<number | null>(null);
  const prevDistanceMilestoneRef = useRef(0);
  const prevCountryMilestoneRef = useRef(0);
  const prevLapMilestoneRef = useRef(0);

  const [observer, setObserverState] = useState<{ lat: number; lon: number } | null>(() => loadStoredObserver());
  const [minElevationDeg, setMinElevationDeg] = useState(() => loadStoredMinElevation(10));
  const [geolocationStatus, setGeolocationStatus] = useState<GeolocationStatus>('idle');
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [trail, setTrail] = useState<TrackPoint[]>(() => loadTrail());
  const [groundSpeedKmh, setGroundSpeedKmh] = useState<number | null>(null);
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);
  const [orbitalElements, setOrbitalElements] = useState<OrbitalElements | null>(null);
  const [sunriseCount, setSunriseCount] = useState(0);
  const [sunsetCount, setSunsetCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Session-only "novel feature" stats — all derived from data the app
  // already computes, reset on page reload rather than persisted, since
  // they're framed as "this session," not a permanent record.
  const [countriesOverflown, setCountriesOverflown] = useState<string[]>([]);
  const [orbitLapCount, setOrbitLapCount] = useState(0);
  const [closestApproachKm, setClosestApproachKm] = useState<number | null>(null);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string) => {
    setToasts((t) => [...t, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message }]);
  };

  const dismissToast = (id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  };

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    markOnboardingSeen();
  };

  // Leave-it-open-and-watch is the whole point here, so the wake lock is unconditional.
  useWakeLock(true);

  // Ticks once a second so solar elevation, orbit progress, and countdowns
  // all keep advancing smoothly between the ~5s ISS position polls.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { position: livePosition, consecutiveFailures, lastFixMs } = useIssFeed();
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
      // Session odometer: real ground-track distance between consecutive
      // fixes, not a scaled/derived speed — an honest, directly-measured
      // running total for the whole time this tab's been open.
      setTotalDistanceKm((d) => d + haversineDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon));
    }
    prevPositionRef.current = curr;
    setTrail((t) => {
      const next = pruneTrail([...t, curr], curr.timeMs, TRAIL_RETENTION_MS);
      saveTrail(next);
      return next;
    });
  }, [livePosition]);

  // If the live ISS feed never responds (Open Notify and its fallback both
  // down), don't leave the map and telemetry blank forever — seed a one-time
  // estimate from the last two points of the persisted ground track (see
  // lib/trailStore.ts), so there's something to look at instead of an
  // indefinite "waiting for telemetry" state. The moment a real fix arrives,
  // the effect above overwrites this with live-derived orbital elements.
  useEffect(() => {
    if (orbitalElements || trail.length < 2) return;
    const [a, b] = trail.slice(-2);
    if (a.timeMs === b.timeMs) return;
    const bearing = computeBearingDeg(a, b);
    if (bearing === null) return;
    setOrbitalElements(deriveOrbitalElements(b.lat, b.lon, bearing, b.timeMs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Counts the instant the continuously-ticking solar computation says the
  // ISS actually crossed the terminator — a detected, not merely reported, event.
  useEffect(() => {
    const prevDaylight = prevDaylightRef.current;
    prevDaylightRef.current = telemetry.isDaylight;
    if (prevDaylight === null || prevDaylight === telemetry.isDaylight) return;
    if (telemetry.isDaylight) setSunriseCount((n) => n + 1);
    else setSunsetCount((n) => n + 1);
  }, [telemetry.isDaylight]);

  // Countries overflown this session — a running list, order of first sight.
  useEffect(() => {
    const country = telemetry.country;
    if (!country) return;
    setCountriesOverflown((prev) => (prev.includes(country) ? prev : [...prev, country]));
  }, [telemetry.country]);

  // Orbit lap counter: increments the instant the progress dial wraps back
  // to 0%, detected off the same continuously-ticking phase value the dial
  // itself renders (rather than a separate timer), so it's exact.
  useEffect(() => {
    const prevPhase = prevOrbitalPhaseRef.current;
    prevOrbitalPhaseRef.current = telemetry.orbitalPhase;
    if (prevPhase !== null && didOrbitWrap(prevPhase, telemetry.orbitalPhase)) {
      setOrbitLapCount((n) => n + 1);
    }
  }, [telemetry.orbitalPhase]);

  // Closest approach resets whenever the *observer location itself* changes
  // (a new place to watch from starts a fresh record), not on every
  // position tick.
  useEffect(() => {
    setClosestApproachKm(null);
  }, [observer?.lat, observer?.lon]);

  useEffect(() => {
    if (!observer || !displayPosition) return;
    const rangeKm = slantRangeKm(observer.lat, observer.lon, displayPosition.lat, displayPosition.lon, ISS_MEAN_ALTITUDE_KM);
    setClosestApproachKm((prev) => (prev === null || rangeKm < prev ? rangeKm : prev));
  }, [observer, displayPosition]);

  // Session-milestone toasts: a moment of payoff for otherwise-passive
  // stats, firing exactly once per threshold as each running total actually
  // crosses it (see lib/milestones.ts) — never re-firing on re-render.
  useEffect(() => {
    const crossed = crossedMilestones(prevDistanceMilestoneRef.current, totalDistanceKm, DISTANCE_MILESTONES_KM);
    crossed.forEach((m) => addToast(`${m.toLocaleString()} km flown this session`));
    prevDistanceMilestoneRef.current = totalDistanceKm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDistanceKm]);

  useEffect(() => {
    const count = countriesOverflown.length;
    const crossed = crossedMilestones(prevCountryMilestoneRef.current, count, COUNTRY_MILESTONES);
    crossed.forEach((m) => addToast(`${m} ${m === 1 ? 'country' : 'countries'} overflown this session`));
    prevCountryMilestoneRef.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countriesOverflown.length]);

  useEffect(() => {
    const crossed = crossedMilestones(prevLapMilestoneRef.current, orbitLapCount, LAP_MILESTONES);
    crossed.forEach((m) => addToast(`Orbit ${m} complete`));
    prevLapMilestoneRef.current = orbitLapCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbitLapCount]);

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

  // Both of these are cheap but not free (a 24-point ring scan; a bisected
  // time-walk) and don't need sub-minute precision, so they're recomputed on
  // the same minute cadence as the map's night-mask rather than every tick.
  const minuteKey = Math.floor(nowMs / 60_000);

  const localTwilightTransition = useMemo(
    () => (observer ? predictLocalTwilightTransition(observer.lat, observer.lon, nowMs) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observer?.lat, observer?.lon, minuteKey],
  );

  const goldenWindowSpot = useMemo(() => {
    if (!orbitalElements) return null;
    const minuteMs = minuteKey * 60_000;
    const pos = propagateSubSatellitePoint(orbitalElements, minuteMs);
    return findBestViewingSpotNow(pos.lat, pos.lon, ISS_MEAN_ALTITUDE_KM, new Date(minuteMs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbitalElements, minuteKey]);

  const goldenWindowCountry = useMemo(
    () => (goldenWindowSpot ? findCountryAt(goldenWindowSpot.lon, goldenWindowSpot.lat, countries) : null),
    [goldenWindowSpot, countries],
  );

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

  return (
    <div className="umbra-shell">
      <TopBar nowMs={nowMs} consecutiveFailures={consecutiveFailures} lastFixMs={lastFixMs} />

      {showOnboarding && <OnboardingHint onDismiss={dismissOnboarding} />}

      <div className="body-grid">
        <TelemetryRail
          telemetry={telemetry}
          solarState={solarState}
          crew={people}
          sunriseCount={sunriseCount}
          sunsetCount={sunsetCount}
          countriesOverflown={countriesOverflown}
          orbitLapCount={orbitLapCount}
          totalDistanceKm={totalDistanceKm}
        />

        <MapScene
          position={displayPosition}
          observedTrail={trail}
          predictedTrail={predictedTrail}
          observer={observer}
          nowMs={nowMs}
        />

        <PredictorDock
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
          closestApproachKm={closestApproachKm}
          localTwilightTransition={localTwilightTransition}
          goldenWindowCountry={goldenWindowCountry}
        />
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
