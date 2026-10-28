// Fixed 32-bit integer hashes of the sketch noise (decision 120). Math.imul keeps
// every result identical in every engine.

/** FNV-1a-32 of the UTF-8 bytes of a string (shape ids are ASCII). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 255;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The first output of mulberry32 started at `state`, as a float in [0, 1). */
export function mulberry32(state: number): number {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The lattice value of value noise at integer k: 2 m(k) - 1 with m the first mulberry32 output. */
export function lattice(seed: number, k: number): number {
  return 2 * mulberry32((seed + Math.imul(k, 0x9e3779b1)) >>> 0) - 1;
}
