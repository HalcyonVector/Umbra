import { useState, type CSSProperties } from 'react';
import type { LocationPreset } from '../types';
import type { LocationSource } from '../lib/presetsStore';
import type { PassPrediction, CrossingPrediction } from '../orbital/eventPrediction';
import { formatDurationShort } from '../lib/formatTime';
import { SkyPlot } from './SkyPlot';

export type GeolocationStatus = 'idle' | 'locating' | 'denied' | 'unsupported' | 'error';

interface PredictorDockProps {
  observer: { lat: number; lon: number } | null;
  onSetObserver: (loc: { lat: number; lon: number }) => void;
  minElevationDeg: number;
  onMinElevationChange: (v: number) => void;
  passes: PassPrediction[];
  crossings: CrossingPrediction[];
  telemetryReady: boolean;
  nowMs: number;
  geolocationStatus: GeolocationStatus;
  onUseMyLocation: () => void;
  locations: LocationPreset[];
  locationsSource: LocationSource;
  locationName: string;
  onLocationNameChange: (v: string) => void;
  onSaveLocation: () => void;
  onLoadLocation: (name: string) => void;
  onDeleteLocation: (name: string) => void;
  onCopyShareLink: () => void;
  linkCopied: boolean;
}

type ManifestEntry =
  | { kind: 'pass'; atMs: number; pass: PassPrediction }
  | { kind: 'sunrise' | 'sunset'; atMs: number };

function buildManifest(passes: PassPrediction[], crossings: CrossingPrediction[]): ManifestEntry[] {
  const passEntries: ManifestEntry[] = passes.map((p) => ({ kind: 'pass', atMs: p.startMs, pass: p }));
  const crossingEntries: ManifestEntry[] = crossings.map((c) => ({ kind: c.direction, atMs: c.atMs }));
  return [...passEntries, ...crossingEntries].sort((a, b) => a.atMs - b.atMs);
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

function IconLink() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6.5 9.5 9.5 6.5"></path>
      <path d="M7 4.2 8.3 2.9a2.6 2.6 0 0 1 3.7 3.7L10.7 7.9M9 11.8l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7L5.3 8.1"></path>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.2 8.4 6.3 11.5 12.8 5"></path>
    </svg>
  );
}

function IconPlay() {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none">
      <path d="M4.5 3.3v9.4a.6.6 0 0 0 .93.5l7.3-4.7a.6.6 0 0 0 0-1l-7.3-4.7a.6.6 0 0 0-.93.5Z"></path>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.3 4.7h9.4"></path>
      <path d="M6.2 4.7V3.3h3.6v1.4M6.7 7.3v3.6M9.3 7.3v3.6"></path>
      <path d="M4.4 4.7 5 12.1c.05.6.55 1 1.15 1h3.7c.6 0 1.1-.4 1.15-1l.6-7.4"></path>
    </svg>
  );
}

const GEO_STATUS_LABEL: Record<GeolocationStatus, string | null> = {
  idle: null,
  locating: 'Locating…',
  denied: 'Location permission denied — enter coordinates manually.',
  unsupported: 'Geolocation isn\'t available in this browser — enter coordinates manually.',
  error: 'Could not get your location — enter coordinates manually.',
};

/** The permanent right dock: where you're watching from, the sky-plot for the next pass, and what's coming up. */
export function PredictorDock({
  observer, onSetObserver, minElevationDeg, onMinElevationChange,
  passes, crossings, telemetryReady, nowMs,
  geolocationStatus, onUseMyLocation,
  locations, locationsSource, locationName, onLocationNameChange, onSaveLocation, onLoadLocation, onDeleteLocation,
  onCopyShareLink, linkCopied,
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
  const manifest = buildManifest(passes, crossings).slice(0, 6);

  return (
    <aside className="dock">
      <div>
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
        ) : (
          <div className="next-pass">
            <span className="next-pass-meta">
              {!observer
                ? 'Set a location below to predict visible passes.'
                : !telemetryReady
                  ? 'Waiting for live ISS telemetry to derive an orbit…'
                  : 'No passes bright enough in the next 24 hours from here.'}
            </span>
          </div>
        )}
      </div>

      <SkyPlot pass={nextPass} />

      <div className="hud-card">
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
      </div>

      <div className="hud-card">
        <div className="dock-heading" style={{ marginBottom: 6 }}>Manifest</div>
        {!telemetryReady ? (
          <p className="hud-note">Waiting for live ISS telemetry to derive an orbit…</p>
        ) : manifest.length === 0 ? (
          <p className="hud-note">Nothing upcoming in the prediction window.</p>
        ) : (
          <div className="manifest">
            {manifest.map((entry) => (
              <div className="manifest-row" key={`${entry.kind}-${entry.atMs}`}>
                <span className="manifest-kind">
                  <span className={`manifest-dot ${entry.kind === 'pass' ? 'pass' : entry.kind === 'sunrise' ? 'day' : 'night'}`}></span>
                  {entry.kind === 'pass' ? 'Visible pass' : entry.kind === 'sunrise' ? 'Sunrise' : 'Sunset'}
                </span>
                <span className="manifest-time num">in {formatDurationShort(entry.atMs - nowMs)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hud-card">
        <div className="dock-heading" style={{ marginBottom: 10 }}>
          Saved locations
          {locationsSource === 'local' && <span className="badge">offline</span>}
        </div>
        <div className="preset-save-row">
          <input
            type="text" placeholder="Name this location…" value={locationName}
            onChange={(e) => onLocationNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && locationName.trim() && observer) onSaveLocation();
            }}
          />
          <button onClick={onSaveLocation} disabled={!locationName.trim() || !observer}>Save</button>
        </div>
        <button
          className={linkCopied ? 'share-link-btn share-link-btn--copied' : 'share-link-btn'}
          onClick={onCopyShareLink}
          disabled={!observer}
        >
          {linkCopied ? <IconCheck /> : <IconLink />}
          {linkCopied ? 'Link copied' : 'Copy share link'}
        </button>

        {locations.length > 0 && (
          <ul className="presets-list">
            {locations.map((loc) => (
              <li key={loc.name}>
                <span>{loc.name}</span>
                <button className="preset-action-btn" onClick={() => onLoadLocation(loc.name)} aria-label={`Load location ${loc.name}`}>
                  <IconPlay /> Load
                </button>
                <button className="preset-action-btn preset-action-btn--danger" onClick={() => onDeleteLocation(loc.name)} aria-label={`Delete location ${loc.name}`}>
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="dock-footnote">
        Predictions assume a circular, non-precessing orbit at a fixed known inclination — accurate over the
        windows shown here, not a substitute for a real TLE-based ephemeris.
      </p>
    </aside>
  );
}
