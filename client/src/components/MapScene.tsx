import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed) so the map
// is real cartography with no external map-tile API or key.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, pathFromTrail, projectEquirectangular, computeNightMaskGrid, type LatLonLike } from '../map/projection';

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 500;
const NIGHT_GRID_COLS = 120;
const NIGHT_GRID_ROWS = 60;
const CROSSING_PULSE_MS = 3200;

// Colors are inlined as literal values (not CSS custom properties or
// classNames) deliberately: the "export as PNG" feature serializes this
// SVG standalone, outside the page's stylesheet context, so anything
// styled only via App.css would render unstyled in the exported image.
const OCEAN_FILL = '#090b18';
const LAND_FILL = '#171b30';
const LAND_STROKE = 'rgba(205, 214, 244, 0.14)';
const OBSERVED_TRAIL_STROKE = '#cdd6f4';
const PREDICTED_TRAIL_STROKE = 'rgba(205, 214, 244, 0.5)';
const ISS_HALO_STROKE = '#eef2ff';
const ISS_DOT_FILL = '#eef2ff';
const OBSERVER_FILL = '#f2c14e';
const OBSERVER_STROKE = '#0a0e1c';

interface MapSceneProps {
  position: LatLonLike | null;
  observedTrail: LatLonLike[];
  predictedTrail: LatLonLike[];
  observer: LatLonLike | null;
  nowMs: number;
  vignette: number; // 0..1 — deepens toward night
  crossingPulse: { key: number; direction: 'sunrise' | 'sunset' } | null;
  svgRef?: RefObject<SVGSVGElement>;
  nightCanvasRef?: RefObject<HTMLCanvasElement>;
}

/**
 * Full-viewport world map: real land silhouettes, a live day/night shading
 * raster sampled directly from solar geometry, a growing "living
 * cartography" trail of everywhere the ISS has actually been (persisted
 * across sessions — see lib/trailStore.ts), a dashed preview of where it's
 * headed next (from the orbital propagator), and — once a viewing location
 * is set — a marker for the observer themselves.
 */
export function MapScene({ position, observedTrail, predictedTrail, observer, nowMs, vignette, crossingPulse, svgRef, nightCanvasRef }: MapSceneProps) {
  const internalSvgRef = useRef<SVGSVGElement>(null);
  const internalNightCanvasRef = useRef<HTMLCanvasElement>(null);
  const resolvedSvgRef = svgRef ?? internalSvgRef;
  const resolvedNightCanvasRef = nightCanvasRef ?? internalNightCanvasRef;

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
    const canvas = resolvedNightCanvasRef.current;
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

  const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, VIEW_WIDTH, VIEW_HEIGHT);
  const projected = position ? project(position.lon, position.lat) : null;
  const projectedObserver = observer ? project(observer.lon, observer.lat) : null;

  const observedTrailPath = useMemo(() => pathFromTrail(observedTrail, project, VIEW_WIDTH), [observedTrail]);
  const predictedTrailPath = useMemo(() => pathFromTrail(predictedTrail, project, VIEW_WIDTH), [predictedTrail]);

  const vignetteOpacity = 0.1 + Math.max(0, Math.min(1, vignette)) * 0.5;

  return (
    <div className="map-scene" aria-hidden="true">
      <svg ref={resolvedSvgRef} className="map-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={OCEAN_FILL} />
        {landPaths.map((d, i) => (
          <path key={i} d={d} fill={LAND_FILL} stroke={LAND_STROKE} strokeWidth={0.6} />
        ))}
        {predictedTrailPath && (
          <path d={predictedTrailPath} fill="none" stroke={PREDICTED_TRAIL_STROKE} strokeWidth={1.2} strokeDasharray="4 4" strokeLinecap="round" />
        )}
        {observedTrailPath && (
          <path d={observedTrailPath} fill="none" stroke={OBSERVED_TRAIL_STROKE} strokeWidth={1.4} strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {projectedObserver && (
          <g>
            <circle cx={projectedObserver.x} cy={projectedObserver.y} r={5} fill={OBSERVER_FILL} stroke={OBSERVER_STROKE} strokeWidth={1.5} />
            <circle cx={projectedObserver.x} cy={projectedObserver.y} r={9} fill="none" stroke={OBSERVER_FILL} strokeWidth={1} strokeOpacity={0.5} />
          </g>
        )}
        {projected && (
          <g className="map-iss">
            <circle cx={projected.x} cy={projected.y} r={10} className="map-iss-halo" fill="none" stroke={ISS_HALO_STROKE} strokeWidth={1.5} />
            <circle cx={projected.x} cy={projected.y} r={3.2} fill={ISS_DOT_FILL} />
          </g>
        )}
      </svg>

      <canvas ref={resolvedNightCanvasRef} width={NIGHT_GRID_COLS * 2} height={NIGHT_GRID_ROWS * 2} className="map-night-canvas" />

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
