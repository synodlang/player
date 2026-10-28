// Hit testing (decision 84, "Hit testing (readers)" in the formats guide).
//
// Both functions evaluate the scene at `at` and answer for that frame, so a host
// passes the time of the frame last drawn. Neither allocates per shape.

import { frameStateFor } from "../render/draw.ts";
import { computeViewport } from "../render/viewport.ts";
import type { Compiled } from "../scene/compile.ts";
import { KIND_CIRCLE, KIND_COUNTER, KIND_ICON, KIND_RECT } from "../scene/compile.ts";
import type { CompiledScene, HitResult, NodeBox, View } from "../types.ts";
import { counterColumns, evaluate } from "./evaluate.ts";

/** Extra reach of every shape, in CSS pixels. */
export const SLOP_PX = 4;
/** Reach of an outline-only shape: half the stroke width, in scene units. */
export const HALF_STROKE = 1;
/** Shapes whose world opacity is below this never hit. */
export const MIN_HIT_OPACITY = 0.05;

const KIND_NAMES = ["circle", "rect", "label", "line", "group", "icon", "counter"] as const;

/** Signed distance from (px, py) to a rounded rect of half sizes hw, hh and corner radius r. */
function rectDistance(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

export function hitTestScene(
  compiled: CompiledScene,
  at: number,
  view: View,
  x: number,
  y: number,
): HitResult | null {
  const c = compiled as Compiled;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const vp = computeViewport(c.width, c.height, view.width, view.height, view.pixelRatio);
  if (!(vp.scale > 0)) return null;
  const fs = frameStateFor(c);
  evaluate(c, at, fs);
  // the letterbox, then the camera with drift, are inverted to reach world coordinates
  const cam = fs.cam;
  const wx = ((x - vp.ox) / vp.scale - cam.tx) / cam.zoom;
  const wy = ((y - vp.oy) / vp.scale - cam.ty) / cam.zoom;
  const slop = SLOP_PX / (vp.scale * cam.zoom); // world units
  const { visible, a, b, c: wc, d, e, f, opacity, fill, stroke } = fs;

  for (let i = c.n - 1; i >= 0; i--) {
    const kd = c.kind[i]!;
    if (kd !== KIND_CIRCLE && kd !== KIND_RECT && kd !== KIND_ICON && kd !== KIND_COUNTER) continue;
    if (!visible[i] || opacity[i]! < MIN_HIT_OPACITY) continue;
    // icons and counters hit like a shape with a fill
    const solid = kd === KIND_ICON || kd === KIND_COUNTER;
    const hasFill = solid || fill[i]! >= 0;
    const hasStroke = stroke[i]! >= 0;
    if (!hasFill && !hasStroke) continue;
    const nIx = c.nodeIx[i]!;
    const msg = c.msgOf[i]!;
    if (nIx < 0 && msg < 0) continue;
    const ai = a[i]!;
    const bi = b[i]!;
    const ci = wc[i]!;
    const di = d[i]!;
    const det = ai * di - bi * ci;
    if (det === 0) continue;
    // world to local: the transform is a rotation and a uniform scale, so lengths scale by s
    const s = Math.sqrt(Math.abs(det));
    const dx = wx - e[i]!;
    const dy = wy - f[i]!;
    const lx = (di * dx - ci * dy) / det;
    const ly = (-bi * dx + ai * dy) / det;
    let hit: boolean;
    if (kd === KIND_CIRCLE) {
      const dist = Math.sqrt(lx * lx + ly * ly) - c.geomA[i]!;
      hit = hasFill ? dist <= slop / s : Math.abs(dist) <= (HALF_STROKE + slop) / s;
    } else if (solid) {
      // an icon is its square of side `size`, a counter its box of 8 units per column by 18
      const hw = kd === KIND_ICON ? c.geomA[i]! / 2 : 4 * counterColumns(fs.count[i]!);
      const hh = kd === KIND_ICON ? c.geomA[i]! / 2 : 9;
      hit = rectDistance(lx, ly, hw, hh, 0) <= slop / s;
    } else {
      const dist = rectDistance(lx, ly, c.geomA[i]! / 2, c.geomB[i]! / 2, c.geomR[i]!);
      hit = hasFill ? dist <= slop / s : Math.abs(dist) <= (HALF_STROKE + slop) / s;
    }
    if (!hit) continue;
    return {
      id: c.ids[i]!,
      kind: KIND_NAMES[kd] as HitResult["kind"],
      node: nIx >= 0 ? (c.nodeNames[nIx] as string) : null,
      msg: msg >= 0 ? msg : null,
    };
  }
  return null;
}

/**
 * The box of every node: the union of the bounding boxes of its drawn circles and
 * rects (CSS px, no slop). Nodes come in the file order of their first shape.
 */
export function nodeBoundsScene(compiled: CompiledScene, at: number, view: View): NodeBox[] {
  const c = compiled as Compiled;
  const vp = computeViewport(c.width, c.height, view.width, view.height, view.pixelRatio);
  if (!(vp.scale > 0)) return [];
  const fs = frameStateFor(c);
  evaluate(c, at, fs);
  const { visible, a, b, c: wc, d, e, f, fill, stroke } = fs;
  const boxes = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < c.n; i++) {
    const kd = c.kind[i]!;
    if (kd !== KIND_CIRCLE && kd !== KIND_RECT) continue;
    const nIx = c.nodeIx[i]!;
    if (nIx < 0 || !visible[i] || (fill[i]! < 0 && stroke[i]! < 0)) continue;
    if (a[i]! * d[i]! - b[i]! * wc[i]! === 0) continue;
    // half extents of the local shape, then the AABB of its image
    const hw = kd === KIND_CIRCLE ? c.geomA[i]! : c.geomA[i]! / 2;
    const hh = kd === KIND_CIRCLE ? c.geomA[i]! : c.geomB[i]! / 2;
    let hx: number;
    let hy: number;
    if (kd === KIND_CIRCLE) {
      hx = hw * Math.hypot(a[i]!, wc[i]!);
      hy = hw * Math.hypot(b[i]!, d[i]!);
    } else {
      hx = Math.abs(a[i]!) * hw + Math.abs(wc[i]!) * hh;
      hy = Math.abs(b[i]!) * hw + Math.abs(d[i]!) * hh;
    }
    const cam = fs.cam;
    const x0 = vp.ox + (cam.zoom * (e[i]! - hx) + cam.tx) * vp.scale;
    const y0 = vp.oy + (cam.zoom * (f[i]! - hy) + cam.ty) * vp.scale;
    const x1 = vp.ox + (cam.zoom * (e[i]! + hx) + cam.tx) * vp.scale;
    const y1 = vp.oy + (cam.zoom * (f[i]! + hy) + cam.ty) * vp.scale;
    const cur = boxes.get(nIx);
    if (!cur) boxes.set(nIx, [x0, y0, x1, y1]);
    else {
      if (x0 < cur[0]) cur[0] = x0;
      if (y0 < cur[1]) cur[1] = y0;
      if (x1 > cur[2]) cur[2] = x1;
      if (y1 > cur[3]) cur[3] = y1;
    }
  }
  const out: NodeBox[] = [];
  for (const [nIx, r] of boxes) {
    out.push({
      node: c.nodeNames[nIx] as string,
      x: r[0],
      y: r[1],
      w: r[2] - r[0],
      h: r[3] - r[1],
    });
  }
  return out;
}
