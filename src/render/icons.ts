// The icon set (implementation/icons.json, copied here and checked against dsl by
// scripts/sync-icons.ts): 16 icons of one to four contours, each an open polyline of
// 32 points in a 1x1 box. An icon of size s maps (x, y) to ((x - 0.5) s, (y - 0.5) s).

import data from "./icons.json" with { type: "json" };

export const CONTOUR_POINTS = 32;

export const ICON_NAMES: readonly string[] = Object.keys(data.icons);

/** Per icon, per contour: x and y interleaved, 64 numbers. */
export const ICONS: readonly (readonly Float64Array[])[] = ICON_NAMES.map((name) =>
  (data.icons as Record<string, number[][][]>)[name]!.map((c) => Float64Array.from(c.flat())),
);

const INDEX = new Map<string, number>(ICON_NAMES.map((n, i) => [n, i]));

/** Index of an icon name in ICON_NAMES, or -1. */
export function iconIndex(name: string): number {
  return INDEX.get(name) ?? -1;
}

/** A contour is closed when its last point repeats its first. */
export function isClosed(c: Float64Array): boolean {
  const e = 2 * (CONTOUR_POINTS - 1);
  return c[0] === c[e] && c[1] === c[e + 1];
}

const CENTER = new Float64Array(2 * CONTOUR_POINTS).fill(0.5);

/**
 * Contour i of the icon morphing from icon a to icon b at fraction t (smootherstep already
 * applied), pointwise; a contour one icon lacks collapses to the center. Writes 64 numbers
 * to out and returns whether the contour is closed (both ends closed, or the only one is).
 */
export function morphContour(
  a: number,
  b: number,
  i: number,
  t: number,
  out: Float64Array,
): boolean {
  const ca = ICONS[a]![i];
  const cb = ICONS[b]![i];
  const pa = ca ?? CENTER;
  const pb = cb ?? CENTER;
  if (t <= 0 || pa === pb) out.set(pa);
  else if (t >= 1) out.set(pb);
  else for (let k = 0; k < out.length; k++) out[k] = pa[k]! + (pb[k]! - pa[k]!) * t;
  const closedA = ca ? isClosed(ca) : true;
  const closedB = cb ? isClosed(cb) : true;
  return closedA && closedB;
}

/** Number of contours of the morph between icons a and b. */
export function contourCount(a: number, b: number): number {
  return Math.max(ICONS[a]!.length, ICONS[b]!.length);
}
