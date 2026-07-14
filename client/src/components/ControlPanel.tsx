import type { CSSProperties } from 'react';
import type { MixLayer } from '../audio/AudioEngine';
import type { Preset } from '../types';
import type { PresetSource } from '../lib/presetsStore';

export interface SimState {
  lat: number;
  lon: number;
  utcHour: number;
}

const MIX_LAYERS: { key: MixLayer; label: string }[] = [
  { key: 'drone', label: 'Drone' },
  { key: 'crossing', label: 'Crossing' },
  { key: 'beacon', label: 'Beacon' },
];

interface ControlPanelProps {
  simulate: boolean;
  onToggleSimulate: (v: boolean) => void;
  sim: SimState;
  onSimChange: (patch: Partial<SimState>) => void;
  onTriggerCrossing: (direction: 'sunrise' | 'sunset') => void;
  onTriggerBeacon: () => void;
  crossingSensitivityDeg: number;
  onSensitivityChange: (v: number) => void;
  mix: Record<MixLayer, number>;
  onMixChange: (layer: MixLayer, value: number) => void;
  presets: Preset[];
  presetsSource: PresetSource;
  presetName: string;
  onPresetNameChange: (v: string) => void;
  onSavePreset: () => void;
  onLoadPreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  onCopyShareLink: () => void;
  linkCopied: boolean;
}

function fillVar(value: number, min: number, max: number): CSSProperties {
  return { '--val': (value - min) / (max - min) } as CSSProperties;
}

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconLink() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6.5 9.5 9.5 6.5" />
      <path d="M7 4.2 8.3 2.9a2.6 2.6 0 0 1 3.7 3.7L10.7 7.9M9 11.8l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7L5.3 8.1" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.2 8.4 6.3 11.5 12.8 5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none">
      <path d="M4.5 3.3v9.4a.6.6 0 0 0 .93.5l7.3-4.7a.6.6 0 0 0 0-1l-7.3-4.7a.6.6 0 0 0-.93.5Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.3 4.7h9.4" />
      <path d="M6.2 4.7V3.3h3.6v1.4M6.7 7.3v3.6M9.3 7.3v3.6" />
      <path d="M4.4 4.7 5 12.1c.05.6.55 1 1.15 1h3.7c.6 0 1.1-.4 1.15-1l.6-7.4" />
    </svg>
  );
}

function IconOrbit() {
  return (
    <svg {...ICON_PROPS} width={22} height={22}>
      <ellipse cx="8" cy="8" rx="6.4" ry="3" transform="rotate(-20 8 8)" />
      <circle cx="12.6" cy="6.1" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The "Telemetry" drawer: crossing sensitivity, simulate mode, mixer, and presets — everything that shapes the sound but isn't part of the primary now-playing tray. */
export function ControlPanel({
  simulate, onToggleSimulate, sim, onSimChange, onTriggerCrossing, onTriggerBeacon,
  crossingSensitivityDeg, onSensitivityChange,
  mix, onMixChange,
  presets, presetsSource, presetName, onPresetNameChange, onSavePreset, onLoadPreset, onDeletePreset,
  onCopyShareLink, linkCopied,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <div className="hud-card">
        <h3>Source</h3>
        <div className="segmented">
          <button
            type="button"
            className={!simulate ? 'segmented-btn segmented-btn--active' : 'segmented-btn'}
            aria-pressed={!simulate}
            onClick={() => onToggleSimulate(false)}
          >
            Live
          </button>
          <button
            type="button"
            className={simulate ? 'segmented-btn segmented-btn--active' : 'segmented-btn'}
            aria-pressed={simulate}
            onClick={() => onToggleSimulate(true)}
          >
            Simulate
          </button>
        </div>

        {!simulate && (
          <div className="live-status">
            <span className="live-dot" />
            Following the ISS's real position: a sunrise or sunset crossing swells the drone the instant real
            solar geometry says it happens.
          </div>
        )}

        <label className="threshold-row">
          <span>Crossing sensitivity</span>
          <b>±{crossingSensitivityDeg.toFixed(0)}°</b>
          <input
            type="range" className="hud-range" min={2} max={15} step={1} value={crossingSensitivityDeg}
            style={fillVar(crossingSensitivityDeg, 2, 15)}
            onChange={(e) => onSensitivityChange(Number(e.target.value))}
            aria-label="Terminator crossing sensitivity band, in degrees of solar elevation"
          />
        </label>

        {simulate && (
          <div className="sim-sliders">
            <label>
              <span>Latitude</span>
              <b>{sim.lat.toFixed(0)}°</b>
              <input
                type="range" className="hud-range" min={-85} max={85} step={1} value={sim.lat}
                style={fillVar(sim.lat, -85, 85)}
                onChange={(e) => onSimChange({ lat: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Longitude</span>
              <b>{sim.lon.toFixed(0)}°</b>
              <input
                type="range" className="hud-range" min={-180} max={180} step={1} value={sim.lon}
                style={fillVar(sim.lon, -180, 180)}
                onChange={(e) => onSimChange({ lon: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>UTC hour</span>
              <b>{sim.utcHour.toFixed(1)}h</b>
              <input
                type="range" className="hud-range" min={0} max={24} step={0.25} value={sim.utcHour}
                style={fillVar(sim.utcHour, 0, 24)}
                onChange={(e) => onSimChange({ utcHour: Number(e.target.value) })}
              />
            </label>
            <div className="sim-trigger-row">
              <button onClick={() => onTriggerCrossing('sunrise')}>Trigger sunrise</button>
              <button onClick={() => onTriggerCrossing('sunset')} className="ghost">
                Trigger sunset
              </button>
            </div>
            <div className="sim-trigger-row">
              <button onClick={onTriggerBeacon} className="ghost">
                Ping beacon
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="hud-card">
        <h3>Mixer</h3>
        <div className="mixer-sliders">
          {MIX_LAYERS.map(({ key, label }) => (
            <label key={key}>
              <span>{label}</span>
              <b>{Math.round(mix[key] * 100)}%</b>
              <input
                type="range" className="hud-range" min={0} max={1.5} step={0.01} value={mix[key]}
                style={fillVar(mix[key], 0, 1.5)}
                onChange={(e) => onMixChange(key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="hud-card">
        <h3>
          <span>Presets</span>
          {presetsSource === 'local' && <span className="badge">offline · saved locally</span>}
        </h3>
        <div className="preset-save-row">
          <input
            type="text" placeholder="Name this sensitivity…" value={presetName}
            onChange={(e) => onPresetNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && presetName.trim()) onSavePreset();
            }}
          />
          <button onClick={onSavePreset} disabled={!presetName.trim()}>Save</button>
        </div>
        <button
          className={linkCopied ? 'share-link-btn share-link-btn--copied' : 'share-link-btn'}
          onClick={onCopyShareLink}
        >
          {linkCopied ? <IconCheck /> : <IconLink />}
          {linkCopied ? 'Link copied' : 'Copy share link'}
        </button>

        {presets.length > 0 ? (
          <ul className="presets-list">
            {presets.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <button
                  className="preset-action-btn"
                  onClick={() => onLoadPreset(p.name)}
                  aria-label={`Load preset ${p.name}`}
                >
                  <IconPlay /> Load
                </button>
                <button
                  className="preset-action-btn preset-action-btn--danger"
                  onClick={() => onDeletePreset(p.name)}
                  aria-label={`Delete preset ${p.name}`}
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="presets-empty">
            <IconOrbit />
            <p>
              No presets saved yet.
              <br />
              Dial in a sensitivity and save it here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
