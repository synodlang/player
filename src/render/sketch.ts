// Sketch: the hand-drawn wobble of outlines (decision 120). Every outline is resampled to
// vertices 12 local units apart, and vertex i moves along the perpendicular of the chord
// from vertex i-1 to i+1 by s * 1.6 * n(i), with n value noise seeded by the shape.
// The wobble depends on the shape and not on time, so it never boils.

import { fnv1a32, lattice } from "../math/hash.ts";
import { rrPerimeter, rrPoint, TWO_PI } from "./outline.ts";

export const STEP = 12;
export const AMPLITUDE = 1.6;

/** A wobbled outline: two passes (seed and seed2) of n vertices, x and y interleaved. */
export interface Sketched {
  n: number;
  closed: boolean;
  p1: Float64Array;
  p2: Float64Array;
}

export function seedOf(id: string): number {
  return fnv1a32(id);
}

export function seed2Of(seed: number): number {
  return (seed ^ 0x9e3779b9) >>> 0;
}

/** Vertex count of an outline of the given length. */
export function vertexCount(length: number): number {
  return Math.max(4, Math.ceil(length / STEP));
}

let latt = new Float64Array(64);

/** Value noise n(i) at i / 3, in -1..1; `wrap` is the lattice period of a closed outline, or 0. */
function noiseAt(i: number, wrap: number): number {
  const x = i / 3;
  const k = Math.floor(x);
  const f = x - k;
  const w = f * f * (3 - 2 * f);
  const a = latt[wrap > 0 ? k % wrap : k]!;
  const b = latt[wrap > 0 ? (k + 1) % wrap : k + 1]!;
  return a + (b - a) * w;
}

/** Moves the n base vertices (x, y interleaved) by the wobble of `seed` and strength s into out. */
function displace(
  base: Float64Array,
  n: number,
  closed: boolean,
  seed: number,
  s: number,
  out: Float64Array,
): void {
  const wrap = closed ? Math.ceil(n / 3) : 0;
  const lat = (closed ? wrap : Math.ceil((n - 1) / 3)) + 2;
  if (latt.length < lat) latt = new Float64Array(lat * 2);
  for (let k = 0; k < lat; k++) latt[k] = lattice(seed, k);
  for (let i = 0; i < n; i++) {
    const a = closed ? (i + n - 1) % n : Math.max(0, i - 1);
    const b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const cx = base[2 * b]! - base[2 * a]!;
    const cy = base[2 * b + 1]! - base[2 * a + 1]!;
    const len = Math.hypot(cx, cy);
    const amount = s * AMPLITUDE * noiseAt(i, wrap);
    if (len > 0) {
      out[2 * i] = base[2 * i]! + (amount * cy) / len;
      out[2 * i + 1] = base[2 * i + 1]! - (amount * cx) / len;
    } else {
      out[2 * i] = base[2 * i]!;
      out[2 * i + 1] = base[2 * i + 1]!;
    }
  }
}

function finish(base: Float64Array, n: number, closed: boolean, seed: number, s: number): Sketched {
  const p1 = new Float64Array(2 * n);
  const p2 = new Float64Array(2 * n);
  displace(base, n, closed, seed, s, p1);
  displace(base, n, closed, seed2Of(seed), s, p2);
  return { n, closed, p1, p2 };
}

export function sketchCircle(r: number, seed: number, s: number): Sketched {
  const n = vertexCount(TWO_PI * r);
  const base = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (TWO_PI * i) / n;
    base[2 * i] = r * Math.cos(a);
    base[2 * i + 1] = r * Math.sin(a);
  }
  return finish(base, n, true, seed, s);
}

export function sketchRect(hw: number, hh: number, rad: number, seed: number, s: number): Sketched {
  const per = rrPerimeter(hw, hh, rad);
  const n = vertexCount(per);
  const base = new Float64Array(2 * n);
  const pt = new Float64Array(2);
  for (let i = 0; i < n; i++) {
    rrPoint(hw, hh, rad, (per * i) / n, pt);
    base[2 * i] = pt[0]!;
    base[2 * i + 1] = pt[1]!;
  }
  return finish(base, n, true, seed, s);
}

/** An open straight outline along +x from -over to len + over (overshoot 4 s at each end). */
export function sketchSegment(len: number, over: number, seed: number, s: number): Sketched {
  const total = len + 2 * over;
  const n = vertexCount(total);
  const base = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    base[2 * i] = -over + (total * i) / (n - 1);
    base[2 * i + 1] = 0;
  }
  return finish(base, n, false, seed, s);
}

/**
 * A polyline of m points (x, y interleaved, closed when its last point repeats the first,
 * which is then dropped) resampled evenly and wobbled. `ox, oy, scale` map the points.
 */
export function sketchPolyline(
  pts: ArrayLike<number>,
  m: number,
  closed: boolean,
  scale: number,
  ox: number,
  oy: number,
  seed: number,
  s: number,
): Sketched {
  const count = closed ? m - 1 : m;
  const segs = closed ? count : count - 1;
  let length = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % count;
    length += Math.hypot(pts[2 * j]! - pts[2 * i]!, pts[2 * j + 1]! - pts[2 * i + 1]!) * scale;
  }
  const n = vertexCount(length);
  const base = new Float64Array(2 * n);
  const target = (i: number) => (closed ? (length * i) / n : (length * i) / (n - 1));
  let seg = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const t = target(i);
    for (;;) {
      const j = (seg + 1) % count;
      const l =
        Math.hypot(pts[2 * j]! - pts[2 * seg]!, pts[2 * j + 1]! - pts[2 * seg + 1]!) * scale;
      if (t <= acc + l || seg >= segs - 1) {
        const u = l > 0 ? Math.min(1, Math.max(0, (t - acc) / l)) : 0;
        base[2 * i] = ox + (pts[2 * seg]! + (pts[2 * j]! - pts[2 * seg]!) * u) * scale;
        base[2 * i + 1] =
          oy + (pts[2 * seg + 1]! + (pts[2 * j + 1]! - pts[2 * seg + 1]!) * u) * scale;
        break;
      }
      acc += l;
      seg++;
    }
  }
  return finish(base, n, closed, seed, s);
}
