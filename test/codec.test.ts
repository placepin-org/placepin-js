import { describe, it, expect } from 'vitest';
import {
  encode,
  decode,
  partition,
  cellMetrics,
  canonicalise,
  contains,
  isValidCode,
  format,
  normalize,
  FACTOR,
  PlacepinError,
  PROTOCOL_VERSION,
} from '../src/index.js';
import { VECTORS } from '../src/vectors.js';

const round6 = (n: number) => Number(n.toFixed(6));

describe('Appendix A — conformance vectors', () => {
  // Spec §03: "conformance is defined by the test vectors in Appendix A, not by
  // the prose". These ten rows are the definition of a conforming build.

  it.each(VECTORS)('encodes ($lat, $lng) to $code', (v) => {
    expect(encode(v.lat, v.lng).code).toBe(v.code);
  });

  it.each(VECTORS)('decodes $code to its printed centre', (v) => {
    const { center } = decode(v.code);
    expect(round6(center.lat)).toBe(v.centre.lat);
    expect(round6(center.lng)).toBe(v.centre.lng);
  });
});

describe('§04 — normalization', () => {
  it('treats ±180° as the same meridian', () => {
    expect(encode(0, 180).code).toBe(encode(0, -180).code);
  });

  it('folds longitude into [-180, 180)', () => {
    expect(normalize(0, 180).lng).toBe(-180);
    expect(normalize(0, 540).lng).toBe(-180);
    expect(normalize(0, -190).lng).toBe(170);
  });

  it('clamps latitude to the poles', () => {
    expect(normalize(95, 0).lat).toBe(90);
    expect(normalize(-95, 0).lat).toBe(-90);
  });
});

describe('§03 — the partition invariant', () => {
  it('fills its budget exactly at every level of a real dive-down', () => {
    let bounds = { latMin: -90, latMax: 90, lngMin: -180, lngMax: 180 };
    for (const level of encode(51.5074, -0.1278).levels.slice().reverse()) {
      const part = partition(bounds.latMin, bounds.latMax, bounds.lngMin, bounds.lngMax);
      expect(part.total).toBe(FACTOR);
      expect(part.cols.reduce((a, c) => a + c, 0)).toBe(FACTOR);
      bounds = level;
    }
  });

  it('splits the whole Earth into the measured 145 rows', () => {
    expect(partition(-90, 90, -180, 180).rows).toBe(145);
  });

  it('holds the invariant across 200 random boxes', () => {
    for (let i = 0; i < 200; i++) {
      const lat = Math.random() * 179.8 - 89.9;
      const lng = Math.random() * 360 - 180;
      for (const level of encode(lat, lng).levels) {
        const p = partition(level.latMin, level.latMax, level.lngMin, level.lngMax);
        expect(p.total).toBe(FACTOR);
      }
    }
  });
});

describe('§01 — truncation runs right to left', () => {
  it.each(VECTORS)('$code: 3- and 6-char suffixes contain the leaf', (v) => {
    const chars = canonicalise(v.code);
    const leaf = decode(v.code).bounds;
    for (const take of [3, 6]) {
      const suffix = chars.slice(chars.length - take);
      expect(contains(decode(suffix).bounds, leaf)).toBe(true);
    }
  });

  it('a bare local block is NOT the leaf it came from', () => {
    // The regression check the spec asks for: proof the truncation direction is
    // enforced, not merely documented. A leading block decodes as a region, and
    // that region is somewhere else entirely.
    for (const v of VECTORS.slice(0, 5)) {
      const localBlock = canonicalise(v.code).slice(0, 3);
      const asRegion = decode(localBlock);
      const leaf = decode(v.code).center;
      const contained =
        asRegion.bounds.latMin <= leaf.lat &&
        asRegion.bounds.latMax >= leaf.lat &&
        asRegion.bounds.lngMin <= leaf.lng &&
        asRegion.bounds.lngMax >= leaf.lng;
      expect(contained).toBe(false);
    }
  });

  it('reports the tier for each valid length', () => {
    expect(decode('WMR').tier).toBe('region');
    expect(decode('ZT7-WMR').tier).toBe('area');
    expect(decode('PYY-ZT7-WMR').tier).toBe('leaf');
  });
});

