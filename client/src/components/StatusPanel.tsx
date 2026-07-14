import type { OrbitalParams, OrbitalTelemetry, SolarState } from '../types';
import { formatDurationShort } from '../lib/formatTime';

interface StatusPanelProps {
  telemetry: OrbitalTelemetry;
  params: OrbitalParams;
}

function fmt(n: number, digits = 1) {
  return n.toFixed(digits);
}

const STATE_LABEL: Record<SolarState, string> = {
  day: 'Daylight',
  night: 'Night',
  twilight: 'Twilight (near terminator)',
};

export function StatusPanel({ telemetry, params }: StatusPanelProps) {
  return (
    <div className="status-panel">
      <section className="hud-card">
        <h3>Orbital inputs</h3>
        <dl>
          <dt>Altitude</dt>
          <dd>{telemetry.altitudeKm.toFixed(0)} km (est.)</dd>
          <dt>Ground speed</dt>
          <dd>{telemetry.groundSpeedKmh != null ? `${Math.round(telemetry.groundSpeedKmh).toLocaleString()} km/h` : 'measuring…'}</dd>
          <dt>Orbital speed</dt>
          <dd>{telemetry.orbitalSpeedKmS != null ? `${fmt(telemetry.orbitalSpeedKmS, 2)} km/s` : 'measuring…'}</dd>
          <dt>State</dt>
          <dd>{STATE_LABEL[telemetry.state]}</dd>
          <dt>Currently over</dt>
          <dd>{telemetry.country ?? 'Open ocean'}</dd>
          <dt>Crew in space</dt>
          <dd>{telemetry.crewCount > 0 ? telemetry.crewCount : 'counting…'}</dd>
          <dt>Next crossing (predicted)</dt>
          <dd>
            {telemetry.nextCrossing
              ? `${telemetry.nextCrossing.direction === 'sunrise' ? 'Sunrise' : 'Sunset'} in ~${formatDurationShort(telemetry.nextCrossing.deltaMs)}`
              : 'not predicted yet'}
          </dd>
        </dl>
      </section>
      <section className="hud-card">
        <h3>Resolved drone</h3>
        <dl>
          <dt>Density</dt>
          <dd>{fmt(params.droneDensity * 100, 0)}%</dd>
          <dt>Layers</dt>
          <dd>{params.layerCount}</dd>
          <dt>Brightness</dt>
          <dd>{fmt(params.brightness * 100, 0)}%</dd>
          <dt>Filter cutoff</dt>
          <dd>{Math.round(params.filterCutoffHz)} Hz</dd>
          <dt>Drift rate</dt>
          <dd>{fmt(params.driftRate, 2)} Hz</dd>
          <dt>Root offset</dt>
          <dd>
            {params.rootSemitone >= 0 ? '+' : ''}
            {fmt(params.rootSemitone, 1)} st
          </dd>
          <dt>Warmth</dt>
          <dd>{fmt(params.warmth * 100, 0)}%</dd>
        </dl>
      </section>
    </div>
  );
}
