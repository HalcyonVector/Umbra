import { projectSkyPlot } from '../map/projection';
import type { PassPrediction } from '../orbital/eventPrediction';

const CENTER = 100;
const OUTER_RADIUS = 86; // elevation 0 (horizon)
const MID_RADIUS = OUTER_RADIUS * (2 / 3); // elevation 30
const INNER_RADIUS = OUTER_RADIUS * (1 / 3); // elevation 60

interface SkyPlotProps {
  pass: PassPrediction | null;
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function compassLabel(azimuthDeg: number): string {
  const normalized = ((azimuthDeg % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 22.5) % 16];
}

/**
 * A polar sky-plot — the chart real satellite-tracking software uses to
 * show where to physically point: elevation 90 (straight up) at the
 * center, the horizon at the outer ring, compass direction around the
 * edge. The track, rise/peak/set markers, and caption are all read
 * directly from a real predicted pass (orbital/eventPrediction.ts),
 * nothing here is illustrative.
 */
export function SkyPlot({ pass }: SkyPlotProps) {
  const track = pass?.track ?? [];
  const rise = track[0] ?? null;
  const set = track.length > 0 ? track[track.length - 1] : null;
  const peak = track.length > 0 ? track.reduce((best, p) => (p.elevationDeg > best.elevationDeg ? p : best), track[0]) : null;

  const trackPath = track
    .map((p, i) => {
      const { x, y } = projectSkyPlot(p.azimuthDeg, p.elevationDeg, OUTER_RADIUS, CENTER, CENTER);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const risePoint = rise ? projectSkyPlot(rise.azimuthDeg, rise.elevationDeg, OUTER_RADIUS, CENTER, CENTER) : null;
  const peakPoint = peak ? projectSkyPlot(peak.azimuthDeg, peak.elevationDeg, OUTER_RADIUS, CENTER, CENTER) : null;
  const setPoint = set ? projectSkyPlot(set.azimuthDeg, set.elevationDeg, OUTER_RADIUS, CENTER, CENTER) : null;

  return (
    <div className="skyplot-frame">
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
      <div className="skyplot-wrap">
        <svg viewBox="0 0 200 200" width={188} height={188} role="img" aria-label={pass ? 'Sky-plot of the next visible pass' : 'No upcoming pass'}>
          <defs>
            <filter id="skyplot-glow" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="5" result="b"></feGaussianBlur>
              <feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
            </filter>
            <linearGradient id="skyplot-track" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--line-strong)"></stop>
              <stop offset="0.5" stopColor="var(--accent)"></stop>
              <stop offset="1" stopColor="var(--line-strong)"></stop>
            </linearGradient>
          </defs>
          <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="none" stroke="var(--line)" strokeWidth={1} />
          <circle cx={CENTER} cy={CENTER} r={MID_RADIUS} fill="none" stroke="var(--line)" strokeWidth={1} />
          <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
          <line x1={CENTER} y1={14} x2={CENTER} y2={186} stroke="var(--panel-raised)" strokeWidth={1} />
          <line x1={14} y1={CENTER} x2={186} y2={CENTER} stroke="var(--panel-raised)" strokeWidth={1} />
          <text x={CENTER} y={11} textAnchor="middle" className="skyplot-compass-label">N</text>
          <text x={CENTER} y={197} textAnchor="middle" className="skyplot-compass-label">S</text>
          <text x={7} y={103} textAnchor="middle" className="skyplot-compass-label">W</text>
          <text x={193} y={103} textAnchor="middle" className="skyplot-compass-label">E</text>
          {trackPath && <path d={trackPath} fill="none" stroke="url(#skyplot-track)" strokeWidth={1.6} strokeLinecap="round" />}
          {risePoint && <circle cx={risePoint.x} cy={risePoint.y} r={2.6} fill="var(--text-muted)" />}
          {peakPoint && <circle cx={peakPoint.x} cy={peakPoint.y} r={4} fill="var(--accent)" filter="url(#skyplot-glow)" />}
          {setPoint && <circle cx={setPoint.x} cy={setPoint.y} r={2.6} fill="var(--text-muted)" />}
        </svg>
      </div>
      <div className="skyplot-caption">
        {pass && rise && peak && set
          ? `RISE ${compassLabel(rise.azimuthDeg)} ${Math.round(rise.elevationDeg)}° → PEAK ${Math.round(peak.elevationDeg)}° → SET ${compassLabel(set.azimuthDeg)} ${Math.round(set.elevationDeg)}°`
          : 'No upcoming pass to plot yet'}
      </div>
    </div>
  );
}
