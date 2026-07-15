import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed) so the map
// is real cartography with no external map-tile API or key.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, pathFromTrail, projectMercator, mercatorViewHeight, computeNightMaskGrid, type ProjectedPoint, type LatLonLike } from '../map/projection';

// Web Mercator, not equirectangular: equirectangular is mathematically
// simpler but looks *wrong* to everyone — it flattens high latitudes
// (Europe, Canada, Russia) and doesn't match the mental model of a "world
// map" that Google Maps/every flight tracker/every weather app trained
// everyone on. Clamped to +-78deg (the ISS never exceeds +-51.6deg of
// latitude, so this comfortably shows every populated landmass without
// ever needing to render the poles, where Mercator diverges to infinity).
const MAX_LAT_DEG = 78;
const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = mercatorViewHeight(VIEW_WIDTH, MAX_LAT_DEG);
const NIGHT_GRID_COLS = 120;
const NIGHT_GRID_ROWS = 60;
const NIGHT_CANVAS_WIDTH = NIGHT_GRID_COLS * 2;
const NIGHT_CANVAS_HEIGHT = Math.round(mercatorViewHeight(NIGHT_CANVAS_WIDTH, MAX_LAT_DEG));

function project(lon: number, lat: number): ProjectedPoint {
  return projectMercator(lon, lat, VIEW_WIDTH, MAX_LAT_DEG);
}

// Colors are inlined as literal values (not CSS custom properties) so the
// map never depends on the page stylesheet loading first. Land is a warm
// stone tone against a cool blue ocean — the standard cartographic
// convention (every atlas, every weather map) — rather than the previous
// palette's blue-on-blue, which read as monotone.
const OCEAN_FILL = '#0a121e';
const LAND_FILL = '#2b2721';
const LAND_STROKE = 'rgba(238, 233, 224, 0.14)';
const EQUATOR_STROKE = '#22303f';
const OBSERVED_TRAIL_STROKE = '#4a5568';
const PREDICTED_TRAIL_STROKE = '#6fe0c9';
const ISS_HALO_STROKE = '#eef1f4';
const ISS_DOT_FILL = '#eef1f4';
const OBSERVER_FILL = '#f2b155';
const OBSERVER_STROKE = '#060709';

interface MapLayerProps {
  landPaths: string[];
  projected: ProjectedPoint | null;
  observedTrailPath: string;
  predictedTrailPath: string;
  projectedObserver: ProjectedPoint | null;
  equatorY: number;
  nowMs: number;
}

