import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { solarDeclinationDeg, terminatorLatitudeDeg } from '../orbital/solarTerminator';
import type { LatLonLike } from '../map/projection';

// A real, fully-detailed basemap (roads, labels, borders, coastlines) via
// Leaflet + CARTO's free "Dark Matter" tiles (built on OpenStreetMap data) —
// no API key, no billing account required. The literal Google Maps API
// needs a Google Cloud project with billing enabled, which only the account
// owner can create; this is the closest free equivalent, and it's the same
// underlying technology (tiled raster map, pan/zoom, real cartography)
// rather than a hand-rolled projection.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

const OBSERVED_TRAIL_COLOR = '#8fa3c9';
const PREDICTED_TRAIL_COLOR = '#6fe0c9';
const OBSERVER_COLOR = '#f2b155';
const NIGHT_FILL = '#03050a';

// The observed ("living cartography") trail renders as this many discrete
// polyline segments instead of one dashed line, each a little more opaque
// than the last toward the ISS's current position — a fading trail reads
// clearly as "recent path" at a glance, where a uniform dotted line (the
// previous approach) all but disappeared against a real map's own detail.
const OBSERVED_TRAIL_SEGMENTS = 20;
const OBSERVED_TRAIL_MIN_OPACITY = 0.12;
const OBSERVED_TRAIL_MAX_OPACITY = 0.85;

/**
 * Converts a chronological lat/lon trail into a continuous (unwrapped)
 * longitude sequence — Leaflet, like any Mercator map, expects consecutive
 * points that actually cross the antimeridian to keep going past +-180deg
 * rather than jumping straight from 179 to -179, or it draws a spurious line
 * all the way across the map. The ISS crosses the antimeridian roughly once
 * an orbit, so this matters for every trail on this map.
 */
function unwrapTrail(points: LatLonLike[]): [number, number][] {
  if (points.length === 0) return [];
  const result: [number, number][] = [[points[0].lat, points[0].lon]];
  let offset = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].lon - points[i - 1].lon;
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    result.push([points[i].lat, points[i].lon + offset]);
  }
  return result;
}

interface TrailSegment {
  latlngs: [number, number][];
  opacity: number;
}

/**
 * Leaflet's tile layer redraws seamlessly as you drag past +-180deg
 * (worldCopyJump), but plain vector layers (Marker, Polyline, Polygon) only
 * ever exist at the one longitude they were given — they don't get
 * duplicated into whichever "world copy" is currently in view. Left alone,
 * every custom layer on this map (the ISS marker, both trails, the observer
 * marker, the night-shading polygon) would appear to vanish the moment you
 * drag one world-width away from where they were last positioned, and
 * reappear/flicker as you drag back — exactly the "ghosting" and breakage
 * this fixes. The remedy: whenever the map's own view shifts, re-anchor
 * every custom layer's longitude to the copy nearest the current view
 * center, shifting a whole shape by one consistent offset so it keeps its
 * form (rather than shifting each point independently, which would tear a
 * trail apart right at the antimeridian of whichever copy is in view).
 */
function nearestWorldCopyOffset(anchorLon: number, referenceLon: number): number {
  return Math.round((referenceLon - anchorLon) / 360) * 360;
}

function shiftLatLngs(latlngs: [number, number][], referenceLon: number): [number, number][] {
  if (latlngs.length === 0) return latlngs;
  const shift = nearestWorldCopyOffset(latlngs[0][1], referenceLon);
  if (shift === 0) return latlngs;
  return latlngs.map(([lat, lon]) => [lat, lon + shift]);
}

function shiftLatLng(latlng: [number, number], referenceLon: number): [number, number] {
  const shift = nearestWorldCopyOffset(latlng[1], referenceLon);
  return shift === 0 ? latlng : [latlng[0], latlng[1] + shift];
}

/** Splits an already-unwrapped trail into `count` segments (each overlapping its neighbor by one point, so the line reads as continuous) with opacity rising toward the newest (last) point. */
function buildFadingSegments(unwrapped: [number, number][], count: number): TrailSegment[] {
  const n = unwrapped.length;
  if (n < 2) return [];
  const segLen = Math.max(2, Math.ceil(n / count));
  const segments: TrailSegment[] = [];
  for (let start = 0; start < n - 1; start += segLen - 1) {
    const end = Math.min(n, start + segLen);
    const slice = unwrapped.slice(start, end);
    if (slice.length < 2) continue;
    const ageFraction = (start + end) / 2 / (n - 1); // 0 = oldest point, 1 = newest
    const opacity = OBSERVED_TRAIL_MIN_OPACITY + ageFraction * (OBSERVED_TRAIL_MAX_OPACITY - OBSERVED_TRAIL_MIN_OPACITY);
    segments.push({ latlngs: slice, opacity });
  }
  return segments;
}

