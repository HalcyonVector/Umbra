import { useEffect, useState, type CSSProperties } from 'react';
import { isNotablePass, type PassPrediction, type LocalTwilightTransition } from '../orbital/eventPrediction';
import { formatClockTime, formatDayLabel, formatDurationShort } from '../lib/formatTime';
import { compassLabel } from '../lib/compass';
import { SkyPlot } from './SkyPlot';

export type GeolocationStatus = 'idle' | 'locating' | 'denied' | 'unsupported' | 'error';

interface PassPanelProps {
  observer: { lat: number; lon: number } | null;
  onSetObserver: (loc: { lat: number; lon: number }) => void;
  minElevationDeg: number;
  onMinElevationChange: (v: number) => void;
  passes: PassPrediction[];
  /** The next visible pass beyond the 24h window, only set when `passes` is empty. */
  fallbackNextPass: PassPrediction | null;
  telemetryReady: boolean;
  nowMs: number;
  geolocationStatus: GeolocationStatus;
  onUseMyLocation: () => void;
  pickingOnMap: boolean;
  onTogglePickOnMap: () => void;
  closestApproachKm: number | null;
  localTwilightTransition: LocalTwilightTransition | null;
  goldenWindowCountry: string | null;
  className?: string;
}

const GEO_STATUS_LABEL: Record<GeolocationStatus, string | null> = {
  idle: null,
  locating: null,
  denied: 'Location permission was denied. Pick a spot on the map or type coordinates instead.',
  unsupported: 'This browser cannot share your location. Pick a spot on the map or type coordinates instead.',
  error: 'Could not get your location. Pick a spot on the map or type coordinates instead.',
};

function fillVar(value: number, min: number, max: number): CSSProperties {
  return { '--val': (value - min) / (max - min) } as CSSProperties;
}

function passQuality(pass: PassPrediction): { label: string; tone: 'great' | 'good' | 'low' } {
  if (isNotablePass(pass)) return { label: 'Great', tone: 'great' };
  if (pass.peakElevationDeg >= 25) return { label: 'Good', tone: 'good' };
  return { label: 'Low', tone: 'low' };
}

function riseDirection(pass: PassPrediction): string | null {
  const first = pass.track?.[0];
  return first ? compassLabel(first.azimuthDeg) : null;
}

function formatCoord(value: number) {
  return value.toFixed(4);
}

function TargetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 14.5s4.6-4.3 4.6-8a4.6 4.6 0 1 0-9.2 0c0 3.7 4.6 8 4.6 8Z" />
      <circle cx="8" cy="6.5" r="1.6" />
    </svg>
  );
}

