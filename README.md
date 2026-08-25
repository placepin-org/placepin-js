# @placepin/core-js

> [!WARNING]
> **Under construction — v0.x, and not ready to build on.**
> The protocol is still a draft, the API is unstable, and anything here can
> change without notice or a deprecation period. Please don't depend on it in
> something you care about yet.
>
> For what placepin is and where it's going, see
> **[about.placepin.org](https://about.placepin.org)**.

The [placepin](https://placepin.org) location protocol in TypeScript — a 3-3-3
hierarchical geographic code that turns any point on Earth into nine characters
and back again.

```
PYY-ZT7-WMR
│   │   └── region  ≈137 km
│   └────── area    ≈840 m
└────────── local   ≈5 m
```

**Zero dependencies. No lookup table. No network. No service to be cut off from.**
Every encode and decode partitions its parent box on the fly, which is what lets
a placepin client work entirely offline.

Protocol **v5 (draft)**. Not yet frozen — see [Stability](#stability).

## Install

```sh
npm install @placepin/core-js
```

## Use

```ts
import { encode, decode } from '@placepin/core-js';

encode(51.5074, -0.1278).code;   // 'PYY-ZT7-WMR'
decode('PYY-ZT7-WMR').center;    // { lat: 51.507387, lng: -0.127806 }
```

A code can be shortened by dropping blocks **from the left**. The region survives
truncation; the exact spot does not.

```ts
decode('WMR').tier;              // 'region'  ≈137 km
decode('ZT7-WMR').tier;          // 'area'    ≈840 m
decode('PYY-ZT7-WMR').tier;      // 'leaf'    ≈5 m
```

Every decode also exposes the bounds of each level it passed through, so a UI can
draw the whole dive-down:

```ts
const { levels, bounds, center } = decode('PYY-ZT7-WMR');
// levels[0] = leaf cell, levels[1] = area cell, levels[2] = region cell
```

## Two layers, deliberately separated

The package has two entry points, and the boundary between them is normative.

### `@placepin/core-js` — the protocol

`encode`, `decode`, the grid, and geodesy. What a code **means**. This never
changes for a product reason.

### `@placepin/core-js/resolver` — the product layer

Proximity search, for when someone knows only the local block. Spec §01 keeps
this **outside** `decode()`, and so does this package:

> Software MUST NOT decode a 3-character input as Block 1 (local) in isolation.
> A product feature that lets someone type just a local value and resolves it
> against their approximate location is a separate, non-normative
> search/autocomplete feature built on top of `decode()`.

```ts
import { resolveLocalBlock, interpret } from '@placepin/core-js/resolver';

// "I was told PYY. Where near me is that?"
resolveLocalBlock('PYY', { lat: 51.5074, lng: -0.1278 }, { radiusM: 5000 });
// → [{ code: 'PYY-ZT7-WMR', distanceM: 1, bearingDeg: 196, ... }, ...]
```

An origin is **required** — it throws without one, because a bare local block
genuinely means nothing on its own.

Search is *computed*, never looked up. Spec §08 is normative here: two codes
sharing a local block are usually continents apart, so no index would help. The
resolver enumerates the area cells physically near you and asks what the typed
block names inside each. That is also why it works offline.

### `interpret()` — handling ambiguity honestly

Three characters is two different claims. Normatively it is a region code. It is
also exactly what someone types when the local block is all they were given.

```ts
const r = interpret('WMR', origin);
r.kind;         // 'ambiguous'
r.code;         // the region reading — always the normative decode
r.candidates;   // nearby local-block matches
r.notice;       // what the UI is obliged to tell the person
```

Both readings come back. Show them side by side; never pick one silently.

## Offline navigation

`distance`, `bearing` and `meanHeading` are pure trigonometry, so a device with a
GPS fix and no connection can still point at a code.

```ts
import { distance, bearing, meanHeading } from '@placepin/core-js';

bearing(here.lat, here.lng, there.lat, there.lng);   // degrees from true north
meanHeading([359, 1, 358, 2]);                       // ≈0 — see below
```

`meanHeading` averages unit vectors rather than numbers. Headings wrap at 360°,
so the arithmetic mean of 359° and 1° is 180° — exactly backwards, and precisely
when you are pointing north.

## Conformance

Spec §03: *conformance is defined by the test vectors in Appendix A, not by the
prose.* Transcendental functions are not bit-identical across platforms, so the
vectors are the definition of a conforming build — and shipping them is a MUST.

```ts
import { VECTORS } from '@placepin/core-js/vectors';
```

If you are writing another implementation, test against these. Do not transcribe
them by hand.

This build reproduces all ten exactly, alongside 2,000 random round-trips, 500
nesting checks, and the `total === FACTOR` partition invariant at every level.

```sh
npm test
```

## Size

The offline promise is a size promise. Bundled, minified and gzipped:

| | |
|---|---|
| protocol only | **2.7 KB** |
| protocol + resolver | **2.9 KB** |

```sh
npm run size
```

## Performance

Measured on the reference build:

| Operation | Time |
|---|---|
| `decode` | 0.003 ms |
| `encode` | 0.065 ms |
| `resolveLocalBlock`, 1 km | 0.06 ms |
| `resolveLocalBlock`, 5 km | 1.1 ms |
| `resolveLocalBlock`, 20 km | 57 ms |

Search cost grows with the square of the radius. Use `RADIUS_LADDER` — search
narrow on each keystroke and widen only when asked. Past ~20 km, use a worker.

Partitions are memoised, which is what keeps a 5 km search at 1 ms rather than 60.

## Stability

**Nothing this package emits is a durable code yet.** Spec §10: nothing before
v5-final is durable, and §02 leaves the letter `Y` unresolved pending
transcription trials. If `Y` leaves the alphabet, **every existing code changes
meaning** — and there is no checksum to catch it (§06).

Two consequences for anything built on this:

1. **Persist `PROTOCOL_VERSION` alongside every stored code.** A future build can
   then refuse or migrate rather than silently misplace a pin.
2. **Do not promise permanence in your copy.** "Saved", not "forever".

This package stays on `0.x` until the protocol freezes. `1.0.0` is reserved for
that moment. While on `0.x`, a change that moves any conformance vector is a
**minor** bump — and npm's caret is pinned to the minor below 1.0, so `^0.1.0`
will not resolve `0.2.0`. A protocol change cannot slip into your build through a
routine update; someone has to take it deliberately.

## Alphabet

```
0 1 2 3 4 5 6 7 8 9 B C D F G H J K M N P Q R S T V W X Y Z
```

Thirty characters. No vowels, so a code can never spell a word. No `L`, which
removes the `1`/`l`/`I` confusion class — and that in turn makes `0` and `1` safe
to keep, since `O` and `I` are already gone.

## Licence

Apache-2.0. The specification text is CC BY 4.0 and lives in
[placepin-spec](https://github.com/placepin-org/placepin-spec).
