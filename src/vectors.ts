import type { LatLng } from './types.js';

export interface ConformanceVector {
  lat: number;
  lng: number;
  code: string;
  centre: LatLng;
}

/**
 * Appendix A · canonical conformance vectors, placepin protocol v5 (draft).
 *
 * Spec §03: "conformance is defined by the test vectors in Appendix A, not by
 * the prose". Transcendental functions are not bit-identical across platforms,
 * so this table — not the source — is what says an implementation conforms.
 * The spec makes shipping it a MUST, which is why it is exported from the
 * package rather than living only in the test folder: anyone writing another
 * implementation can import it.
 */
export const VECTORS: readonly ConformanceVector[] = Object.freeze([
  { lat: 51.5074, lng: -0.1278, code: 'PYY-ZT7-WMR', centre: { lat: 51.507387, lng: -0.127806 } },
  { lat: 40.689247, lng: -74.044502, code: 'S9Q-87F-TS4', centre: { lat: 40.689235, lng: -74.044515 } },
  { lat: -33.8568, lng: 151.2153, code: 'C33-6SH-6V8', centre: { lat: -33.856786, lng: 151.2153 } },
  { lat: 0, lng: 0, code: '000-H00-H00', centre: { lat: 0.000023, lng: 0.000023 } },
  { lat: 90, lng: 0, code: 'ZZZ-ZZZ-ZZY', centre: { lat: 89.999982, lng: 45 } },
  { lat: -90, lng: 0, code: '000-000-002', centre: { lat: -89.999982, lng: 45 } },
  { lat: 0, lng: 180, code: '000-H00-GV4', centre: { lat: 0.000023, lng: -179.999977 } },
  { lat: 78.2232, lng: 15.6267, code: 'P26-HS4-ZPB', centre: { lat: 78.223205, lng: 15.626777 } },
  { lat: -54.801912, lng: -68.302951, code: '1Q7-BKJ-2RG', centre: { lat: -54.801919, lng: -68.30294 } },
  { lat: 35.689722, lng: 139.692222, code: '05Q-7NJ-SX5', centre: { lat: 35.689724, lng: 139.692198 } },
]);
