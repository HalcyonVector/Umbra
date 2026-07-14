import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldCountries from 'world-atlas/countries-110m.json';
import { AudioEngine, type MixLayer } from './audio/AudioEngine';
import { useIssFeed } from './inputs/useIssFeed';
import { useCrewFeed } from './inputs/useCrewFeed';
import { useRecorder } from './inputs/useRecorder';
import { useWakeLock } from './inputs/useWakeLock';
import { useMediaSession } from './inputs/useMediaSession';
import { mapTelemetryToParams, mapCrossingToTriggerParams, resolveSolarState } from './mapping/parameterMapping';
import { solarElevationDeg, isDaylight as computeIsDaylight, terminatorProximity as computeTerminatorProximity, predictNextCrossing } from './orbital/solarTerminator';
import { orbitalPhase as computeOrbitalPhase, groundSpeedToOrbitalSpeedKmS, ISS_MEAN_ALTITUDE_KM } from './orbital/orbitalMechanics';
import { computeGroundSpeedKmh, computeBearingDeg, pruneTrail, type TrackPoint } from './orbital/groundTrack';
import { findCountryAt, computeBBox, type CountryFeature, type CountryGeometry } from './orbital/countryLookup';
import { listPresets, savePreset, deletePreset } from './lib/presetsStore';
import type { PresetSource } from './lib/presetsStore';
import { buildShareUrl, readShareParamsFromLocation } from './lib/shareLink';
import { copyToClipboard } from './lib/clipboard';
import {
  hasSeenOnboarding, loadStoredMix, loadStoredSensitivity, loadStoredVolume, markOnboardingSeen,
  saveStoredMix, saveStoredSensitivity, saveStoredVolume,
} from './lib/localSettings';
import { MapScene } from './components/MapScene';
import { NowPlayingTray } from './components/NowPlayingTray';
import { OnboardingHint } from './components/OnboardingHint';
import { ControlPanel, type SimState } from './components/ControlPanel';
import { StatusPanel } from './components/StatusPanel';
import type { EngineConfig, OrbitalTelemetry, Preset } from './types';
import './App.css';

const DEFAULT_SIM: SimState = { lat: 0, lon: 0, utcHour: 12 };
const DEFAULT_MIX: Record<MixLayer, number> = { drone: 1, crossing: 1, beacon: 0.6 };
const MAX_TRAIL_POINTS = 400;
const TRAIL_RETENTION_MS = 20 * 60_000; // ~20 minutes of ground track — a meaningful arc without unbounded growth