describe('§03 — round trips and nesting', () => {
  it('2000 random points land inside their own decoded box', () => {
    for (let i = 0; i < 2000; i++) {
      const lat = Math.random() * 179.8 - 89.9;
      const lng = Math.random() * 360 - 180;
      const { bounds } = decode(encode(lat, lng).code);
      expect(lat).toBeGreaterThanOrEqual(bounds.latMin);
      expect(lat).toBeLessThanOrEqual(bounds.latMax);
      expect(lng).toBeGreaterThanOrEqual(bounds.lngMin);
      expect(lng).toBeLessThanOrEqual(bounds.lngMax);
    }
  });

  it('each level nests strictly inside the next, across 500 samples', () => {
    for (let i = 0; i < 500; i++) {
      const lat = Math.random() * 179.8 - 89.9;
      const lng = Math.random() * 360 - 180;
      const { levels } = encode(lat, lng);
      expect(contains(levels[1], levels[0])).toBe(true);
      expect(contains(levels[2], levels[1])).toBe(true);
    }
  });
});

describe('§05 — measured cell sizes', () => {
  it('matches the specified tiers in London', () => {
    const { levels } = encode(51.5074, -0.1278);
    const leaf = cellMetrics(levels[0]);
    const area = cellMetrics(levels[1]);
    const region = cellMetrics(levels[2]);

    expect(leaf.h).toBeGreaterThan(4.4);
    expect(leaf.h).toBeLessThan(5.2);
    expect(area.h).toBeGreaterThan(800);
    expect(area.h).toBeLessThan(850);
    expect(region.h).toBeGreaterThan(130_000);
    expect(region.h).toBeLessThan(140_000);
  });

  it('keeps leaf area within the stated range at inhabited latitudes', () => {
    for (let i = 0; i < 300; i++) {
      const lat = Math.random() * 120 - 60;
      const lng = Math.random() * 360 - 180;
      const { area } = cellMetrics(encode(lat, lng).bounds);
      expect(area).toBeGreaterThan(19);
      expect(area).toBeLessThan(27);
    }
  });
});

describe('§06 — input handling', () => {
  it('rejects malformed input with a specific code', () => {
    expect(() => decode('ABCD')).toThrow(PlacepinError);
    expect(() => decode('')).toThrow(/three-character blocks/);

    // A and E are vowels; L is excluded for the 1/l/I confusion class.
    for (const bad of ['AAA', 'EEE', 'LLL']) {
      try {
        decode(bad);
        throw new Error(`${bad} should have been rejected`);
      } catch (e) {
        expect((e as PlacepinError).code).toBe('BAD_CHARACTER');
      }
    }
  });

  it('treats hyphens as grouping and input as case-insensitive', () => {
    const canonical = decode('PYY-ZT7-WMR').center;
    for (const variant of ['pyy-zt7-wmr', 'PYYZT7WMR', 'pyy zt7 wmr', ' PYY-zt7-WMR ']) {
      expect(decode(variant).center).toEqual(canonical);
    }
  });

  it('validates and formats', () => {
    expect(isValidCode('PYY-ZT7-WMR')).toBe(true);
    expect(isValidCode('pyyzt7wmr')).toBe(true);
    expect(isValidCode('PYY-ZT7-WM')).toBe(false);
    expect(isValidCode('AAA')).toBe(false);
    expect(format('pyyzt7wmr')).toBe('PYY-ZT7-WMR');
  });
});

describe('protocol identity', () => {
  it('declares which revision this build implements', () => {
    // Spec §10: v4 and v5 codes are not interchangeable, and nothing catches a
    // mismatch at decode time. Anything persisting a code must persist this.
    expect(PROTOCOL_VERSION).toBe('v5-draft');
  });
});
