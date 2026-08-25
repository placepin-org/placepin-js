/**
 * Proximity-aware search — NON-NORMATIVE, and deliberately outside the codec.
 *
 * Spec §01 draws this line explicitly: "Software MUST NOT decode a
 * 3-character input as Block 1 (local) in isolation... A product feature that
 * lets someone type just a local value and resolves it against their
 * approximate location is a separate, non-normative search/autocomplete
 * feature built on top of decode() — it is not a change to what a bare
 * 3-character string decodes to."
 *
 * So nothing here weakens `decode()`. This module sits above it, demands an
 * explicit origin, and returns *search results* the UI is obliged to present
 * as distinct from a real self-contained code (spec §06).
 *
 * Why this cannot be a database query (spec §08, normative): "Prefix-sharing
 * implies nothing at all — two codes that start with the same local block can
 * be, and usually are, continents apart." There is no index that would help.
 * Candidates are COMPUTED, by enumerating the area cells physically near the
 * origin and asking what the typed local block names inside each one. That is
 * also why search works with no network.
 */

import { ALPHABET, PlacepinError } from './constants.js';
import { canonicalise, charsToIdx, isAlphabetChar, isValidBlock } from './alphabet.js';
import { cellFromIndex } from './partition.js';
import { encodePath, decode } from './codec.js';
import { bearing, cellMetrics, center, distance } from './geo.js';
import type {
  Bounds,
  Candidate,
  Interpretation,
  LatLng,
  ResolveOptions,
} from './types.js';

/** Area cells measure ≈820–842 m per side (spec §03). */
export const AREA_CELL_M = 840;

/** Sample below half an area cell so the walk cannot step over one. */
const SAMPLE_STEP_M = AREA_CELL_M / 2;

export const DEFAULT_RADIUS_M = 5000;
export const MAX_RADIUS_M = 50000;

/**
 * Radius ladder for typeahead.
 *
 * Cost grows with the square of the radius: measured, a 1 km search is 0.06 ms
 * and a 5 km search 1.1 ms, but 20 km is 57 ms — past the budget for running on
 * every keystroke. So the UI searches narrow first and widens only when asked,
 * rather than paying for reach nobody needed.
 */
export const RADIUS_LADDER = [1000, 5000, 20000, 50000] as const;

interface AreaCell {
  area: string;
  region: string;
  bounds: Bounds;
}

/**
 * Every distinct area cell within `radiusM` of a position, found by walking a
 * sample lattice and deduping.
 *
 * Cost stays low because the whole-Earth partition is computed once and
 * memoised, and every sample inside one region reuses the same two partitions
 * — so this is a few hundred cheap lookups, not a few hundred partitions.
 */
