import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed) so the map
// is real cartography with no external map-tile API or key — the same
// asset Fault-Line uses for its coastlines, matching this portfolio's "the
// background IS the interface" ethos.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, pathFromTrail, projectEquirectangular, computeNightMaskGrid, type LatLonLike } from '../map/projection';

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 500;
const NIGHT_GRID_COLS = 120;
const NIGHT_GRID_ROWS = 60;
const CROSSING_PULSE_MS = 3200;

interface MapSceneProps {
  position: LatLonLike | null;
  trail: LatLonLike[];
  nowMs: number;
  vignette: number; // 0..1 — deepens toward night
  crossingPulse: { key: number; direction: 'sunrise' | 'sunset' } | null;
}

/**
 * Full-viewport world map: real land silhouettes, a live day/night shading
 * raster sampled directly from solar geometry (see map/projection.ts's
 * computeNightMaskGrid), a fading ground-track trail, and a pulsing ISS
 * marker. This is the visual read-out of exactly what the audio engine is
 * reacting to — the same "background IS the interface" philosophy as
 * Fault-Line's ripple map and Petrichor's sky gradient, just aimed at orbit
 * instead of the crust or the weather.
 */
export function MapScene({ position, trail, nowMs, vignette, crossingPulse }: MapSceneProps) {
  const nightCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pulseActive, setPulseActive] = useState(false);

  const landPaths = useMemo(() => {
    const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, VIEW_WIDTH, VIEW_HEIGHT);
    try {
      const topology = worldTopology as unknown as Parameters<typeof feature>[0];
      const objects = (topology as { objects: Record<string, unknown> }).objects;
      const landObject = objects.land as Parameters<typeof feature>[1];
      const geo = feature(topology, landObject) as unknown as {
        type: string;
        features?: { geometry: { type: string; coordinates: unknown } }[];
        geometry?: { type: string; coordinates: unknown };
      };
      if (geo.type === 'FeatureCollection' && geo.features) {
        return geo.features.map((f) => geometryToSvgPath(f.geometry, project));
      }
      if (geo.geometry) return [geometryToSvgPath(geo.geometry, project)];
      return [];
    } catch {
      return [];
    }
  }, []);

  // The terminator moves slowly (~0.25deg/minute) — recomputing the night
  // mask on minute granularity rather than every render keeps this cheap.
  const minuteKey = Math.floor(nowMs / 60_000);
  useEffect(() => {
    const canvas = nightCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grid = computeNightMaskGrid(new Date(nowMs), NIGHT_GRID_COLS, NIGHT_GRID_ROWS);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(4, 6, 16, 0.62)';
    const cellW = canvas.width / NIGHT_GRID_COLS;
    const cellH = canvas.height / NIGHT_GRID_ROWS;
    for (let row = 0; row < NIGHT_GRID_ROWS; row++) {
      for (let col = 0; col < NIGHT_GRID_COLS; col++) {
        if (grid[row][col]) ctx.fillRect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);

  useEffect(() => {
    if (!crossingPulse) return;
    setPulseActive(true);
    const id = setTimeout(() => setPulseActive(false), CROSSING_PULSE_MS);
    return () => clearTimeout(id);
  }, [crossingPulse]);

  const projected = position ? projectEquirectangular(position.lon, position.lat, VIEW_WIDTH, VIEW_HEIGHT) : null;
  const trailPath = useMemo(
    () => pathFromTrail(trail, (lon, lat) => projectEquirectangular(lon, lat, VIEW_WIDTH, VIEW_HEIGHT), VIEW_WIDTH),
    [trail],
  );

  const vignetteOpacity = 0.1 + Math.max(0, Math.min(1, vignette)) * 0.5;

  return (
    <div className="map-scene" aria-hidden="true">
      <svg className="map-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} className="map-ocean" />
        {landPaths.map((d, i) => (
          <path key={i} d={d} className="map-land" />
        ))}
        {trailPath && <path d={trailPath} className="map-trail" fill="none" />}
        {projected && (
          <g className="map-iss">
            <circle cx={projected.x} cy={projected.y} r={10} className="map-iss-halo" />
            <circle cx={projected.x} cy={projected.y} r={3.2} className="map-iss-dot" />
          </g>
        )}
      </svg>

      <canvas ref={nightCanvasRef} width={NIGHT_GRID_COLS * 2} height={NIGHT_GRID_ROWS * 2} className="map-night-canvas" />

      <div className="map-vignette" style={{ opacity: vignetteOpacity }} />

      {crossingPulse && (
        <div
          key={crossingPulse.key}
          className={`map-crossing-pulse map-crossing-pulse--${crossingPulse.direction}${pulseActive ? ' map-crossing-pulse--active' : ''}`}
        />
      )}
    </div>
  );
}
