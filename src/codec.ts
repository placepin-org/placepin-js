/**
 * The normative codec — spec §04.
 *
 * Pure: no I/O, no network, no precomputed tables, no dependencies. Every
 * encode and decode partitions its parent box on the fly. This is the whole
 * reason placepin can work offline: there is no lookup service to be cut off
 * from.
 */

import { WHOLE_EARTH, PlacepinError } from './constants.js';
import { canonicalise, charsToIdx, idxToChars } from './alphabet.js';
import {
  partition,
  rowColFromLatLng,
  boundsFromRowCol,
  cellFromIndex,
} from './partition.js';
import { center } from './geo.js';
import type { Bounds, DecodeResult, EncodeResult, LatLng, Tier } from './types.js';

const TIER_BY_DEPTH: Record<number, Tier> = { 1: 'region', 2: 'area', 3: 'leaf' };

/** WGS84 degrees. Longitude folds into [-180, 180) so ±180 encode identically. */
export function normalize(lat: number, lng: number): LatLng {
  lat = Math.max(-90, Math.min(90, lat));
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat, lng };
}

/**
 * Runs the dive-down in COMPUTE order (coarsest first) to the requested depth.
 *
 * Stopping at depth 2 yields the area cell without paying for the leaf
 * partition — which is exactly what proximity search enumerates over, and why
 * it is exposed rather than kept private.
 *
 * @returns blocks and bounds in COMPUTE order: [region, area, local].
 */
export function encodePath(
  lat: number,
  lng: number,
  depth = 3,
): { blocks: string[]; bounds: Bounds[] } {
  if (depth < 1 || depth > 3) {
    throw new PlacepinError('depth must be 1, 2 or 3', 'BAD_DEPTH');
  }
  const n = normalize(lat, lng);
  let bounds: Bounds = WHOLE_EARTH;
  const blocks: string[] = [];
  const boundsAtStep: Bounds[] = [];
  for (let step = 0; step < depth; step++) {
    const part = partition(bounds.latMin, bounds.latMax, bounds.lngMin, bounds.lngMax);
    const { row, col } = rowColFromLatLng(part, n.lat, n.lng);
    blocks.push(idxToChars(part.prefix[row] + col));
    bounds = boundsFromRowCol(part, row, col);
    boundsAtStep.push(bounds);
  }
  return { blocks, bounds: boundsAtStep };
}

/**
 * Coordinates → nine-character code.
 *
 * Computation runs coarsest-to-finest because each step's box is only defined
 * once the coarser step has picked a cell; the result is then WRITTEN in the
 * opposite order — local, area, region (spec §04).
 */
export function encode(lat: number, lng: number): EncodeResult {
  const path = encodePath(lat, lng, 3);
  const blocks = path.blocks.slice().reverse() as [string, string, string];
  const levels = path.bounds.slice().reverse() as [Bounds, Bounds, Bounds];
  return { code: blocks.join('-'), blocks, levels, bounds: levels[0] };
}

/**
 * Code → coordinates. Accepts exactly 3, 6 or 9 characters.
 *
 * NORMATIVE (spec §01): a 3- or 6-character input is ALWAYS the coarse end —
 * region, or area+region. A bare three-character string is NEVER decoded as a
 * local block, because region is the only block with a fixed, context-free
 * meaning.
 *
 * Resolving a bare local block against approximate position is a separate,
 * non-normative search feature. It lives in `./resolver`, it takes an explicit
 * origin, and it cannot reach in here and change what this function returns.
 */
export function decode(rawCode: string): DecodeResult {
  const chars = canonicalise(rawCode);
  if (chars.length === 0 || chars.length % 3 !== 0 || chars.length > 9) {
    throw new PlacepinError(
      'A placepin code is 1, 2 or 3 three-character blocks (3, 6 or 9 characters).',
      'BAD_LENGTH',
    );
  }
  const nBlocks = chars.length / 3;
  const given: string[] = [];
  for (let i = 0; i < nBlocks; i++) given.push(chars.slice(i * 3, i * 3 + 3));
  const computeOrder = given.slice().reverse(); // coarsest first

  let bounds: Bounds = WHOLE_EARTH;
  const computed: Bounds[] = [];
  for (let step = 0; step < nBlocks; step++) {
    const block = computeOrder[step];
    const idx = charsToIdx(block);
    try {
      bounds = cellFromIndex(bounds, idx);
    } catch (err) {
      if (err instanceof PlacepinError && err.code === 'OUT_OF_RANGE') {
        throw new PlacepinError(
          `Block ${3 - step} ("${block}") is out of range for its parent cell.`,
          'OUT_OF_RANGE',
        );
      }
      throw err;
    }
    computed.push(bounds);
  }

  return {
    center: center(bounds),
    bounds,
    levels: computed.slice().reverse(), // write order
    nBlocks,
    blocks: given,
    tier: TIER_BY_DEPTH[nBlocks],
  };
}
