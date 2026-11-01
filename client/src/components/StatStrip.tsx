import type { OrbitalTelemetry, SolarState } from '../types';
import { ISS_MEAN_PERIOD_MIN } from '../orbital/orbitalMechanics';

interface StatStripProps {
  telemetry: OrbitalTelemetry;
  solarState: SolarState;
  hasFix: boolean;
}

const SOLAR_LABEL: Record<SolarState, string> = { day: 'Sunlit', night: 'In shadow', twilight: 'Terminator' };

// world-atlas uses formal names; a few are too long for a headline.
const SHORT_NAMES: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Rep.',
  'Bosnia and Herz.': 'Bosnia & Herz.',
};

function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

/** The headline numbers, always visible over the bottom of the map. */
export function StatStrip({ telemetry, solarState, hasFix }: StatStripProps) {
  const phase = Math.max(0, Math.min(1, telemetry.orbitalPhase));
  const remainingMin = Math.max(0, Math.round((1 - phase) * ISS_MEAN_PERIOD_MIN));
  const speedKmh = telemetry.orbitalSpeedKmS != null ? telemetry.orbitalSpeedKmS * 3600 : null;
  const dash = '–';

  return (
    <section className="stat-strip glass" aria-label="Live ISS telemetry">
      <div className="stat stat--wide">
        <span className="stat-label">Currently over</span>
        <span className="stat-value stat-value--text" title={telemetry.country ?? undefined}>
          {hasFix ? (telemetry.country ? SHORT_NAMES[telemetry.country] ?? telemetry.country : 'Open ocean') : 'Locating'}
        </span>
        <span className="stat-sub num">{telemetry.position ? formatLatLon(telemetry.position.lat, telemetry.position.lon) : dash}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Altitude</span>
        <span className="stat-value num">
          {Math.round(telemetry.altitudeKm)}
          <small>km</small>
        </span>
        <span className="stat-sub">{telemetry.measured ? 'measured' : 'estimated'}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Speed</span>
        <span className="stat-value num">
          {speedKmh != null ? Math.round(speedKmh).toLocaleString() : dash}
          <small>km/h</small>
        </span>
        <span className="stat-sub num">{telemetry.orbitalSpeedKmS != null ? `${telemetry.orbitalSpeedKmS.toFixed(2)} km/s` : dash}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Sunlight</span>
        <span className={`stat-value stat-value--text solar solar--${solarState}`}>
          <span className="solar-dot" aria-hidden="true" />
          {SOLAR_LABEL[solarState]}
        </span>
        <span className="stat-sub num" title="Sun elevation directly below the station">sun {telemetry.elevationDeg >= 0 ? '+' : ''}{telemetry.elevationDeg.toFixed(0)}°</span>
      </div>

      <div className="stat stat--orbit">
        <span className="stat-label">This orbit</span>
        <span className="stat-value num">
          {Math.round(phase * 100)}
          <small>%</small>
        </span>
        <div className="orbit-bar" aria-hidden="true">
          <span style={{ width: `${phase * 100}%` }} />
        </div>
        <span className="stat-sub num">{remainingMin} min to go</span>
      </div>
    </section>
  );
}
