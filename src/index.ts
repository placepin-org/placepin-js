/**
 * @placepin/core — the placepin protocol, v5 (draft).
 *
 * Zero dependencies, zero I/O, zero network, no precomputed tables. Encode,
 * decode, search and navigate are all arithmetic, which is what lets a
 * placepin client work with no connection at all.
 *
 * Two layers, deliberately separated (spec §01):
 *
 *   NORMATIVE      encode / decode / the grid. What a code means. Never
 *                  changes because of a product decision.
 *   NON-NORMATIVE  resolver. Proximity search for a bare local block, which
 *                  the spec keeps explicitly outside decode().
 *
 * The resolver is a separate entry point — `@placepin/core/resolver` — so an
 * implementation that only needs the protocol never ships the product layer,
 * and the boundary is visible in the import rather than only in a comment.
 */

export {
  PROTOCOL_VERSION,
  ALPHABET,
  BASE,
  FACTOR,
  R,
  WHOLE_EARTH,
  PlacepinError,
} from './constants.js';

export {
  canonicalise,
  format,
  idxToChars,
  charsToIdx,
  isAlphabetChar,
  isValidBlock,
  isValidCode,
} from './alphabet.js';

export {
  partition,
  rowColFromLatLng,
  boundsFromRowCol,
  cellFromIndex,
  clearPartitionCache,
} from './partition.js';

export {
  cellMetrics,
  center,
  contains,
  distance,
  bearing,
  meanHeading,
  headingDelta,
} from './geo.js';

export { encode, decode, encodePath, normalize } from './codec.js';

export { VECTORS } from './vectors.js';
export type { ConformanceVector } from './vectors.js';

export type {
  Bounds,
  LatLng,
  Tier,
  CellMetrics,
  Partition,
  EncodeResult,
  DecodeResult,
  Candidate,
  Interpretation,
  InterpretationKind,
  ResolveOptions,
  ErrorCode,
} from './types.js';