// Leaflet's default CRS is also Web Mercator, which diverges at the true
// poles — 85deg is the conventional safe edge (same bound Leaflet's own
// examples use), well past the ISS's real +-51.6deg range.
const POLAR_EDGE_LAT = 85;

/** A closed polygon tracing the real computed terminator (see orbital/solarTerminator.ts) from edge to edge, for the night-side shading overlay. */
function buildNightPolygon(nowMs: number): [number, number][] {
  const date = new Date(nowMs);
  const declination = solarDeclinationDeg(date);
  const edgeLat = declination >= 0 ? -POLAR_EDGE_LAT : POLAR_EDGE_LAT;

  const curve: [number, number][] = [];
  for (let i = 0; i <= 180; i++) {
    const lon = -180 + (i / 180) * 360;
    const lat = Math.max(-POLAR_EDGE_LAT, Math.min(POLAR_EDGE_LAT, terminatorLatitudeDeg(lon, date)));
    curve.push([lat, lon]);
  }
  return [[edgeLat, -180], ...curve, [edgeLat, 180]];
}

interface MapSceneProps {
  position: LatLonLike | null;
  observedTrail: LatLonLike[];
  predictedTrail: LatLonLike[];
  observer: LatLonLike | null;
  nowMs: number;
}

// A radar-style pulsing halo around a solid dot — an HTML marker (not a
// Leaflet CircleMarker) so it's a plain div, animatable with ordinary CSS
// (see .iss-marker-icon in App.css) rather than fighting SVG presentation
// attributes.
const ISS_ICON = L.divIcon({
  className: 'iss-marker-icon',
  html: '<span class="iss-halo"></span><span class="iss-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/**
 * The map is a real, standard tiled basemap (Leaflet + CARTO dark tiles) —
 * actual coastlines, borders, place names, at full cartographic fidelity —
 * with the ISS's live position (a pulsing marker), its growing "living
 * cartography" ground track (persisted across sessions — see
 * lib/trailStore.ts) rendered as a trail that fades toward the past, a
 * dashed preview of where it's headed next, an observer marker, and a real
 * day/night terminator overlay layered on top. Pan and zoom are native
 * Leaflet behavior: drag in any direction, scroll/pinch to zoom, wraps
 * seamlessly around the antimeridian.
 */
export function MapScene({ position, observedTrail, predictedTrail, observer, nowMs }: MapSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const issMarkerRef = useRef<L.Marker | null>(null);
  const observerMarkerRef = useRef<L.CircleMarker | null>(null);
  const observedLineRefs = useRef<L.Polyline[]>([]);
  const predictedLineRef = useRef<L.Polyline | null>(null);
  const nightLayerRef = useRef<L.Polygon | null>(null);
  const hasCenteredRef = useRef(false);

  // Raw (un-shifted, canonical +-180deg) coordinates for every custom layer,
  // kept alongside the Leaflet objects so a 'move' handler can re-anchor
  // them to whichever world copy is currently in view without needing the
  // latest React props in scope (see nearestWorldCopyOffset above).
  const rawPositionRef = useRef<[number, number] | null>(null);
  const rawObservedSegmentsRef = useRef<TrailSegment[]>([]);
  const rawPredictedRef = useRef<[number, number][]>([]);
  const rawObserverRef = useRef<[number, number] | null>(null);
  const rawNightRef = useRef<[number, number][]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: true,
      attributionControl: true,
    }).setView([20, 0], 2);

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: 'abcd', maxZoom: 20 }).addTo(map);

    mapRef.current = map;

    const resyncWorldCopies = () => {
      const referenceLon = map.getCenter().lng;

      if (rawPositionRef.current && issMarkerRef.current) {
        issMarkerRef.current.setLatLng(shiftLatLng(rawPositionRef.current, referenceLon));
      }
      if (rawObserverRef.current && observerMarkerRef.current) {
        observerMarkerRef.current.setLatLng(shiftLatLng(rawObserverRef.current, referenceLon));
      }
      if (rawPredictedRef.current.length > 0 && predictedLineRef.current) {
        predictedLineRef.current.setLatLngs(shiftLatLngs(rawPredictedRef.current, referenceLon));
      }
      if (rawNightRef.current.length > 0 && nightLayerRef.current) {
        nightLayerRef.current.setLatLngs(shiftLatLngs(rawNightRef.current, referenceLon));
      }
      const lines = observedLineRefs.current;
      rawObservedSegmentsRef.current.forEach((seg, i) => {
        lines[i]?.setLatLngs(shiftLatLngs(seg.latlngs, referenceLon));
      });
    };
    map.on('moveend', resyncWorldCopies);

    return () => {
      map.off('moveend', resyncWorldCopies);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    const raw: [number, number] = [position.lat, position.lon];
    rawPositionRef.current = raw;
    const latlng = shiftLatLng(raw, map.getCenter().lng);
    if (!issMarkerRef.current) {
      issMarkerRef.current = L.marker(latlng, { icon: ISS_ICON, interactive: false }).addTo(map);
    } else {
      issMarkerRef.current.setLatLng(latlng);
    }
    if (!hasCenteredRef.current) {
      map.setView(latlng, 3);
      hasCenteredRef.current = true;
    }
  }, [position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const referenceLon = map.getCenter().lng;
    const segments = buildFadingSegments(unwrapTrail(observedTrail), OBSERVED_TRAIL_SEGMENTS);
    rawObservedSegmentsRef.current = segments;
    const lines = observedLineRefs.current;

    segments.forEach((seg, i) => {
      const latlngs = shiftLatLngs(seg.latlngs, referenceLon);
      if (!lines[i]) {
        lines[i] = L.polyline(latlngs, { color: OBSERVED_TRAIL_COLOR, weight: 2, opacity: seg.opacity }).addTo(map);
      } else {
        lines[i].setLatLngs(latlngs);
        lines[i].setStyle({ opacity: seg.opacity });
      }
    });
    // Fewer segments than last time (e.g. trail was pruned) — drop the leftovers.
    for (let i = segments.length; i < lines.length; i++) {
      map.removeLayer(lines[i]);
    }
    lines.length = segments.length;
  }, [observedTrail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const raw = unwrapTrail(predictedTrail);
    rawPredictedRef.current = raw;
    const latlngs = shiftLatLngs(raw, map.getCenter().lng);
    if (!predictedLineRef.current) {
      predictedLineRef.current = L.polyline(latlngs, { color: PREDICTED_TRAIL_COLOR, weight: 2.4, dashArray: '5 5', opacity: 0.9 }).addTo(map);
    } else {
      predictedLineRef.current.setLatLngs(latlngs);
    }
  }, [predictedTrail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !observer) return;
    const raw: [number, number] = [observer.lat, observer.lon];
    rawObserverRef.current = raw;
    const latlng = shiftLatLng(raw, map.getCenter().lng);
    if (!observerMarkerRef.current) {
      observerMarkerRef.current = L.circleMarker(latlng, {
        radius: 5,
        color: '#060709',
        weight: 1.5,
        fillColor: OBSERVER_COLOR,
        fillOpacity: 1,
      }).addTo(map);
    } else {
      observerMarkerRef.current.setLatLng(latlng);
    }
  }, [observer]);

  // The terminator moves slowly (~0.25deg/minute) — recomputing it on
  // minute granularity rather than every render tick keeps this cheap.
  const minuteKey = Math.floor(nowMs / 60_000);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const raw = buildNightPolygon(nowMs);
    rawNightRef.current = raw;
    const latlngs = shiftLatLngs(raw, map.getCenter().lng);
    if (!nightLayerRef.current) {
      nightLayerRef.current = L.polygon(latlngs, { color: 'transparent', weight: 0, fillColor: NIGHT_FILL, fillOpacity: 0.38 }).addTo(map);
    } else {
      nightLayerRef.current.setLatLngs(latlngs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);

  return (
    <div
      ref={containerRef}
      className="map-viewport"
      data-tour="map"
      role="img"
      aria-label="Live world map showing the ISS's position and ground track. Pan and zoom to explore."
    />
  );
}
