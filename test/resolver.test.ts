import { describe, it, expect } from 'vitest';
import { decode, canonicalise, distance, PlacepinError } from '../src/index.js';
import {
  resolveLocalBlock,
  interpret,
  relativeTo,
  RADIUS_LADDER,
} from '../src/resolver.js';

const LONDON = { lat: 51.5074, lng: -0.1278 };

describe('proximity search', () => {
  it('returns nearby codes sorted by distance', () => {
    const hits = resolveLocalBlock('PYY', LONDON, { radiusM: 3000 });

    expect(hits.length).toBeGreaterThan(0);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].distanceM).toBeGreaterThanOrEqual(hits[i - 1].distanceM);
    }
    for (const h of hits) {
      expect(h.blocks[0]).toBe('PYY');
      expect(h.distanceM).toBeLessThanOrEqual(3000);
    }
  });

  it('finds the true code when searching from its own leaf cell', () => {
    // The strongest correctness check available: stand on a known code and
    // search for its local block. It must come back, and come back first.
    const truth = 'PYY-ZT7-WMR';
    const at = decode(truth).center;
    const hits = resolveLocalBlock(canonicalise(truth).slice(0, 3), at, { radiusM: 2000 });

    expect(hits[0].code).toBe(truth);
    expect(hits[0].distanceM).toBeLessThan(5);
  });

  it('produces candidates that round-trip through the normative decoder', () => {
    for (const h of resolveLocalBlock('PYY', LONDON, { radiusM: 3000 })) {
      const dec = decode(h.code);
      expect(distance(dec.center.lat, dec.center.lng, h.center.lat, h.center.lng)).toBeLessThan(0.01);
    }
  });

  it('returns distinct places roughly one area cell apart', () => {
    const hits = resolveLocalBlock('PYY', LONDON, { radiusM: 3000 });
    expect(new Set(hits.map((h) => h.code)).size).toBe(hits.length);

    for (let i = 1; i < Math.min(hits.length, 5); i++) {
      const d = distance(
        hits[i - 1].center.lat, hits[i - 1].center.lng,
        hits[i].center.lat, hits[i].center.lng,
      );
      expect(d).toBeGreaterThan(100);
    }
  });

  it('refuses to guess without an origin', () => {
    // §01: a bare local block is meaningless without approximate position.
    expect(() => resolveLocalBlock('PYY', null)).toThrow(PlacepinError);
    try {
      resolveLocalBlock('PYY', null);
    } catch (e) {
      expect((e as PlacepinError).code).toBe('NO_ORIGIN');
    }
  });

  it('rejects a block outside the alphabet', () => {
    expect(() => resolveLocalBlock('AAA', LONDON)).toThrow(PlacepinError);
  });

  it('honours the limit and caps the radius', () => {
    expect(resolveLocalBlock('PYY', LONDON, { radiusM: 5000, limit: 3 })).toHaveLength(3);
    // Above MAX_RADIUS_M the search clamps rather than running away.
    expect(() => resolveLocalBlock('PYY', LONDON, { radiusM: 999_999, limit: 1 })).not.toThrow();
  });

  it('works at the antimeridian', () => {
    const hits = resolveLocalBlock('PYY', { lat: 0, lng: 179.99 }, { radiusM: 2000 });
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('interpret() — the ambiguity rule', () => {
  it('reports three characters as ambiguous, never silently one way', () => {
    const r = interpret('WMR', LONDON);
    expect(r.kind).toBe('ambiguous');
    expect(r.code?.tier).toBe('region');
    expect(r.candidates?.length).toBeGreaterThan(0);
    expect(r.notice).toMatch(/region code/);
  });

  it('never lets the search reading override decode()', () => {
    // Whatever the resolver suggests, the normative decode of a bare 3-char
    // string stays exactly what §01 says it is.
    expect(interpret('WMR', LONDON).code?.center).toEqual(decode('WMR').center);
  });

  it('offers no candidates without an origin, but still decodes', () => {
    const r = interpret('WMR', null);
    expect(r.kind).toBe('ambiguous');
    expect(r.candidates).toBeNull();
    expect(r.code?.center).toEqual(decode('WMR').center);
    expect(r.notice).toMatch(/location/);
  });

  it('classifies each input length', () => {
    expect(interpret('').kind).toBe('empty');
    expect(interpret('P').kind).toBe('partial');
    expect(interpret('PY').kind).toBe('partial');
    expect(interpret('PYYZ').kind).toBe('partial');
    expect(interpret('ZT7-WMR').kind).toBe('code');
    expect(interpret('ZT7-WMR').code?.tier).toBe('area');
    expect(interpret('PYY-ZT7-WMR').kind).toBe('code');
    expect(interpret('PYY-ZT7-WMR').code?.tier).toBe('leaf');
  });

  it('rejects bad characters with a usable message', () => {
    const r = interpret('AAA');
    expect(r.kind).toBe('invalid');
    expect(r.notice).toMatch(/no vowels/);
  });

  it('rejects overlong input', () => {
    expect(interpret('PYY-ZT7-WMR-XXX').kind).toBe('invalid');
  });

  it('attaches cell size to every decoded reading', () => {
    const r = interpret('PYY-ZT7-WMR');
    expect(r.code?.sizeM.area).toBeGreaterThan(19);
    expect(r.code?.sizeM.area).toBeLessThan(27);
  });
});

describe('relativeTo() — the offline compass', () => {
  it('gives bearing and distance from two coordinates alone', () => {
    const target = decode('PYY-ZT7-WMR').center;
    const rel = relativeTo({ lat: 51.5074, lng: -0.2 }, target);
    expect(rel.distanceM).toBeGreaterThan(4000);
    expect(rel.distanceM).toBeLessThan(6000);
    expect(rel.bearingDeg).toBeGreaterThan(80);
    expect(rel.bearingDeg).toBeLessThan(100);
  });
});

describe('performance budget', () => {
  it('stays fast enough for typeahead at the default radius', () => {
    resolveLocalBlock('PYY', LONDON, { radiusM: 5000 }); // warm the partition cache
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) resolveLocalBlock('PYY', LONDON, { radiusM: 5000 });
    const perCall = (performance.now() - t0) / 10;
    expect(perCall).toBeLessThan(15);
  });

  it('exposes a radius ladder that starts inside frame budget', () => {
    expect(RADIUS_LADDER[0]).toBe(1000);
    const t0 = performance.now();
    resolveLocalBlock('PYY', LONDON, { radiusM: RADIUS_LADDER[0] });
    expect(performance.now() - t0).toBeLessThan(16);
  });
});
