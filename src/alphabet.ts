import { ALPHABET, BASE, PlacepinError } from './constants.js';

/** Index (0…26 999) → three characters, most significant first. */
export function idxToChars(idx: number): string {
  const digits: number[] = [];
  let x = idx;
  for (let i = 0; i < 3; i++) {
    digits.push(x % BASE);
    x = Math.floor(x / BASE);
  }
  digits.reverse();
  return digits.map((d) => ALPHABET[d]).join('');
}

/** Three characters → index. Throws on anything outside the alphabet. */
export function charsToIdx(chars: string): number {
  let idx = 0;
  for (const c of chars) {
    const d = ALPHABET.indexOf(c);
    if (d === -1) {
      throw new PlacepinError(
        `Character "${c}" is not in the placepin alphabet.`,
        'BAD_CHARACTER',
      );
    }
    idx = idx * BASE + d;
  }
  return idx;
}

/**
 * Strips grouping and uppercases. Hyphens are grouping characters, not data,
 * and input is case-insensitive (spec §01).
 */
export function canonicalise(raw: string): string {
  return String(raw).replace(/[\s-]/g, '').toUpperCase();
}

/** Formats bare characters back into canonical `XXX-XXX-XXX` grouping. */
export function format(chars: string): string {
  const c = canonicalise(chars);
  return (c.match(/.{1,3}/g) ?? []).join('-');
}

export function isAlphabetChar(c: string): boolean {
  return ALPHABET.includes(c);
}

/** True for exactly three characters, all in the alphabet. */
export function isValidBlock(chars: string): boolean {
  const c = canonicalise(chars);
  return c.length === 3 && [...c].every(isAlphabetChar);
}

/** True for a well-formed code of 3, 6 or 9 characters. */
export function isValidCode(raw: string): boolean {
  const c = canonicalise(raw);
  return (
    c.length > 0 &&
    c.length <= 9 &&
    c.length % 3 === 0 &&
    [...c].every(isAlphabetChar)
  );
}
