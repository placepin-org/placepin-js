# placepin-js — working notes

`@placepin/core-js`. The placepin location protocol in TypeScript. Zero
dependencies, zero I/O, no lookup table, no network.

The specification is `../placepin-spec/SPEC.md`. **It governs this package.**
When the two disagree, the spec is right and this is a bug.

## Run

```sh
npm install
npm test          # 64 tests, vitest
npm run build     # tsc → dist/
npm run size      # bundled + minified + gzipped
```

## State

Complete and conformant. All ten Appendix A vectors reproduce exactly, plus
2,000 random round-trips, 500 nesting checks and the `total === FACTOR`
invariant at every level.

**2.7 KB** gzipped for the protocol, **2.9 KB** with the resolver.

## Do not refactor the arithmetic

§03, normative:

> Implementations MUST NOT reorder, refactor or "simplify" [the formulas],
> because `floor()` boundaries turn one-ulp differences into different grids.

`src/partition.ts` mirrors the specification's operation order exactly. It is
not written for elegance and should not be improved. A "cleaner" expression that
reassociates a multiplication can move a cell boundary, which moves what a code
means, silently.

The same applies to `boundsFromRowCol`: the last row and column **snap** to the
parent's exact upper bound rather than accumulating. This is not defensive
padding — accumulation overshoots by one ulp and breaks the nesting guarantee.
The pre-snapping reference implementation failed containment checks.

## Conformance is the gate, not the source

§03: _conformance is defined by the test vectors in Appendix A, not by the
prose_, because `sin`/`cos`/`sqrt` are not bit-identical across platforms.

- If a change makes a vector fail, the change is wrong. Not the vector.
- Changing a vector **is** changing the protocol — that happens in
  `placepin-spec`, deliberately, with a version bump.
- `VECTORS` is exported from this package because §03 makes shipping the suite
  a MUST. Anyone writing another implementation imports it rather than
  retyping Appendix A.

## The normative / non-normative boundary

Two entry points, and the split is required by §01:

| Entry                        | Status        | Contains                              |
| ---------------------------- | ------------- | ------------------------------------- |
| `@placepin/core-js`          | **normative** | `encode`, `decode`, the grid, geodesy |
| `@placepin/core-js/resolver` | non-normative | `resolveLocalBlock`, `interpret`      |
| `@placepin/core-js/vectors`  | fixtures      | Appendix A                            |

> Software MUST NOT decode a 3-character input as Block 1 (local) in isolation.
> A product feature that lets someone type just a local value and resolves it
> against their approximate location is a **separate, non-normative** feature
> built on top of `decode()` — it is not a change to what a bare 3-character
> string decodes to.

**Do not re-export the resolver from the main entry.** The boundary is meant to
be visible at the import line. A consumer who only wants the protocol should be
able to tree-shake the product layer away entirely.

`resolveLocalBlock` throws without an origin. That is correct — a bare local
block genuinely means nothing on its own. Do not add a default.

## Why search is computed rather than indexed

§08, normative: _Prefix-sharing implies nothing at all._ Two codes starting with
the same local block are usually continents apart, so a prefix index over
placepin codes is meaningless by construction.

The resolver enumerates the area cells physically near the origin and asks what
the typed block names inside each. This is also why it works offline — there was
never a server to ask.

Partitions are memoised (`src/partition.ts`), which is what keeps a 5 km search
at ~1 ms rather than ~60. Do not remove the cache.

Cost grows with the square of the radius:

| radius | time                          |
| ------ | ----------------------------- |
| 1 km   | 0.06 ms                       |
| 5 km   | 1.1 ms                        |
| 20 km  | **57 ms** — past frame budget |

`RADIUS_LADDER` exists for this. Search narrow on each keystroke; widen only
when asked.

## Versioning

Stays `0.x` until the protocol freezes. `1.0.0` is reserved for that moment and
means it.

- A change that moves any vector is a **minor** bump while on `0.x`. Never a
  patch.
- npm pins carets to the minor below 1.0, so `^0.1.0` will not resolve `0.2.0`.
  A protocol change cannot enter a consumer through a routine update.
- `PROTOCOL_VERSION` is exported so anything persisting a code can persist the
  revision alongside it. §10: v4 and v5 codes are not interchangeable and a
  mismatch decodes to the _wrong location_ rather than failing.

## Layout

| File               | Responsibility                                                       |
| ------------------ | -------------------------------------------------------------------- |
| `src/constants.ts` | Alphabet, base, factor, Earth radius, `PROTOCOL_VERSION`, error type |
| `src/partition.ts` | **The normative routine.** Do not refactor. Memoised.                |
| `src/codec.ts`     | `encode`, `decode`, `encodePath`, `normalize`                        |
| `src/alphabet.ts`  | Base-30 conversion, canonicalisation, validation                     |
| `src/geo.ts`       | Distance, bearing, cell metrics, `meanHeading`                       |
| `src/resolver.ts`  | Non-normative proximity search and `interpret()`                     |
| `src/vectors.ts`   | Appendix A                                                           |

`meanHeading` averages **unit vectors**, not numbers. Headings wrap at 360°, so
the arithmetic mean of 359° and 1° is 180° — exactly backwards, and precisely
when someone is pointing north.

## Outstanding

- **`LICENSE` is the short-form Apache notice, not the full text.** Replace from
  https://www.apache.org/licenses/LICENSE-2.0.txt.
- Consider taking `@placepin/vectors` as a dev dependency once published, rather
  than keeping a local `src/vectors.ts`. That makes this package consume the
  fixtures exactly as a third-party implementation would — the reference
  implementation should not mark its own exam paper.

## Conventions

Brand is lowercase
**placepin**, never "PlacePin".