/** Right panel: when and where to look up, and the observer location that drives it. */
export function PassPanel({
  observer, onSetObserver, minElevationDeg, onMinElevationChange,
  passes, fallbackNextPass, telemetryReady, nowMs,
  geolocationStatus, onUseMyLocation, pickingOnMap, onTogglePickOnMap,
  closestApproachKm, localTwilightTransition, goldenWindowCountry, className = '',
}: PassPanelProps) {
  const [latInput, setLatInput] = useState(observer ? formatCoord(observer.lat) : '');
  const [lonInput, setLonInput] = useState(observer ? formatCoord(observer.lon) : '');
  const [inputError, setInputError] = useState<string | null>(null);

  // Keep the inputs in sync when the location changes from elsewhere
  // (geolocation, or a click on the map).
  useEffect(() => {
    if (!observer) return;
    setLatInput(formatCoord(observer.lat));
    setLonInput(formatCoord(observer.lon));
    setInputError(null);
  }, [observer?.lat, observer?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyManualLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (latInput.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      setInputError('Latitude must be between -90 and 90.');
      return;
    }
    if (lonInput.trim() === '' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setInputError('Longitude must be between -180 and 180.');
      return;
    }
    setInputError(null);
    onSetObserver({ lat, lon });
  };

  const nextPass = passes[0] ?? fallbackNextPass;
  const isFallback = passes.length === 0 && fallbackNextPass !== null;
  const geoMessage = GEO_STATUS_LABEL[geolocationStatus];
  const upcoming = passes.length > 0 ? passes.slice(0, 6) : fallbackNextPass ? [fallbackNextPass] : [];
  const passInProgress = nextPass !== null && nextPass.startMs <= nowMs;

  return (
    <aside className={`panel panel--right glass ${className}`} aria-label="Visible pass predictor">
      <section className="card card--hero">
        <header className="card-head">
          <h2>Next visible pass</h2>
          {nextPass && <span className={`quality quality--${passQuality(nextPass).tone}`}>{passQuality(nextPass).label}</span>}
        </header>

        {!observer ? (
          <div className="empty-hero">
            <p>Set where you are watching from and Umbra will work out when the ISS is bright enough to see with the naked eye.</p>
            <div className="btn-row">
              <button type="button" className="btn btn--primary" onClick={onUseMyLocation} disabled={geolocationStatus === 'locating'}>
                <TargetIcon />
                {geolocationStatus === 'locating' ? 'Locating' : 'Use my location'}
              </button>
              <button type="button" className={`btn${pickingOnMap ? ' btn--active' : ''}`} onClick={onTogglePickOnMap} aria-pressed={pickingOnMap}>
                <PinIcon />
                {pickingOnMap ? 'Click the map' : 'Pick on map'}
              </button>
            </div>
            {geoMessage && <p className="note note--warn">{geoMessage}</p>}
          </div>
        ) : nextPass ? (
          <div className="countdown">
            <span className="countdown-label">{passInProgress ? 'Visible now, look up' : 'Starts in'}</span>
            <span className="countdown-value num">
              {passInProgress ? formatDurationShort(nextPass.endMs - nowMs) : formatDurationShort(nextPass.startMs - nowMs)}
            </span>
            <span className="countdown-meta">
              {formatDayLabel(nextPass.startMs, nowMs)} at {formatClockTime(nextPass.startMs)}
              {' · '}
              {formatDurationShort(nextPass.endMs - nextPass.startMs)} long
              {' · '}
              peaks {Math.round(nextPass.peakElevationDeg)}° up
            </span>
            {isFallback && <p className="note">Nothing bright enough in the next 24 hours from here. This is the next good one.</p>}
          </div>
        ) : (
          <p className="muted">
            {!telemetryReady ? 'Waiting for live telemetry to work out the orbit.' : 'No passes bright enough in the next 10 days from here. Try a lower minimum elevation.'}
          </p>
        )}

        {observer && <SkyPlot pass={nextPass} />}
      </section>

      {goldenWindowCountry && (
        <section className="callout">
          <span className="callout-icon" aria-hidden="true">★</span>
          <span>
            Best view on Earth right now: <b>{goldenWindowCountry}</b>. The station is sunlit and the sky there is dark.
          </span>
        </section>
      )}

      {observer && (
        <section className="card">
          <header className="card-head">
            <h2>Upcoming passes</h2>
            <span className="card-hint">min {minElevationDeg}° elevation</span>
          </header>
          {!telemetryReady ? (
            <p className="muted">Waiting for live telemetry.</p>
          ) : upcoming.length === 0 ? (
            <p className="muted">Nothing upcoming in the prediction window.</p>
          ) : (
            <ol className="pass-list">
              {upcoming.map((pass) => {
                const q = passQuality(pass);
                const dir = riseDirection(pass);
                return (
                  <li key={pass.startMs} className="pass-row">
                    <span className="pass-when">
                      <span className="pass-day">{formatDayLabel(pass.startMs, nowMs)}</span>
                      <span className="pass-time num">{formatClockTime(pass.startMs)}</span>
                    </span>
                    <span className="pass-detail">
                      <span className="num">{Math.round(pass.peakElevationDeg)}° peak</span>
                      <span className="pass-sub">
                        {formatDurationShort(pass.endMs - pass.startMs)}
                        {dir ? ` · rises ${dir}` : ''}
                      </span>
                    </span>
                    <span className={`quality quality--${q.tone}`}>{q.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      <section className="card">
        <header className="card-head">
          <h2>Watching from</h2>
          {observer && <span className="card-hint num">{observer.lat.toFixed(2)}, {observer.lon.toFixed(2)}</span>}
        </header>

        {observer && (
          <div className="btn-row">
            <button type="button" className="btn" onClick={onUseMyLocation} disabled={geolocationStatus === 'locating'}>
              <TargetIcon />
              {geolocationStatus === 'locating' ? 'Locating' : 'My location'}
            </button>
            <button type="button" className={`btn${pickingOnMap ? ' btn--active' : ''}`} onClick={onTogglePickOnMap} aria-pressed={pickingOnMap}>
              <PinIcon />
              {pickingOnMap ? 'Click the map' : 'Pick on map'}
            </button>
          </div>
        )}
        {observer && geoMessage && <p className="note note--warn">{geoMessage}</p>}

        <form className="coord-form" onSubmit={applyManualLocation}>
          <label className="field">
            <span>Latitude</span>
            <input inputMode="decimal" placeholder="51.5072" value={latInput} onChange={(e) => setLatInput(e.target.value)} />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input inputMode="decimal" placeholder="-0.1276" value={lonInput} onChange={(e) => setLonInput(e.target.value)} />
          </label>
          <button type="submit" className="btn btn--compact">Set</button>
        </form>
        {inputError && <p className="note note--warn">{inputError}</p>}

        <label className="range-field">
          <span className="range-head">
            <span>Minimum elevation</span>
            <b className="num">{minElevationDeg}°</b>
          </span>
          <input
            type="range" className="range" min={5} max={60} step={1} value={minElevationDeg}
            style={fillVar(minElevationDeg, 5, 60)}
            onChange={(e) => onMinElevationChange(Number(e.target.value))}
            aria-label="Minimum elevation above the horizon for a pass to count"
          />
          <span className="range-hint">Lower finds more passes; higher finds clearer ones above trees and buildings.</span>
        </label>

        {observer && (localTwilightTransition || closestApproachKm !== null) && (
          <dl className="facts">
            {localTwilightTransition && (
              <div>
                <dt>{localTwilightTransition.becomingDark ? 'Your sky gets dark in' : 'Your sky gets bright in'}</dt>
                <dd className="num">{formatDurationShort(localTwilightTransition.atMs - nowMs)}</dd>
              </div>
            )}
            {closestApproachKm !== null && (
              <div>
                <dt>Closest it has come this session</dt>
                <dd className="num">{Math.round(closestApproachKm).toLocaleString()} km</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <p className="fine-print">
        Predictions use a simplified circular orbit derived from live position fixes. Good for planning an evening of
        skywatching, not a substitute for a TLE-based ephemeris.
      </p>
    </aside>
  );
}
