import { FACTOR, R, PlacepinError } from './constants.js';
import type { Bounds, Partition } from './types.js';

/**
 * The partition routine — spec §03, normative.
 *
 * DO NOT REFACTOR THE ARITHMETIC. Spec §03 (Determinism): "implementations
 * MUST NOT reorder, refactor or 'simplify' [the formulas], because floor()
 * boundaries turn one-ulp differences into different grids." Every expression
 * below mirrors the specification's operation order exactly. Conformance is
 * proven by the Appendix A vectors, not by the source reading nicely.
 */

function bandArea(latMin: number, latMax: number, lngMin: number, lngMax: number): number {
  const lngRad = ((lngMax - lngMin) * Math.PI) / 180;
  return (
    lngRad *
    R *
    R *
    (Math.sin((latMax * Math.PI) / 180) - Math.sin((latMin * Math.PI) / 180))
  );
}

/**
 * Memoisation. Every box partitions identically every time, and proximity
 * search re-partitions the same handful of boxes hundreds of times while
 * enumerating neighbours — this is what turns a 60 ms search into a 1 ms one.
 * Boxes come out of `boundsFromRowCol` deterministically, so identical boxes
 * are bit-identical floats and key cleanly.
 */
const CACHE = new Map<string, Partition>();
const CACHE_MAX = 512;

export function clearPartitionCache(): void {
  CACHE.clear();
}

export function partition(
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number,
  factor: number = FACTOR,
): Partition {
  const key = `${latMin},${latMax},${lngMin},${lngMax},${factor}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const area = bandArea(latMin, latMax, lngMin, lngMax);
  const s = Math.sqrt(area / factor);
  const heightM = (((latMax - latMin) * Math.PI) / 180) * R;
  let rows = Math.max(1, Math.floor(heightM / s));

  let raw: number[] = [];
  let cols: number[] = [];
  let total = 0;

  for (;;) {
    raw = new Array<number>(rows);
    cols = new Array<number>(rows);
    total = 0;
    for (let r = 0; r < rows; r++) {
      const latC = latMin + ((r + 0.5) * (latMax - latMin)) / rows;
      const v =
        ((((lngMax - lngMin) * Math.PI) / 180) *
          R *
          Math.cos((latC * Math.PI) / 180)) /
        s;
      raw[r] = v;
      cols[r] = Math.max(1, Math.floor(v));
      total += cols[r];
    }
    if (total <= factor || rows === 1) break;
    rows--;
  }

  // Largest-remainder (Hamilton) apportionment, CYCLED until the budget is
  // exactly consumed. The cycling is load-bearing: a single pass adds at most
  // one column per row, but on the whole Earth the leftover is 203 columns
  // against 145 rows. Order is computed once and never re-sorted.
  const order = raw
    .map((v, r) => [v - cols[r], r] as [number, number])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map((p) => p[1]);

  let i = 0;
  while (total < factor) {
    cols[order[i % rows]]++;
    total++;
    i++;
  }

  const prefix = new Float64Array(rows + 1);
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    prefix[r] = acc;
    acc += cols[r];
  }
  prefix[rows] = acc;

  // The invariant the spec makes a MUST: an implementation that cannot assert
  // this is non-conforming.
  if (acc !== factor) {
    throw new PlacepinError(
      `partition invariant violated: total ${acc} !== factor ${factor}`,
      'INVARIANT',
    );
  }

  const part: Partition = {
    rows,
    cols,
    prefix,
    total: acc,
    latMin,
    latMax,
    lngMin,
    lngMax,
  };

  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, part);
  return part;
}

export function rowColFromLatLng(
  part: Partition,
  lat: number,
  lng: number,
): { row: number; col: number } {
  const rowH = (part.latMax - part.latMin) / part.rows;
  let row = Math.floor((lat - part.latMin) / rowH);
  row = Math.max(0, Math.min(part.rows - 1, row));
  const cols = part.cols[row];
  const lngSpan = (part.lngMax - part.lngMin) / cols;
  let col = Math.floor((lng - part.lngMin) / lngSpan);
  col = Math.max(0, Math.min(cols - 1, col));
  return { row, col };
}

/**
 * Cell bounds. NORMATIVE (spec §03): the last row/column snaps to the parent
 * box's exact upper bound rather than being computed by accumulation —
 * accumulation overshoots the parent by one ulp and breaks nesting. This is
 * not hypothetical; the pre-snapping reference implementation failed strict
 * containment checks.
 */
export function boundsFromRowCol(part: Partition, row: number, col: number): Bounds {
  const rowH = (part.latMax - part.latMin) / part.rows;
  const cols = part.cols[row];
  const lngSpan = (part.lngMax - part.lngMin) / cols;
  const latMin = part.latMin + row * rowH;
  const latMax = row === part.rows - 1 ? part.latMax : part.latMin + (row + 1) * rowH;
  const lngMin = part.lngMin + col * lngSpan;
  const lngMax = col === cols - 1 ? part.lngMax : part.lngMin + (col + 1) * lngSpan;
  return { latMin, latMax, lngMin, lngMax };
}

function rowFromIndex(part: Partition, idx: number): number {
  let lo = 0;
  let hi = part.rows - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (part.prefix[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Resolves a flat cell index inside a box to that cell's bounds. */
export function cellFromIndex(
  bounds: Bounds,
  idx: number,
  factor: number = FACTOR,
): Bounds {
  const part = partition(
    bounds.latMin,
    bounds.latMax,
    bounds.lngMin,
    bounds.lngMax,
    factor,
  );
  if (idx >= part.total) {
    throw new PlacepinError(
      `index ${idx} is out of range for its parent cell`,
      'OUT_OF_RANGE',
    );
  }
  const row = rowFromIndex(part, idx);
  return boundsFromRowCol(part, row, idx - part.prefix[row]);
}
