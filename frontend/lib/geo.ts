// SatQuery AI - Geo Utilities (PRD §6.6)
import { PreviewMeta } from './types';

/**
 * Convert pixel coordinates to lat/lng using preview metadata.
 * Maps pixel (x,y) on the preview PNG to geographic coordinates.
 */
export function pixelToLatLng(x: number, y: number, m: PreviewMeta): [number, number] {
  const [w, s, e, n] = m.bounds_wgs84;
  return [n - (y / m.height) * (n - s), w + (x / m.width) * (e - w)];
}

/**
 * Convert lat/lng to pixel coordinates on the preview.
 */
export function latLngToPixel(lat: number, lng: number, m: PreviewMeta): [number, number] {
  const [w, s, e, n] = m.bounds_wgs84;
  const x = ((lng - w) / (e - w)) * m.width;
  const y = ((n - lat) / (n - s)) * m.height;
  return [x, y];
}

/**
 * Format coordinates for display.
 */
export function formatCoord(val: number, decimals = 5): string {
  return val.toFixed(decimals);
}

/**
 * Format area with appropriate units.
 */
export function formatArea(ha: number): string {
  if (ha >= 100) return `${(ha / 100).toFixed(1)} km²`;
  if (ha >= 1) return `${ha.toFixed(1)} ha`;
  return `${(ha * 10000).toFixed(0)} m²`;
}

/**
 * Format GSD for display.
 */
export function formatGsd(gsdM: number | null): string {
  if (gsdM === null) return 'N/A';
  if (gsdM >= 1) return `${gsdM.toFixed(1)} m`;
  return `${(gsdM * 100).toFixed(0)} cm`;
}
