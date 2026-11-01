import { projectSkyPlot } from '../map/projection';
import { compassLabel } from '../lib/compass';
import type { PassPrediction } from '../orbital/eventPrediction';

const CENTER = 110;
const OUTER_RADIUS = 92; // elevation 0 (horizon)

interface SkyPlotProps {
  pass: PassPrediction | null;
}

/**
 * A polar sky chart, the view satellite trackers use to know where to point:
 * straight up at the center, the horizon at the outer ring, compass
 * directions around the edge. Track and markers come from a real predicted
 * pass (orbital/eventPrediction.ts).
 */
export function SkyPlot({ pass }: SkyPlotProps) {
  const track = pass?.track ?? [];
  const rise = track[0] ?? null;
  const set = track.length > 0 ? track[track.length - 1] : null;
  const peak = track.length > 0 ? track.reduce((best, p) => (p.elevationDeg > best.elevationDeg ? p : best), track[0]) : null;

  const project = (az: number, el: number) => projectSkyPlot(az, el, OUTER_RADIUS, CENTER, CENTER);
  const trackPath = track
    .map((p, i) => {
      const { x, y } = project(p.azimuthDeg, p.elevationDeg);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const risePoint = rise ? project(rise.azimuthDeg, rise.elevationDeg) : null;
  const peakPoint = peak ? project(peak.azimuthDeg, peak.elevationDeg) : null;
  const setPoint = set ? project(set.azimuthDeg, set.elevationDeg) : null;

  const rings = [0, 30, 60].map((el) => ({ el, r: OUTER_RADIUS * (1 - el / 90) }));
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <figure className="skyplot">
      <svg viewBox="0 0 220 220" role="img" aria-label={pass && rise && set ? `Sky chart: rises in the ${compassLabel(rise.azimuthDeg)}, sets in the ${compassLabel(set.azimuthDeg)}` : 'Sky chart, no pass to show yet'}>
        <defs>
          <radialGradient id="sky-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#14203a" />
            <stop offset="1" stopColor="#0a0f1c" />
          </radialGradient>
          <linearGradient id="sky-track" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5eead4" stopOpacity="0.35" />
            <stop offset="0.5" stopColor="#5eead4" />
            <stop offset="1" stopColor="#5eead4" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="url(#sky-bg)" stroke="rgba(255,255,255,0.14)" />
        {rings.slice(1).map(({ el, r }) => (
          <g key={el}>
            <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3" />
            <text x={CENTER + 3} y={CENTER - r - 2} className="skyplot-ring-label">{el}°</text>
          </g>
        ))}
        {ticks.map((az) => {
          const a = ((az - 90) * Math.PI) / 180;
          const inner = az % 90 === 0 ? OUTER_RADIUS - 7 : OUTER_RADIUS - 4;
          return (
            <line
              key={az}
              x1={CENTER + Math.cos(a) * inner} y1={CENTER + Math.sin(a) * inner}
              x2={CENTER + Math.cos(a) * OUTER_RADIUS} y2={CENTER + Math.sin(a) * OUTER_RADIUS}
              stroke="rgba(255,255,255,0.25)"
            />
          );
        })}
        <text x={CENTER} y={12} textAnchor="middle" className="skyplot-compass">N</text>
        <text x={CENTER} y={216} textAnchor="middle" className="skyplot-compass">S</text>
        <text x={8} y={CENTER + 4} textAnchor="middle" className="skyplot-compass">W</text>
        <text x={212} y={CENTER + 4} textAnchor="middle" className="skyplot-compass">E</text>
        <circle cx={CENTER} cy={CENTER} r={1.6} fill="rgba(255,255,255,0.35)" />

        {trackPath && <path d={trackPath} fill="none" stroke="url(#sky-track)" strokeWidth={2.4} strokeLinecap="round" />}
        {risePoint && <circle cx={risePoint.x} cy={risePoint.y} r={3.4} fill="#0a0f1c" stroke="#5eead4" strokeWidth={1.6} />}
        {setPoint && <circle cx={setPoint.x} cy={setPoint.y} r={3.4} fill="#0a0f1c" stroke="#94a3b8" strokeWidth={1.6} />}
        {peakPoint && (
          <>
            <circle cx={peakPoint.x} cy={peakPoint.y} r={9} fill="#5eead4" opacity={0.18} />
            <circle cx={peakPoint.x} cy={peakPoint.y} r={4.2} fill="#5eead4" />
          </>
        )}
      </svg>
      <figcaption className="skyplot-legend">
        {pass && rise && peak && set ? (
          <>
            <span><i className="lg lg--rise" />Rises {compassLabel(rise.azimuthDeg)}</span>
            <span><i className="lg lg--peak" />Peak {Math.round(peak.elevationDeg)}° {compassLabel(peak.azimuthDeg)}</span>
            <span><i className="lg lg--set" />Sets {compassLabel(set.azimuthDeg)}</span>
          </>
        ) : (
          <span>The path across your sky appears here once a pass is predicted.</span>
        )}
      </figcaption>
    </figure>
  );
}
