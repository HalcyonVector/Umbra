import { useEffect, useMemo, useRef, type RefObject } from 'react';
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

// Colors are inlined as literal values (not CSS custom properties or
// classNames) deliberately: the "export as PNG" feature serializes this
// SVG standalone, outside the page's stylesheet context, so anything
// styled only via App.css would render unstyled in the exported image.
const OCEAN_FILL = '#0b0d12';
const LAND_FILL = '#141821';
const LAND_STROKE = 'rgba(238, 241, 244, 0.08)';
const EQUATOR_STROKE = '#161b23';
const OBSERVED_TRAIL_STROKE = '#3a4150';
const PREDICTED_TRAIL_STROKE = '#6fe0c9';
const ISS_HALO_STROKE = '#eef1f4';
const ISS_DOT_FILL = '#eef1f4';
const OBSERVER_FILL = '#f2b155';
const OBSERVER_STROKE = '#060709';

interface MapSceneProps {
  position: LatLonLike | null;
  observedTrail: LatLonLike[];
  predictedTrail: LatLonLike[];
  observer: LatLonLike | null;
  nowMs: number;
  svgRef?: RefObject<SVGSVGElement>;
  nightCanvasRef?: RefObject<HTMLCanvasElement>;
}

/**
 * The map is the whole picture: real land silhouettes, a live day/night
 * shading raster sampled directly from solar geometry, a growing "living
 * cartography" trail of everywhere the ISS has actually been (persisted
 * across sessions — see lib/trailStore.ts) shown dim, a bright preview of
 * where it's headed next (from the orbital propagator), and — once a
 * viewing location is set — a marker for the observer. No grid, no
 * decorative overlays competing with the data.
 */
export function MapScene({ position, observedTrail, predictedTrail, observer, nowMs, svgRef, nightCanvasRef }: MapSceneProps) {
  const internalSvgRef = useRef<SVGSVGElement>(null);
  const internalNightCanvasRef = useRef<HTMLCanvasElement>(null);
  const resolvedSvgRef = svgRef ?? internalSvgRef;
  const resolvedNightCanvasRef = nightCanvasRef ?? internalNightCanvasRef;

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

  const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, VIEW_WIDTH, VIEW_HEIGHT);
  const projected = position ? project(position.lon, position.lat) : null;
  const projectedObserver = observer ? project(observer.lon, observer.lat) : null;
  const equatorY = project(0, 0).y;

  const observedTrailPath = useMemo(() => pathFromTrail(observedTrail, project, VIEW_WIDTH), [observedTrail]);
  const predictedTrailPath = useMemo(() => pathFromTrail(predictedTrail, project, VIEW_WIDTH), [predictedTrail]);

  return (
    <div className="map-scene" aria-hidden="true">
      <svg ref={resolvedSvgRef} className="map-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={OCEAN_FILL} />
        <line x1={0} y1={equatorY} x2={VIEW_WIDTH} y2={equatorY} stroke={EQUATOR_STROKE} strokeWidth={1} strokeDasharray="2 8" />
        {landPaths.map((d, i) => (
          <path key={i} d={d} fill={LAND_FILL} stroke={LAND_STROKE} strokeWidth={0.6} />
        ))}
        {observedTrailPath && (
          <path d={observedTrailPath} fill="none" stroke={OBSERVED_TRAIL_STROKE} strokeWidth={1.2} strokeDasharray="1 5" strokeLinecap="round" />
        )}
        {predictedTrailPath && (
          <path d={predictedTrailPath} fill="none" stroke={PREDICTED_TRAIL_STROKE} strokeWidth={1.3} strokeDasharray="3 5" strokeOpacity={0.75} strokeLinecap="round" />
        )}
        {projectedObserver && (
          <g>
            <circle cx={projectedObserver.x} cy={projectedObserver.y} r={5} fill={OBSERVER_FILL} stroke={OBSERVER_STROKE} strokeWidth={1.5} />
            <circle cx={projectedObserver.x} cy={projectedObserver.y} r={9} fill="none" stroke={OBSERVER_FILL} strokeWidth={1} strokeOpacity={0.5} />
          </g>
        )}
        {projected && (
          <g className="map-iss">
            <circle cx={projected.x} cy={projected.y} r={3.4} className="map-iss-halo" fill="none" stroke={ISS_HALO_STROKE} strokeWidth={1.1} strokeOpacity={0.9} />
            <circle cx={projected.x} cy={projected.y} r={2.6} fill={ISS_DOT_FILL} />
          </g>
        )}
      </svg>

      <canvas ref={resolvedNightCanvasRef} width={NIGHT_GRID_COLS * 2} height={NIGHT_GRID_ROWS * 2} className="map-night-canvas" />

      <span className="corner tl"></span>
      <span className="corner br"></span>
    </div>
  );
}
