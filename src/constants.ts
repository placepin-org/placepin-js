import type { Bounds, ErrorCode } from './types.js';

/**
 * The protocol revision this build implements.
 *
 * Spec §10: v4 and v5 codes are NOT interchangeable — a v4 code fed to a v5
 * decoder decodes to the wrong location rather than failing, and there is no
 * checksum to catch it (§06). Anything that stores a code must store this
 * alongside it.
 */
export const PROTOCOL_VERSION = 'v5-draft' as const;

/** 30 characters: no vowels (codes cannot spell words), no L (1/l/I class). */
export const ALPHABET = '0123456789BCDFGHJKMNPQRSTVWXYZ';
export const BASE = 30;

/** Mean Earth radius in metres. An addressing convention, not a geodetic claim. */
export const R = 6371000;

/** 30³ — one block's address space. */
export const FACTOR = BASE ** 3;

export const WHOLE_EARTH: Readonly<Bounds> = Object.freeze({
  latMin: -90,
  latMax: 90,
  lngMin: -180,
  lngMax: 180,
});

export class PlacepinError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, code: ErrorCode) {
    super(message);
    this.name = 'PlacepinError';
    this.code = code;
  }
}
