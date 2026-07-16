import type { CrewMember, OrbitalTelemetry, SolarState } from '../types';
import { ISS_MEAN_PERIOD_MIN } from '../orbital/orbitalMechanics';
import { EARTH_RADIUS_KM } from '../orbital/greatCircle';
import { speedAsJetMultiple, altitudeAsEverestMultiple } from '../lib/scaleComparisons';

interface TelemetryRailProps {
  telemetry: OrbitalTelemetry;
  solarState: SolarState;
  crew: CrewMember[];
  sunriseCount: number;
  sunsetCount: number;
  countriesOverflown: string[];
  orbitLapCount: number;
  totalDistanceKm: number;
}

const EARTH_CIRCUMFERENCE_KM = 2 * Math.PI * EARTH_RADIUS_KM;

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const STATE_LABEL: Record<SolarState, string> = { day: 'Daylight', night: 'Night', twilight: 'Twilight' };

function StateIcon({ state }: { state: SolarState }) {
  if (state === 'day') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="8" cy="8" r="3.4" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" />
      </svg>
    );
  }
  if (state === 'night') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 9.4A5.6 5.6 0 1 1 6.6 3a4.5 4.5 0 0 0 6.4 6.4Z" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11" />
    </svg>
  );
}

function AltitudeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 13 L6.5 5 L9.5 9.5 L14 2.5" />
      <path d="M14 6.5V2.5H10" />
    </svg>
  );
}

function SpeedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M3 11.5A5.5 5.2 0 0 1 13 11.5" />
      <path d="M8 11.5 L10.6 7.2" />
      <circle cx="8" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function OrbitalSpeedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <ellipse cx="8" cy="8" rx="6.2" ry="3.1" transform="rotate(-14 8 8)" />
      <circle cx="13" cy="6.3" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c2.2 1.8 2.2 10.6 0 12.4C5.8 12.4 5.8 3.6 8 1.8Z" />
    </svg>
  );
}

function OdometerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12.5A6 6 0 1 1 14 12.5" />
      <path d="M8 8 5.6 5.6" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="details-chevron">
      <path d="M4.5 6 8 10 11.5 6" />
    </svg>
  );
}

function fmt(n: number, digits = 1) {
  return n.toFixed(digits);
}

/**
 * The left instrument cluster. An orbit-progress dial anchors a permanent
 * hero card; everything else (telemetry, crew, odometer, countries) is a
 * click-to-expand <details> section, open by default, matching the dock's
 * pattern — so on a narrow screen these can be collapsed instead of forcing
 * a long scroll before reaching the map.
 */
