export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface LatLonLike {
  lat: number;
  lon: number;
}

/**
 * Projects a look-angle (azimuth/elevation) pair onto a polar sky-plot: the
 * chart real satellite-tracking software uses to show which direction to
 * point. Elevation 90 (zenith) maps to the plot's center; elevation 0 (the
 * horizon) maps to the outer ring at `radius`; azimuth 0/90/180/270
 * (N/E/S/W) map to up/right/down/left, matching how a sky-plot is read
 * facing outward from the center of the circle.
 */
export function projectSkyPlot(azimuthDeg: number, elevationDeg: number, radius: number, centerX = 0, centerY = 0): ProjectedPoint {
  const clampedElevation = Math.max(0, Math.min(90, elevationDeg));
  const r = radius * (1 - clampedElevation / 90);
  const azRad = (azimuthDeg * Math.PI) / 180;
  return {
    x: centerX + r * Math.sin(azRad),
    y: centerY - r * Math.cos(azRad),
  };
}