function buildSimulatedDate(baseNowMs: number, utcHour: number): Date {
  const d = new Date(baseNowMs);
  d.setUTCHours(Math.floor(utcHour), Math.round((utcHour % 1) * 60), 0, 0);
  return d;
}

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();

  const mainRegionRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerHasMounted = useRef(false);

  const [started, setStarted] = useState(false);
  const [volume, setVolume] = useState(() => loadStoredVolume(0.7));
  const [simulate, setSimulate] = useState(false);
  const [sim, setSim] = useState<SimState>(DEFAULT_SIM);
  const [mix, setMix] = useState<Record<MixLayer, number>>(() => loadStoredMix(DEFAULT_MIX));
  const [crossingSensitivityDeg, setCrossingSensitivityDeg] = useState(() => loadStoredSensitivity(6));
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsSource, setPresetsSource] = useState<PresetSource>('server');
  const [presetName, setPresetName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [trail, setTrail] = useState<TrackPoint[]>([]);
  const [groundSpeedKmh, setGroundSpeedKmh] = useState<number | null>(null);
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);
  const [crossingPulse, setCrossingPulse] = useState<{ key: number; direction: 'sunrise' | 'sunset' } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const prevPositionRef = useRef<TrackPoint | null>(null);
  const prevDaylightRef = useRef<boolean | null>(null);
  const startedRef = useRef(started);
  startedRef.current = started;

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    markOnboardingSeen();
  };

  useWakeLock(started);

  // A shared crossing-sensitivity value in the URL is applied once on load,
  // same idea as Fault-Line's share-link mechanism, then the URL is cleaned
  // up so a refresh doesn't reapply it.
  useEffect(() => {
    const shared = readShareParamsFromLocation();
    if (shared) {
      setCrossingSensitivityDeg(shared.crossingSensitivityDeg);
      saveStoredSensitivity(shared.crossingSensitivityDeg);
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

  // Only one of the main view or the drawer is reachable by keyboard/screen
  // reader at a time, matching what's visible.
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

  // Ticks once a second so solar elevation, orbital phase, and the
  // predicted-crossing countdown all keep advancing in real time even
  // between ISS position polls — the terminator crossing is *computed*,
  // not just reported by the feed.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { position: livePosition } = useIssFeed();
  const { count: crewFeedCount } = useCrewFeed();

  // world-atlas ships pre-built TopoJSON country polygons (ISC-licensed) —
  // loaded once and point-in-polygon tested against on every position
  // update, entirely offline, no reverse-geocoding API or key.
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

  // Ground-track bookkeeping: derives speed/bearing from consecutive real
  // fixes, grows the fading trail, and pings the "telemetry heartbeat"
  // beacon exactly when a genuinely new sample (not a cached repeat)
  // arrives. Simulate mode bypasses all of this — there's no real movement
  // to measure.
  useEffect(() => {
    if (simulate || !livePosition) return;
    const curr: TrackPoint = { lat: livePosition.lat, lon: livePosition.lon, timeMs: livePosition.timestampMs };
    const prev = prevPositionRef.current;
    if (prev && prev.timeMs === curr.timeMs) return;

    if (prev) {
      setGroundSpeedKmh(computeGroundSpeedKmh(prev, curr));
      setBearingDeg(computeBearingDeg(prev, curr));
    }
    prevPositionRef.current = curr;
    setTrail((t) => pruneTrail([...t, curr], curr.timeMs, TRAIL_RETENTION_MS).slice(-MAX_TRAIL_POINTS));
    if (startedRef.current) engineRef.current?.triggerBeacon();
  }, [livePosition, simulate]);

  const effectivePosition = simulate
    ? { lat: sim.lat, lon: sim.lon }
    : livePosition
      ? { lat: livePosition.lat, lon: livePosition.lon }
      : null;

  const effGroundSpeedKmh = simulate ? null : groundSpeedKmh;
  const effBearingDeg = simulate ? null : bearingDeg;

  const nextCrossing = useMemo(() => {
    if (!effectivePosition || effBearingDeg == null || effGroundSpeedKmh == null) return null;
    return predictNextCrossing(effectivePosition.lat, effectivePosition.lon, effBearingDeg, effGroundSpeedKmh, new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePosition?.lat, effectivePosition?.lon, effBearingDeg, effGroundSpeedKmh]);

  const telemetry: OrbitalTelemetry = useMemo(() => {
    const crewCount = crewFeedCount ?? 0;
    if (!effectivePosition) {
      return {
        altitudeKm: ISS_MEAN_ALTITUDE_KM,
        groundSpeedKmh: null,
        orbitalSpeedKmS: null,
        bearingDeg: null,
        elevationDeg: 0,
        terminatorProximity: 0,
        isDaylight: true,
        state: 'day',
        country: null,
        crewCount,
        orbitalPhase: computeOrbitalPhase(nowMs),
        nextCrossing: null,
      };
    }

    const effectiveDate = simulate ? buildSimulatedDate(nowMs, sim.utcHour) : new Date(nowMs);
    const elevation = solarElevationDeg(effectivePosition.lat, effectivePosition.lon, effectiveDate);
    const daylight = computeIsDaylight(effectivePosition.lat, effectivePosition.lon, effectiveDate);
    const proximity = computeTerminatorProximity(effectivePosition.lat, effectivePosition.lon, effectiveDate, crossingSensitivityDeg);
    const country = findCountryAt(effectivePosition.lon, effectivePosition.lat, countries);
    const orbitalSpeedKmS = effGroundSpeedKmh != null ? groundSpeedToOrbitalSpeedKmS(effGroundSpeedKmh, ISS_MEAN_ALTITUDE_KM) : null;

    return {
      altitudeKm: ISS_MEAN_ALTITUDE_KM,
      groundSpeedKmh: effGroundSpeedKmh,
      orbitalSpeedKmS,
      bearingDeg: effBearingDeg,
      elevationDeg: elevation,
      terminatorProximity: proximity,
      isDaylight: daylight,
      state: resolveSolarState(daylight, proximity),
      country,
      crewCount,
      orbitalPhase: computeOrbitalPhase(nowMs),
      nextCrossing,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectivePosition?.lat, effectivePosition?.lon, simulate, sim.utcHour, nowMs,
    crossingSensitivityDeg, countries, effGroundSpeedKmh, effBearingDeg, crewFeedCount, nextCrossing,
  ]);

  const droneParams = useMemo(
    () =>
      mapTelemetryToParams({
        isDaylight: telemetry.isDaylight,
        terminatorProximity: telemetry.terminatorProximity,
        crewCount: telemetry.crewCount,
        groundSpeedKmh: telemetry.groundSpeedKmh,
        overLand: telemetry.country !== null,
        orbitalPhase: telemetry.orbitalPhase,
      }),
    [telemetry.isDaylight, telemetry.terminatorProximity, telemetry.crewCount, telemetry.groundSpeedKmh, telemetry.country, telemetry.orbitalPhase],
  );

  const getRecordingStream = useCallback(() => engineRef.current?.getRecordingStream() ?? null, []);
  const recorder = useRecorder(getRecordingStream);

  useEffect(() => {
    engineRef.current?.updateDroneParams(droneParams);
  }, [droneParams]);

  // Fires the terminator-crossing swell the instant the continuously-ticking
  // solar computation says isDaylight actually flipped — a predicted/computed
  // event, not one detected only after the next network poll happens to land.
  useEffect(() => {
    const prevDaylight = prevDaylightRef.current;
    prevDaylightRef.current = telemetry.isDaylight;
    if (prevDaylight === null || prevDaylight === telemetry.isDaylight) return;
    const direction: 'sunrise' | 'sunset' = telemetry.isDaylight ? 'sunrise' : 'sunset';
    if (startedRef.current) engineRef.current?.triggerCrossing(mapCrossingToTriggerParams(direction));
    setCrossingPulse({ key: Date.now(), direction });
  }, [telemetry.isDaylight]);

  useEffect(() => {
    engineRef.current?.setMasterVolume(volume);
    saveStoredVolume(volume);
  }, [volume]);

  useEffect(() => {
    listPresets().then(({ presets: loaded, source }) => {
      setPresets(loaded);
      setPresetsSource(source);
    });
  }, []);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
    },
    [],
  );

  const handleStart = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.start();
    engine.setMasterVolume(volume);
    engine.updateDroneParams(droneParams);
    Object.entries(mix).forEach(([layer, level]) => engine.setMixLevel(layer as MixLayer, level));
    setStarted(true);
    if (showOnboarding) dismissOnboarding();
  };

  const handleStop = () => {
    if (recorder.isRecording) recorder.stop();
    engineRef.current?.stop();
    setStarted(false);
  };

  const handleStartRef = useRef(handleStart);
  const handleStopRef = useRef(handleStop);
  handleStartRef.current = handleStart;
  handleStopRef.current = handleStop;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return;
      e.preventDefault();
      if (started) handleStopRef.current();
      else handleStartRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [started]);

  useMediaSession(
    started,
    {
      title: `${telemetry.state.toUpperCase()} · Crew ${telemetry.crewCount} · ${telemetry.country ?? 'Open ocean'}`,
      artist: 'Umbra',
    },
    handleStart,
    handleStop,
  );

  const handleMixChange = (layer: MixLayer, level: number) => {
    setMix((prev) => {
      const next = { ...prev, [layer]: level };
      saveStoredMix(next);
      return next;
    });
    engineRef.current?.setMixLevel(layer, level);
  };

  const handleSensitivityChange = (value: number) => {
    setCrossingSensitivityDeg(value);
    saveStoredSensitivity(value);
  };

  const handleTriggerCrossing = (direction: 'sunrise' | 'sunset') => {
    engineRef.current?.triggerCrossing(mapCrossingToTriggerParams(direction));
    setCrossingPulse({ key: Date.now(), direction });
  };

  const handleTriggerBeacon = () => {
    engineRef.current?.triggerBeacon();
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    const config: EngineConfig = { crossingSensitivityDeg };
    const { preset, source } = await savePreset(name, config);
    setPresets((prev) => [...prev.filter((p) => p.name !== name), preset]);
    setPresetsSource(source);
    setPresetName('');
  };

  const handleLoadPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (preset) {
      setCrossingSensitivityDeg(preset.params.crossingSensitivityDeg);
      saveStoredSensitivity(preset.params.crossingSensitivityDeg);
    }
  };

  const handleDeletePreset = async (name: string) => {
    const { source } = await deletePreset(name);
    setPresets((prev) => prev.filter((p) => p.name !== name));
    setPresetsSource(source);
  };

  const handleCopyShareLink = async () => {
    const ok = await copyToClipboard(buildShareUrl({ crossingSensitivityDeg }));
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  return (
    <div className="app">
      <div ref={mainRegionRef}>
        <MapScene position={effectivePosition} trail={simulate ? [] : trail} nowMs={nowMs} vignette={droneParams.vignette} crossingPulse={crossingPulse} />

        <div className="brand">Umbra</div>

        <main className="stage">
          <div className="tray-wrap">
            {showOnboarding && <OnboardingHint onDismiss={dismissOnboarding} />}
            <NowPlayingTray
              telemetry={telemetry}
              analyser={engineRef.current.getAnalyser()}
              started={started}
              onStart={handleStart}
              onStop={handleStop}
              volume={volume}
              onVolumeChange={setVolume}
              isRecording={recorder.isRecording}
              recordingUrl={recorder.recordingUrl}
              recordingError={recorder.error}
              onStartRecording={recorder.start}
              onStopRecording={recorder.stop}
              drawerOpen={drawerOpen}
              onToggleDrawer={() => setDrawerOpen((v) => !v)}
              drawerToggleRef={drawerToggleRef}
            />
          </div>
        </main>
      </div>

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside ref={drawerRef} className={`drawer${drawerOpen ? ' drawer--open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-inner">
          <div className="drawer-header">
            <span>Telemetry</span>
            <button ref={drawerCloseRef} className="drawer-close" onClick={() => setDrawerOpen(false)}>
              ✕ Close
            </button>
          </div>

          <ControlPanel
            simulate={simulate}
            onToggleSimulate={setSimulate}
            sim={sim}
            onSimChange={(patch) => setSim((prev) => ({ ...prev, ...patch }))}
            onTriggerCrossing={handleTriggerCrossing}
            onTriggerBeacon={handleTriggerBeacon}
            crossingSensitivityDeg={crossingSensitivityDeg}
            onSensitivityChange={handleSensitivityChange}
            mix={mix}
            onMixChange={handleMixChange}
            presets={presets}
            presetsSource={presetsSource}
            presetName={presetName}
            onPresetNameChange={setPresetName}
            onSavePreset={handleSavePreset}
            onLoadPreset={handleLoadPreset}
            onDeletePreset={handleDeletePreset}
            onCopyShareLink={handleCopyShareLink}
            linkCopied={linkCopied}
          />

          <StatusPanel telemetry={telemetry} params={droneParams} />

          <p className="drawer-footnote">
            Synthesis engine built entirely from Tone.js oscillators, filters, and envelopes (no samples).
            Position via Open Notify; altitude and orbital speed are derived from real orbital mechanics, not
            reported by the feed — see the README.
          </p>
          <p className="drawer-footnote">
            Every terminator crossing is predicted from real solar geometry and fires the instant it happens,
            not on the next poll. One active drone layer per person currently in space.
          </p>
        </div>
      </aside>
    </div>
  );
}
