import { useState, type CSSProperties } from 'react';
import { isNotablePass, type PassPrediction, type LocalTwilightTransition } from '../orbital/eventPrediction';
import { formatDurationShort } from '../lib/formatTime';
import { SkyPlot } from './SkyPlot';

export type GeolocationStatus = 'idle' | 'locating' | 'denied' | 'unsupported' | 'error';

interface PredictorDockProps {
  observer: { lat: number; lon: number } | null;
  onSetObserver: (loc: { lat: number; lon: number }) => void;
  minElevationDeg: number;
  onMinElevationChange: (v: number) => void;
  passes: PassPrediction[];
  /** The next actually-visible pass beyond the normal 24h window, only set
   * when `passes` is empty — a real, correct state (the observer's local
   * darkness and the ISS being lit and overhead doesn't align every day),
   * but worth surfacing something concrete instead of a dead end. */
  fallbackNextPass: PassPrediction | null;
  telemetryReady: boolean;
  nowMs: number;
  geolocationStatus: GeolocationStatus;
  onUseMyLocation: () => void;
  closestApproachKm: number | null;
  localTwilightTransition: LocalTwilightTransition | null;
  goldenWindowCountry: string | null;
}

function fillVar(value: number, min: number, max: number): CSSProperties {
  return { '--val': (value - min) / (max - min) } as CSSProperties;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ICON_PROPS = {
  width: 13,
  height: 13,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconTarget() {
  return (
    <svg {...ICON_PROPS} width={14} height={14}>
      <circle cx="8" cy="8" r="5.5"></circle>
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"></circle>
      <path d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15"></path>
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg {...ICON_PROPS} width={14} height={14}>
      <circle cx="8" cy="8" r="6.2"></circle>
      <path d="M1.8 8h12.4M8 1.8c2.2 1.8 2.2 10.6 0 12.4C5.8 12.4 5.8 3.6 8 1.8Z"></path>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg {...ICON_PROPS} width={14} height={14} strokeLinejoin="round">
      <path d="M13 9.4A5.6 5.6 0 1 1 6.6 3a4.5 4.5 0 0 0 6.4 6.4Z"></path>
    </svg>
  );
}

function IconStar() {
  return (
    <svg {...ICON_PROPS} width={11} height={11} fill="currentColor" stroke="none" strokeLinejoin="round">
      <path d="M8 1.2l1.98 4.28 4.62.56-3.42 3.24.9 4.72L8 11.7l-4.08 2.3.9-4.72L1.4 6.04l4.62-.56Z"></path>
    </svg>
  );
}

const GEO_STATUS_LABEL: Record<GeolocationStatus, string | null> = {
  idle: null,
  locating: 'Locating…',
  denied: 'Location permission denied. Enter coordinates manually.',
  unsupported: 'Geolocation isn\'t available in this browser. Enter coordinates manually.',
  error: 'Could not get your location. Enter coordinates manually.',
};

/** The permanent right dock: where you're watching from, the sky-plot for the next pass, and what's coming up. */
export function PredictorDock({
  observer, onSetObserver, minElevationDeg, onMinElevationChange,
  passes, fallbackNextPass, telemetryReady, nowMs,
  geolocationStatus, onUseMyLocation,
  closestApproachKm, localTwilightTransition, goldenWindowCountry,
}: PredictorDockProps) {
  const [latInput, setLatInput] = useState(observer ? String(observer.lat.toFixed(4)) : '');
  const [lonInput, setLonInput] = useState(observer ? String(observer.lon.toFixed(4)) : '');

  const applyManualLocation = () => {
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return;
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return;
    onSetObserver({ lat, lon });
  };

  const geoMessage = GEO_STATUS_LABEL[geolocationStatus];
  const nextPass = passes[0] ?? null;
  const manifest = passes.slice(0, 6);

  return (
    <aside className="dock">
      <div className="hud-card dock-card--hero">
        <div className="dock-heading">
          {observer ? 'Next pass' : 'Next pass · set a location'}
        </div>
        {nextPass ? (
          <div className="next-pass">
            <span className="next-pass-eta num">{formatDurationShort(nextPass.startMs - nowMs)}</span>
            <span className="next-pass-meta">
              {fmtTime(nextPass.startMs)} local &middot; {formatDurationShort(nextPass.endMs - nextPass.startMs)} visible &middot; peak {Math.round(nextPass.peakElevationDeg)}°
            </span>
          </div>
        ) : fallbackNextPass ? (
          <div className="next-pass">
            <span className="next-pass-eta num">{formatDurationShort(fallbackNextPass.startMs - nowMs)}</span>
            <span className="next-pass-meta">
              Nothing in the next 24 hours from here. Next good one: {fmtTime(fallbackNextPass.startMs)} local &middot; peak {Math.round(fallbackNextPass.peakElevationDeg)}°
            </span>
          </div>
        ) : (
          <div className="next-pass">
            <span className="next-pass-meta">
              {!observer
                ? 'Set a location below to predict visible passes.'
                : !telemetryReady
                  ? 'Waiting for live ISS telemetry to derive an orbit…'
                  : 'No passes bright enough in the next 10 days from here.'}
            </span>
          </div>
        )}
      </div>

      {goldenWindowCountry && (
        <div className="golden-window hud-card">
          <IconGlobe />
          <span>
            Right now, <b>{goldenWindowCountry}</b> has an exceptional view: the ISS is lit and the sky's dark enough there.
          </span>
        </div>
      )}

      <div className="dock-section hud-card">
        <div className="dock-heading">Sky chart</div>
        <SkyPlot pass={nextPass ?? fallbackNextPass} />
      </div>

      <div className="dock-section hud-card">
        <div className="dock-heading" style={{ marginBottom: 10 }}>Watching from</div>
        <button type="button" className="btn-console btn-console--wide" onClick={onUseMyLocation} disabled={geolocationStatus === 'locating'}>
          <IconTarget />
          {geolocationStatus === 'locating' ? 'Locating…' : 'Use my location'}
        </button>
        {geoMessage && <p className="hud-note">{geoMessage}</p>}

        <div className="field-row">
          <label className="field">
            <span className="field-label">Lat</span>
            <input
              type="number" min={-90} max={90} step={0.0001} value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              onBlur={applyManualLocation}
            />
          </label>
          <label className="field">
            <span className="field-label">Lon</span>
            <input
              type="number" min={-180} max={180} step={0.0001} value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              onBlur={applyManualLocation}
            />
          </label>
        </div>

        <label className="threshold-row">
          <span>Minimum elevation to count</span>
          <b>{minElevationDeg.toFixed(0)}°</b>
          <input
            type="range" className="hud-range" min={5} max={60} step={1} value={minElevationDeg}
            style={fillVar(minElevationDeg, 5, 60)}
            onChange={(e) => onMinElevationChange(Number(e.target.value))}
            aria-label="Minimum look-angle elevation to count as a visible pass"
          />
        </label>

        {observer && closestApproachKm !== null && (
          <div className="dock-stat">
            <IconTarget />
            <span>
              Closest approach this session: <b className="num">{Math.round(closestApproachKm).toLocaleString()} km</b>
            </span>
          </div>
        )}

        {observer && localTwilightTransition && (
          <div className="dock-stat">
            <IconMoon />
            <span>
              Your sky {localTwilightTransition.becomingDark ? 'gets dark enough to look up' : 'gets too bright to spot it'} in{' '}
              <b className="num">{formatDurationShort(localTwilightTransition.atMs - nowMs)}</b>
            </span>
          </div>
        )}
      </div>

      <div className="dock-section hud-card">
        <div className="dock-heading" style={{ marginBottom: 6 }}>Manifest</div>
        {!telemetryReady ? (
          <p className="hud-note">Waiting for live ISS telemetry to derive an orbit…</p>
        ) : manifest.length === 0 && !fallbackNextPass ? (
          <p className="hud-note">Nothing upcoming in the prediction window.</p>
        ) : manifest.length === 0 && fallbackNextPass ? (
          <div className="manifest">
            <div className="manifest-row">
              <span className="manifest-kind">
                <span className="manifest-dot pass"></span>
                Next good pass (beyond 24h)
              </span>
              <span className="manifest-time num">in {formatDurationShort(fallbackNextPass.startMs - nowMs)}</span>
            </div>
          </div>
        ) : (
          <div className="manifest">
            {manifest.map((pass) => {
              const notable = isNotablePass(pass);
              return (
                <div className={`manifest-row${notable ? ' manifest-row--notable' : ''}`} key={pass.startMs}>
                  <span className="manifest-kind">
                    {notable ? (
                      <span className="manifest-dot manifest-dot--star"><IconStar /></span>
                    ) : (
                      <span className="manifest-dot pass"></span>
                    )}
                    {notable ? `Great pass · ${Math.round(pass.peakElevationDeg)}° peak` : 'Visible pass'}
                  </span>
                  <span className="manifest-time num">in {formatDurationShort(pass.startMs - nowMs)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="dock-footnote">
        Predictions assume a circular, non-precessing orbit at a fixed known inclination. Accurate over the
        windows shown here, not a substitute for a real TLE-based ephemeris.
      </p>
    </aside>
  );
}