export function TelemetryRail({
  telemetry, solarState, crew, sunriseCount, sunsetCount,
  countriesOverflown, orbitLapCount, totalDistanceKm,
}: TelemetryRailProps) {
  const phase = Math.max(0, Math.min(1, telemetry.orbitalPhase));
  const dashOffset = RING_CIRCUMFERENCE * (1 - phase);
  const remainingMin = Math.max(0, Math.round((1 - phase) * ISS_MEAN_PERIOD_MIN));
  const earthTrips = totalDistanceKm / EARTH_CIRCUMFERENCE_KM;

  return (
    <aside className="rail" data-tour="rail">
      <div className="hud-card rail-card rail-card--hero">
        <div className="orbit-dial">
          <svg viewBox="0 0 108 108" width="108" height="108">
            <circle className="orbit-dial-track" cx="54" cy="54" r={RING_RADIUS} fill="none" strokeWidth="2.5" />
            <circle
              className="orbit-dial-progress"
              cx="54" cy="54" r={RING_RADIUS} fill="none" strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 54 54)"
            />
          </svg>
          <div className="orbit-dial-center">
            <span className="orbit-dial-pct num">{Math.round(phase * 100)}%</span>
            <span className="orbit-dial-rem">{remainingMin}M LEFT</span>
          </div>
        </div>
        <div className="orbit-lap-label num">Orbit {orbitLapCount + 1} this session</div>
        <div className="state-pill">
          <StateIcon state={solarState} />
          {STATE_LABEL[solarState]}
        </div>
        <div className="crossing-tally">
          <span>{sunriseCount} sunrises</span>
          <span>{sunsetCount} sunsets</span>
          <span className="crossing-tally-note">this session</span>
        </div>
      </div>

      <details className="hud-card rail-card" open>
        <summary className="rail-section-label dock-heading--clickable">
          <span><IconChevron /> Telemetry</span>
        </summary>
        <div className="telemetry-row">
          <span className="telemetry-icon"><AltitudeIcon /></span>
          <span>
            <span className="rail-label">Altitude</span>
            <span className="rail-value">{telemetry.altitudeKm.toFixed(0)}<small>km est.</small></span>
          </span>
        </div>
        <p className="rail-fun-fact">{fmt(altitudeAsEverestMultiple(telemetry.altitudeKm), 0)}× Mount Everest</p>

        <div className="telemetry-row">
          <span className="telemetry-icon"><SpeedIcon /></span>
          <span>
            <span className="rail-label">Ground speed</span>
            <span className="rail-value">
              {telemetry.groundSpeedKmh != null ? Math.round(telemetry.groundSpeedKmh).toLocaleString() : '—'}
              <small>km/h</small>
            </span>
          </span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-icon"><OrbitalSpeedIcon /></span>
          <span>
            <span className="rail-label">Orbital speed</span>
            <span className="rail-value">{telemetry.orbitalSpeedKmS != null ? fmt(telemetry.orbitalSpeedKmS, 2) : '—'}<small>km/s</small></span>
          </span>
        </div>
        {telemetry.orbitalSpeedKmS != null && (
          <p className="rail-fun-fact">{fmt(speedAsJetMultiple(telemetry.orbitalSpeedKmS), 0)}× a commercial jet</p>
        )}
      </details>

      <details className="hud-card rail-card" open>
        <summary className="rail-section-label dock-heading--clickable">
          <span><IconChevron /> Crew aboard</span>
        </summary>
        <div className="crew-row">
          {telemetry.crewCount > 0 ? (
            <>
              <div className="crew-dots" title={crew.length > 0 ? crew.map((c) => `${c.name} (${c.craft})`).join(', ') : undefined}>
                {Array.from({ length: telemetry.crewCount }).map((_, i) => (
                  <span key={i}></span>
                ))}
              </div>
              <span className="rail-value num" style={{ fontSize: '15px' }}>{telemetry.crewCount}</span>
            </>
          ) : (
            <span className="rail-value num" style={{ fontSize: '15px' }}>—</span>
          )}
        </div>
      </details>

      <details className="hud-card rail-card" open>
        <summary className="rail-section-label dock-heading--clickable">
          <span><IconChevron /> Session odometer</span>
        </summary>
        <div className="telemetry-row">
          <span className="telemetry-icon"><OdometerIcon /></span>
          <span>
            <span className="rail-label">Distance flown</span>
            <span className="rail-value">{Math.round(totalDistanceKm).toLocaleString()}<small>km</small></span>
          </span>
        </div>
        {earthTrips > 0.001 && (
          <p className="rail-fun-fact">
            {earthTrips < 1
              ? `${Math.round(earthTrips * 100)}% of the way around Earth`
              : `${fmt(earthTrips, 2)}× around Earth`}
          </p>
        )}
      </details>

      <details className="hud-card rail-card" open>
        <summary className="rail-section-label dock-heading--clickable">
          <span><IconChevron /> Countries overflown</span>
          <span className="rail-section-count num">{countriesOverflown.length}</span>
        </summary>
        {countriesOverflown.length === 0 ? (
          <p className="hud-note">None yet this session.</p>
        ) : (
          <div className="country-chips">
            {countriesOverflown.map((name) => (
              <span className="country-chip" key={name}>
                <GlobeIcon />
                {name}
              </span>
            ))}
          </div>
        )}
      </details>

      <div className="rail-foot">Position via Open Notify, with an automatic fallback feed if it's down. Altitude, speed, and orbit shape are derived, not reported.</div>
    </aside>
  );
}
