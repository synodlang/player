// Outlines: the rounded rectangle and the circle walked from their top center
// clockwise, as exact canvas paths and as points at an arc length; and a polyline
// cut to a fraction. Pure functions of numbers; nothing here allocates per call
// except where a function says so.

import type { Ctx2D } from "../types.ts";

export const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const TOP = -HALF_PI;

/** Length of the outline of a rounded rect of half sizes hw, hh and corner radius r. */
export function rrPerimeter(hw: number, hh: number, r: number): number {
  return 4 * (hw - r) + 4 * (hh - r) + TWO_PI * r;
}

// Lengths of the nine pieces: top half, TR corner, right, BR corner, bottom, BL corner,
// left, TL corner, top half.
const LEN = new Float64Array(9);

function lengths(hw: number, hh: number, r: number): void {
  const arc = HALF_PI * r;
  LEN[0] = hw - r;
  LEN[1] = arc;
  LEN[2] = 2 * (hh - r);
  LEN[3] = arc;
  LEN[4] = 2 * (hw - r);
  LEN[5] = arc;
  LEN[6] = 2 * (hh - r);
  LEN[7] = arc;
  LEN[8] = hw - r;
}

/** Writes the point of the outline at arc length s from the top center, clockwise, to out[0..1]. */
export function rrPoint(hw: number, hh: number, r: number, s: number, out: Float64Array): void {
  lengths(hw, hh, r);
  let o = 0;
  for (let k = 0; k < 9; k++) {
    const len = LEN[k]!;
    if (s <= o + len || k === 8) {
      const t = len > 0 ? Math.min(1, Math.max(0, (s - o) / len)) : 0;
      pieceAt(k, t, hw, hh, r, out);
      return;
    }
    o += len;
  }
}

/** Point at fraction t of piece k. */
function pieceAt(k: number, t: number, hw: number, hh: number, r: number, out: Float64Array): void {
  switch (k) {
    case 0:
      out[0] = t * (hw - r);
      out[1] = -hh;
      return;
    case 8:
      out[0] = -hw + r + t * (hw - r);
      out[1] = -hh;
      return;
    case 2:
      out[0] = hw;
      out[1] = -hh + r + t * 2 * (hh - r);
      return;
    case 4:
      out[0] = hw - r - t * 2 * (hw - r);
      out[1] = hh;
      return;
    case 6:
      out[0] = -hw;
      out[1] = hh - r - t * 2 * (hh - r);
      return;
    default: {
      // corners 1, 3, 5, 7: centers TR, BR, BL, TL; start angles -90, 0, 90, 180 degrees
      const a = TOP + ((k - 1) / 2) * HALF_PI + t * HALF_PI;
      const cx = k === 1 || k === 3 ? hw - r : -hw + r;
      const cy = k === 1 || k === 7 ? -hh + r : hh - r;
      out[0] = cx + r * Math.cos(a);
      out[1] = cy + r * Math.sin(a);
    }
  }
}

/**
 * Adds to the current path the part of the rounded rect outline from arc length s0 to s1
 * (top center, clockwise), as lines and arcs. Starts a subpath at s0.
 */
export function rrPath(
  ctx: Ctx2D,
  hw: number,
  hh: number,
  r: number,
  s0: number,
  s1: number,
): void {
  lengths(hw, hh, r);
  let o = 0;
  let started = false;
  for (let k = 0; k < 9; k++) {
    const len = LEN[k]!;
    const a = Math.max(s0, o);
    const b = Math.min(s1, o + len);
    if (len > 0 && b > a) {
      const t0 = (a - o) / len;
      const t1 = (b - o) / len;
      if (k % 2 === 1) {
        const cx = k === 1 || k === 3 ? hw - r : -hw + r;
        const cy = k === 1 || k === 7 ? -hh + r : hh - r;
        const base = TOP + ((k - 1) / 2) * HALF_PI;
        ctx.arc(cx, cy, r, base + t0 * HALF_PI, base + t1 * HALF_PI);
      } else {
        pieceAt(k, t0, hw, hh, r, PT);
        if (!started) ctx.moveTo(PT[0]!, PT[1]!);
        pieceAt(k, t1, hw, hh, r, PT);
        ctx.lineTo(PT[0]!, PT[1]!);
      }
      started = true;
    }
    o += len;
  }
}
const PT = new Float64Array(2);

/** A circle of radius r centered at (cx, cy) from fraction f0 to f1 of its outline (top center, clockwise). */
export function circlePath(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  r: number,
  f0: number,
  f1: number,
): void {
  ctx.arc(cx, cy, r, TOP + TWO_PI * f0, TOP + TWO_PI * f1);
}

/** The angle of the top center of a circle. */
export const CIRCLE_START = TOP;

/**
 * Adds the part of the polyline xy[0..2n) between fractions f0 and f1 of its length to the
 * path; the polyline is closed when `closed`. Points are mapped by
 * (ox + ax x + bx y, oy + ay x + by y).
 */
export function polyPath(
  ctx: Ctx2D,
  xy: Float64Array,
  n: number,
  closed: boolean,
  f0: number,
  f1: number,
  m?: ArrayLike<number>,
): void {
  if (n < 2) return;
  const ox = m ? m[0]! : 0;
  const oy = m ? m[1]! : 0;
  const ax = m ? m[2]! : 1;
  const ay = m ? m[3]! : 0;
  const bx = m ? m[4]! : 0;
  const by = m ? m[5]! : 1;
  const px = (i: number) => ox + ax * xy[2 * i]! + bx * xy[2 * i + 1]!;
  const py = (i: number) => oy + ay * xy[2 * i]! + by * xy[2 * i + 1]!;
  const segs = closed ? n : n - 1;
  if (f0 <= 0 && f1 >= 1) {
    ctx.moveTo(px(0), py(0));
    for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(i));
    if (closed) ctx.closePath();
    return;
  }
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    total += Math.hypot(xy[2 * j]! - xy[2 * i]!, xy[2 * j + 1]! - xy[2 * i + 1]!);
  }
  const s0 = f0 * total;
  const s1 = f1 * total;
  let o = 0;
  let started = false;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(xy[2 * j]! - xy[2 * i]!, xy[2 * j + 1]! - xy[2 * i + 1]!);
    const a = Math.max(s0, o);
    const b = Math.min(s1, o + len);
    if (len > 0 && b > a) {
      const t0 = (a - o) / len;
      const t1 = (b - o) / len;
      const x0 = px(i) + (px(j) - px(i)) * t0;
      const y0 = py(i) + (py(j) - py(i)) * t0;
      if (!started) ctx.moveTo(x0, y0);
      ctx.lineTo(px(i) + (px(j) - px(i)) * t1, py(i) + (py(j) - py(i)) * t1);
      started = true;
    }
    o += len;
  }
}
