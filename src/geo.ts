import { R } from './constants.js';
import type { Bounds, CellMetrics, LatLng } from './types.js';

const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Physical size of a cell, measured at its centre latitude. */
export function cellMetrics(b: Bounds): CellMetrics {
  const h = (((b.latMax - b.latMin) * Math.PI) / 180) * R;
  const latC = (b.latMin + b.latMax) / 2;
  const w =
    (((b.lngMax - b.lngMin) * Math.PI) / 180) * R * Math.cos((latC * Math.PI) / 180);
  return { h, w, area: h * w };
}

export function center(b: Bounds): LatLng {
  return { lat: (b.latMin + b.latMax) / 2, lng: (b.lngMin + b.lngMax) / 2 };
}

export function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.latMin <= inner.latMin &&
    outer.latMax >= inner.latMax &&
    outer.lngMin <= inner.lngMin &&
    outer.lngMax >= inner.lngMax
  );
}

/**
 * Great-circle distance in metres.
 *
 * This and `bearing` are what make the offline compass possible: given a code
 * (decoded with no network) and a GPS fix (acquired with no network), they
 * produce a direction and a distance with no network either.
 */
export function distance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing, degrees clockwise from true north. */
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lng2 - lng1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Circular mean of a set of headings.
 *
 * Compass readings wrap at 360°, so averaging them arithmetically is wrong in
 * the one place it matters most: a device pointing due north oscillates
 * between 359° and 1°, and the naive mean of those is 180° — exactly backwards.
 * Averaging the unit vectors instead is correct everywhere.
 */
export function meanHeading(headings: number[]): number {
  if (headings.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const h of headings) {
    sx += Math.cos(toRad(h));
    sy += Math.sin(toRad(h));
  }
  return (toDeg(Math.atan2(sy, sx)) + 360) % 360;
}

/** Smallest signed turn from `from` to `to`, in (-180, 180]. */
export function headingDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}
