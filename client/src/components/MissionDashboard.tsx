import type { CrewMember, OrbitalTelemetry, SolarState } from '../types';
import { ISS_MEAN_PERIOD_MIN } from '../orbital/orbitalMechanics';

interface MissionDashboardProps {
  telemetry: OrbitalTelemetry;
  solarState: SolarState;
  crew: CrewMember[];
  sunriseCount: number;
  sunsetCount: number;
}

function fmt(n: number, digits = 1) {
  return n.toFixed(digits);
}

const STATE_LABEL: Record<SolarState, string> = {
  day: 'Daylight',
  night: 'Night',
  twilight: 'Twilight (near terminator)',
};

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** A small progress ring showing how far through the current ~92.68-minute orbit the ISS is right now. */
function OrbitRing({ phase }: { phase: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - phase);
  const remainingMin = Math.max(0, Math.round((1 - phase) * ISS_MEAN_PERIOD_MIN));
  return (
    <div className="orbit-ring">
      <svg viewBox="0 0 60 60" width={60} height={60}>
        <circle cx={30} cy={30} r={RING_RADIUS} className="orbit-ring-track" fill="none" strokeWidth={4} />
        <circle
          cx={30}
          cy={30}
          r={RING_RADIUS}
          className="orbit-ring-progress"
          fill="none"
          strokeWidth={4}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 30 30)"
        />
      </svg>
      <div className="orbit-ring-label">
        <b>{Math.round(phase * 100)}%</b>
        <span>{remainingMin}m left</span>
      </div>
    </div>
  );
}

export function MissionDashboard({ telemetry, solarState, crew, sunriseCount, sunsetCount }: MissionDashboardProps) {
  return (
    <div className="mission-dashboard">
      <section className="hud-card">
        <h3>Orbit</h3>
        <div className="orbit-row">
          <OrbitRing phase={telemetry.orbitalPhase} />
          <dl>
            <dt>Altitude</dt>
            <dd>{telemetry.altitudeKm.toFixed(0)} km (est.)</dd>
            <dt>Ground speed</dt>
            <dd>{telemetry.groundSpeedKmh != null ? `${Math.round(telemetry.groundSpeedKmh).toLocaleString()} km/h` : 'measuring…'}</dd>
            <dt>Orbital speed</dt>
            <dd>{telemetry.orbitalSpeedKmS != null ? `${fmt(telemetry.orbitalSpeedKmS, 2)} km/s` : 'measuring…'}</dd>
            <dt>State</dt>
            <dd>{STATE_LABEL[solarState]}</dd>
            <dt>Currently over</dt>
            <dd>{telemetry.country ?? 'Open ocean'}</dd>
          </dl>
        </div>
      </section>

      <section className="hud-card">
        <h3>Terminator crossings today</h3>
        <div className="crossing-counters">
          <div>
            <b>{sunriseCount}</b>
            <span>sunrises</span>
          </div>
          <div>
            <b>{sunsetCount}</b>
            <span>sunsets</span>
          </div>
        </div>
        <p className="hud-note">The crew sees roughly 16 of each every 24 hours — counted here since you opened Umbra, detected the instant real solar geometry says it happened.</p>
      </section>

      <section className="hud-card">
        <h3>
          <span>Crew in space</span>
          <span className="badge">{telemetry.crewCount}</span>
        </h3>
        {crew.length > 0 ? (
          <ul className="crew-list">
            {crew.map((c) => (
              <li key={c.name}>
                <span>{c.name}</span>
                <span className="crew-craft">{c.craft}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hud-note">Crew roster unavailable right now.</p>
        )}
      </section>
    </div>
  );
}
