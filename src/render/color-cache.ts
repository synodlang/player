// Packed 0xRRGGBB to "#rrggbb" strings, memoized and bounded.

import { toHex } from "../math/oklab.ts";

const LIMIT = 4096;
const cache = new Map<number, string>();

export function hexOf(rgb: number): string {
  let s = cache.get(rgb);
  if (s === undefined) {
    if (cache.size >= LIMIT) cache.clear();
    s = toHex(rgb);
    cache.set(rgb, s);
  }
  return s;
}