function areaCellsNear(lat: number, lng: number, radiusM: number): AreaCell[] {
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const latStep = SAMPLE_STEP_M / 111320;
  const lngStep = SAMPLE_STEP_M / (111320 * cosLat);
  const latSpan = radiusM / 111320;
  const lngSpan = radiusM / (111320 * cosLat);

  const seen = new Map<string, AreaCell>();
  for (let dLat = -latSpan; dLat <= latSpan; dLat += latStep) {
    for (let dLng = -lngSpan; dLng <= lngSpan; dLng += lngStep) {
      const sLat = lat + dLat;
      const sLng = lng + dLng;
      if (sLat < -90 || sLat > 90) continue;
      if (distance(lat, lng, sLat, sLng) > radiusM * 1.15) continue;

      const { blocks, bounds } = encodePath(sLat, sLng, 2);
      const key = `${blocks[1]}-${blocks[0]}`;
      if (!seen.has(key)) {
        seen.set(key, { area: blocks[1], region: blocks[0], bounds: bounds[1] });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Resolves a bare local block against a position.
 *
 * @param localBlock three characters the person actually knows or was told
 * @param origin approximate position — device GPS, a stated city, the map
 *   centre. Without it a local block means nothing, so this throws rather than
 *   guessing.
 */
export function resolveLocalBlock(
  localBlock: string,
  origin: LatLng | null | undefined,
  opts: ResolveOptions = {},
): Candidate[] {
  const block = canonicalise(localBlock);
  if (!isValidBlock(block)) {
    throw new PlacepinError(
      `"${localBlock}" is not a valid local block — three characters from ${ALPHABET}.`,
      'BAD_CHARACTER',
    );
  }
  if (!origin || typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
    throw new PlacepinError(
      'resolveLocalBlock needs an origin — a bare local block is meaningless without one.',
      'NO_ORIGIN',
    );
  }

  const radiusM = Math.min(opts.radiusM ?? DEFAULT_RADIUS_M, MAX_RADIUS_M);
  const limit = opts.limit ?? 8;
  const idx = charsToIdx(block);

  const out: Candidate[] = [];
  for (const cell of areaCellsNear(origin.lat, origin.lng, radiusM)) {
    const bounds = cellFromIndex(cell.bounds, idx);
    const c = center(bounds);
    const d = distance(origin.lat, origin.lng, c.lat, c.lng);
    if (d > radiusM) continue;
    out.push({
      code: `${block}-${cell.area}-${cell.region}`,
      blocks: [block, cell.area, cell.region],
      center: c,
      bounds,
      distanceM: d,
      bearingDeg: bearing(origin.lat, origin.lng, c.lat, c.lng),
    });
  }

  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, limit);
}

/**
 * Reads one input box and reports EVERY defensible reading of it, so the UI
 * can show them side by side instead of silently picking one.
 *
 * This exists because of a hazard the spec names specifically (§06, "A new
 * confusion to guard against, specific to v5"): three characters is always a
 * region code, and it is also exactly what someone types when the local block
 * is all they were given. Both readings are legitimate, they mean completely
 * different places, and the product must never quietly choose between them.
 */
export function interpret(
  input: string,
  origin: LatLng | null = null,
  opts: ResolveOptions = {},
): Interpretation {
  const chars = canonicalise(input);

  if (chars.length === 0) {
    return { input: chars, kind: 'empty', code: null, candidates: null, notice: null };
  }

  const badChar = [...chars].find((c) => !isAlphabetChar(c));
  if (badChar) {
    return {
      input: chars,
      kind: 'invalid',
      code: null,
      candidates: null,
      notice: `"${badChar}" is not a placepin character — the alphabet has no vowels and no L.`,
    };
  }

  if (chars.length > 9) {
    return {
      input: chars,
      kind: 'invalid',
      code: null,
      candidates: null,
      notice: 'A placepin code is nine characters — three blocks of three.',
    };
  }

  if (chars.length === 3) {
    const asRegion = decode(chars);
    const candidates = origin ? resolveLocalBlock(chars, origin, opts) : null;
    return {
      input: chars,
      kind: 'ambiguous',
      code: { ...asRegion, sizeM: cellMetrics(asRegion.bounds) },
      candidates,
      notice: candidates
        ? 'On its own this is a region code — a ≈137 km cell. If it is the local block you were given, pick one of the nearby spots instead.'
        : 'On its own this is a region code — a ≈137 km cell. Share your location to search it as a local block instead.',
    };
  }

  if (chars.length === 6 || chars.length === 9) {
    const dec = decode(chars);
    return {
      input: chars,
      kind: 'code',
      code: { ...dec, sizeM: cellMetrics(dec.bounds) },
      candidates: null,
      notice:
        chars.length === 6
          ? 'Area code — ≈840 m. Add a local block in front for the exact spot.'
          : null,
    };
  }

  return { input: chars, kind: 'partial', code: null, candidates: null, notice: null };
}

/**
 * Everything the offline compass view needs about a target: a direction and a
 * distance, from two coordinates and nothing else.
 */
export function relativeTo(
  origin: LatLng,
  target: LatLng,
): { distanceM: number; bearingDeg: number } {
  return {
    distanceM: distance(origin.lat, origin.lng, target.lat, target.lng),
    bearingDeg: bearing(origin.lat, origin.lng, target.lat, target.lng),
  };
}