/** One full, self-contained copy of the world. MapScene tiles three of these side by side so dragging feels infinite. */
function MapLayer({ landPaths, projected, observedTrailPath, predictedTrailPath, projectedObserver, equatorY, nowMs }: MapLayerProps) {
  const nightCanvasRef = useRef<HTMLCanvasElement>(null);

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
    ctx.fillStyle = 'rgba(3, 5, 10, 0.42)';
    const cellW = canvas.width / NIGHT_GRID_COLS;

    // Each grid row spans an equal band of latitude, but Mercator does NOT
    // map equal latitude bands to equal pixel heights — bands stretch
    // taller approaching the crop latitude, so each row's actual pixel
    // y-position is projected rather than assumed uniform.
    const rowY: number[] = [];
    for (let row = 0; row <= NIGHT_GRID_ROWS; row++) {
      const lat = 90 - (row / NIGHT_GRID_ROWS) * 180;
      rowY.push(projectMercator(0, lat, canvas.width, MAX_LAT_DEG).y);
    }

    // Merge consecutive same-state rows in each column into a single
    // fillRect, rather than one rect per grid cell. Each row is only
    // ~2-3 native canvas px tall (60 rows over a ~172px-tall canvas), so
    // drawing one anti-aliased rect per cell left faint overlapping seams
    // between same-colored neighbors at native resolution — invisible up
    // close, but the canvas is later upscaled ~5x by CSS to fill the panel,
    // which turned that seam noise into visible banding.
    for (let col = 0; col < NIGHT_GRID_COLS; col++) {
      let row = 0;
      while (row < NIGHT_GRID_ROWS) {
        if (!grid[row][col]) {
          row++;
          continue;
        }
        const runStart = row;
        while (row < NIGHT_GRID_ROWS && grid[row][col]) row++;
        const yTop = rowY[runStart];
        const yBottom = rowY[row];
        if (yBottom > yTop) ctx.fillRect(col * cellW, yTop, cellW + 0.5, yBottom - yTop);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);

  return (
    <div className="map-layer">
      <svg className="map-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={OCEAN_FILL} />
        <line x1={0} y1={equatorY} x2={VIEW_WIDTH} y2={equatorY} stroke={EQUATOR_STROKE} strokeWidth={1} strokeDasharray="2 8" />
        {landPaths.map((d, i) => (
          <path key={i} d={d} fill={LAND_FILL} stroke={LAND_STROKE} strokeWidth={0.6} />
        ))}
        {observedTrailPath && (
          <path d={observedTrailPath} fill="none" stroke={OBSERVED_TRAIL_STROKE} strokeWidth={1.2} strokeDasharray="1 5" strokeLinecap="round" />
        )}
        {predictedTrailPath && (
          <path d={predictedTrailPath} fill="none" stroke={PREDICTED_TRAIL_STROKE} strokeWidth={1.3} strokeDasharray="3 5" strokeOpacity={0.8} strokeLinecap="round" />
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
      <canvas ref={nightCanvasRef} width={NIGHT_CANVAS_WIDTH} height={NIGHT_CANVAS_HEIGHT} className="map-night-canvas" />
    </div>
  );
}

interface MapSceneProps {
  position: LatLonLike | null;
  observedTrail: LatLonLike[];
  predictedTrail: LatLonLike[];
  observer: LatLonLike | null;
  nowMs: number;
}

/**
 * The map is the whole picture: real land silhouettes, a live day/night
 * shading raster sampled directly from solar geometry, a growing "living
 * cartography" trail of everywhere the ISS has actually been (persisted
 * across sessions — see lib/trailStore.ts) shown dim, a bright preview of
 * where it's headed next, and — once a viewing location is set — a marker
 * for the observer. Draggable left/right: three identical copies of the
 * world sit side by side in a "reel," panned with a plain pixel offset that
 * wraps seamlessly, so it reads as one continuous, wrap-around globe rather
 * than a fixed static crop.
 */
export function MapScene({ position, observedTrail, predictedTrail, observer, nowMs }: MapSceneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startClientX: number; startTranslate: number; viewportWidth: number } | null>(null);
  const [translateX, setTranslateX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (translateX !== null) return;
    const width = viewportRef.current?.getBoundingClientRect().width;
    if (width) setTranslateX(-width);
  }, [translateX]);

  const landPaths = useMemo(() => {
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

  const projected = position ? project(position.lon, position.lat) : null;
  const projectedObserver = observer ? project(observer.lon, observer.lat) : null;
  const equatorY = project(0, 0).y;

  const observedTrailPath = useMemo(() => pathFromTrail(observedTrail, project, VIEW_WIDTH), [observedTrail]);
  const predictedTrailPath = useMemo(() => pathFromTrail(predictedTrail, project, VIEW_WIDTH), [predictedTrail]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const width = viewport.getBoundingClientRect().width;
    const startTranslate = translateX ?? -width;
    dragStateRef.current = { startClientX: e.clientX, startTranslate, viewportWidth: width };
    setDragging(true);
    viewport.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startClientX;
    let next = drag.startTranslate + delta;
    const w = drag.viewportWidth;
    if (w > 0) {
      while (next > 0) next -= w;
      while (next <= -2 * w) next += w;
    }
    setTranslateX(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null;
    setDragging(false);
    if (viewportRef.current?.hasPointerCapture(e.pointerId)) {
      viewportRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const layerProps: MapLayerProps = { landPaths, projected, observedTrailPath, predictedTrailPath, projectedObserver, equatorY, nowMs };

  return (
    <div
      className={`map-viewport${dragging ? ' map-viewport--dragging' : ''}`}
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label="Live world map showing the ISS's position and ground track. Draggable left and right."
    >
      <div className="map-reel" style={{ transform: `translateX(${translateX ?? 0}px)` }}>
        <MapLayer {...layerProps} />
        <MapLayer {...layerProps} />
        <MapLayer {...layerProps} />
      </div>
      <span className="corner tl"></span>
      <span className="corner br"></span>
    </div>
  );
}
