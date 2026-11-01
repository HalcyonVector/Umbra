import type { CrewMember, OrbitalTelemetry } from '../types';
import { EARTH_RADIUS_KM } from '../orbital/greatCircle';
import { altitudeAsEverestMultiple, speedAsJetMultiple } from '../lib/scaleComparisons';

interface MissionPanelProps {
  telemetry: OrbitalTelemetry;
  crew: CrewMember[];
  crewCount: number | null;
  expedition: number | null;
  sunriseCount: number;
  sunsetCount: number;
  countriesOverflown: string[];
  orbitLapCount: number;
  totalDistanceKm: number;
  className?: string;
}

const EARTH_CIRCUMFERENCE_KM = 2 * Math.PI * EARTH_RADIUS_KM;

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function isIssCraft(craft: string) {
  return /iss|international|dragon|soyuz|starliner/i.test(craft);
}

function SessionStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="session-stat">
      <span className="session-stat-value num">{value}</span>
      <span className="session-stat-label">{label}</span>
      {sub && <span className="session-stat-sub">{sub}</span>}
    </div>
  );
}

/** Left panel: what this session has witnessed, plus who is up there right now. */
export function MissionPanel({
  telemetry, crew, crewCount, expedition, sunriseCount, sunsetCount,
  countriesOverflown, orbitLapCount, totalDistanceKm, className = '',
}: MissionPanelProps) {
  const earthTrips = totalDistanceKm / EARTH_CIRCUMFERENCE_KM;
  const tripsLabel = earthTrips < 1 ? `${Math.round(earthTrips * 100)}% of a lap around Earth` : `${earthTrips.toFixed(2)} laps around Earth`;

  const issCrew = crew.filter((c) => isIssCraft(c.craft));
  const otherCrew = crew.filter((c) => !isIssCraft(c.craft));
  const otherCraft = Array.from(new Set(otherCrew.map((c) => c.craft)));

  return (
    <aside className={`panel panel--left glass ${className}`} aria-label="Mission overview">
      <section className="card">
        <header className="card-head">
          <h2>This session</h2>
          <span className="card-hint">since you opened the tab</span>
        </header>
        <div className="session-grid">
          <SessionStat label="km flown" value={Math.round(totalDistanceKm).toLocaleString()} sub={totalDistanceKm > 0 ? tripsLabel : undefined} />
          <SessionStat label={orbitLapCount === 1 ? 'orbit done' : 'orbits done'} value={String(orbitLapCount)} sub={`now on orbit ${orbitLapCount + 1}`} />
          <SessionStat label="sunrises" value={String(sunriseCount)} />
          <SessionStat label="sunsets" value={String(sunsetCount)} />
        </div>
        <div className="fun-facts">
          <span>{altitudeAsEverestMultiple(telemetry.altitudeKm).toFixed(0)}x higher than Everest</span>
          {telemetry.orbitalSpeedKmS != null && <span>{speedAsJetMultiple(telemetry.orbitalSpeedKmS).toFixed(0)}x faster than a jetliner</span>}
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Countries overflown</h2>
          <span className="badge num">{countriesOverflown.length}</span>
        </header>
        {countriesOverflown.length === 0 ? (
          <p className="muted">None yet. Most of every orbit is spent over ocean, so give it a few minutes.</p>
        ) : (
          <ul className="chip-list">
            {[...countriesOverflown].reverse().map((name) => (
              <li key={name} className={`chip${name === telemetry.country ? ' chip--now' : ''}`}>
                {name === telemetry.country && <span className="chip-pulse" aria-hidden="true" />}
                {name}
                {name === telemetry.country && <span className="sr-only"> (overhead now)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h2>People in space</h2>
          <span className="badge num">{crewCount ?? '–'}</span>
        </header>
        {crew.length === 0 ? (
          <p className="muted">{crewCount === null ? 'Loading the crew roster.' : 'Crew roster unavailable right now.'}</p>
        ) : (
          <>
            {issCrew.length > 0 && (
              <div className="crew-group">
                <div className="crew-group-title">
                  International Space Station{expedition ? ` · Expedition ${expedition}` : ''}
                </div>
                <ul className="crew-list">
                  {issCrew.map((c) => (
                    <CrewRow key={c.name} member={c} />
                  ))}
                </ul>
              </div>
            )}
            {otherCraft.map((craft) => (
              <div className="crew-group" key={craft}>
                <div className="crew-group-title">{craft}</div>
                <ul className="crew-list">
                  {otherCrew.filter((c) => c.craft === craft).map((c) => (
                    <CrewRow key={c.name} member={c} />
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </section>
    </aside>
  );
}

function CrewRow({ member }: { member: CrewMember }) {
  const detail = [member.role, member.agency].filter(Boolean).join(' · ');
  return (
    <li className="crew-row">
      <span className="avatar" aria-hidden="true">{initials(member.name)}</span>
      <span className="crew-text">
        <span className="crew-name">{member.name}</span>
        {detail && <span className="crew-detail">{detail}</span>}
      </span>
    </li>
  );
}
