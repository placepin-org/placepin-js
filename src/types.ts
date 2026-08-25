/**
 * Shared types for the placepin protocol.
 *
 * Protocol v5 (draft). See the specification for normative definitions;
 * anything marked NON-NORMATIVE here is a product-layer convenience that the
 * spec deliberately keeps outside `decode()`.
 */

/** A latitude/longitude box. Half-open: owns its lower bounds, not its upper. */
export interface Bounds {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** The three precision tiers a code can name. */
export type Tier = 'region' | 'area' | 'leaf';

/** Physical dimensions of a cell, in metres. */
export interface CellMetrics {
  /** North–south extent. */
  h: number;
  /** East–west extent at the cell's centre latitude. */
  w: number;
  /** Area in m². */
  area: number;
}

export interface Partition {
  rows: number;
  cols: number[];
  prefix: Float64Array;
  total: number;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export interface EncodeResult {
  /** Canonical hyphenated form, e.g. `PYY-ZT7-WMR`. */
  code: string;
  /** Write order: [local, area, region]. */
  blocks: [string, string, string];
  /** Write order, parallel to `blocks`: [leaf, area, region]. */
  levels: [Bounds, Bounds, Bounds];
  /** The finest cell — same object as `levels[0]`. */
  bounds: Bounds;
}

export interface DecodeResult {
  /** Centre of the cell the code names. */
  center: LatLng;
  /** The cell the code names, at whatever depth was given. */
  bounds: Bounds;
  /** Write order, coarsest last. One entry per block supplied. */
  levels: Bounds[];
  /** 1, 2 or 3. */
  nBlocks: number;
  /** The blocks as given, in write order. */
  blocks: string[];
  /** Which precision tier `bounds` represents. */
  tier: Tier;
}

/** NON-NORMATIVE. One result from proximity search. */
export interface Candidate {
  code: string;
  blocks: [string, string, string];
  center: LatLng;
  bounds: Bounds;
  distanceM: number;
  /** Degrees clockwise from true north. */
  bearingDeg: number;
}

/** How an input string was read. */
export type InterpretationKind =
  | 'empty'
  | 'partial'
  | 'code'
  | 'ambiguous'
  | 'invalid';

/** NON-NORMATIVE. Every defensible reading of one input box. */
export interface Interpretation {
  input: string;
  kind: InterpretationKind;
  /** The normative decode, when the input is a valid code. */
  code: (DecodeResult & { sizeM: CellMetrics }) | null;
  /** Proximity-search results, when the input could be a local block. */
  candidates: Candidate[] | null;
  /** What the UI is obliged to tell the person. */
  notice: string | null;
}

export interface ResolveOptions {
  /** Search radius in metres. Defaults to 5 000; capped at 50 000. */
  radiusM?: number;
  /** Maximum candidates returned. Defaults to 8. */
  limit?: number;
}

export type ErrorCode =
  | 'BAD_LENGTH'
  | 'BAD_CHARACTER'
  | 'BAD_DEPTH'
  | 'OUT_OF_RANGE'
  | 'INVARIANT'
  | 'NO_ORIGIN';
