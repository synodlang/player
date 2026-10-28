// The drawn effects (0.3): flash, circumscribe, ripple and sweep, added on top of a shape
// (or after the last member of a group). indicate is applied by evaluate() (a scale and a
// fill mix) and glow by the shadow state. Everything is a fixed function of the box of the
// shape, the progress p and the sketch seed, so display lists compare exactly.

import { BOX, boxOf } from "../eval/evaluate.ts";
import type { FrameState } from "../eval/frame-state.ts";
import type { Compiled } from "../scene/compile.ts";
import {
  EFFECT_CIRCUMSCRIBE,
  EFFECT_FLASH,
  EFFECT_RIPPLE,
  EFFECT_SWEEP,
  KIND_CIRCLE,
  KIND_GROUP,
  KIND_LINE,
  KIND_RECT,
} from "../scene/compile.ts";
import { hexOf } from "./color-cache.ts";
import { circlePath, polyPath, rrPath, rrPerimeter, TWO_PI } from "./outline.ts";
import { P, setAlpha, setDash, setStroke, setWidth, shadowOff, worldTransform } from "./paint.ts";
import { type Sketched, sketchCircle, sketchRect, sketchSegment } from "./sketch.ts";

const RAY_COUNT = 12;
const RAY_LENGTH = 24;
const RAY_GAP = 6;
const OUTSET = 8;
const RIPPLE_GROWTH = 60;
const SWEEP_SHARE = 0.2;

/** Matrix scratch of polyPath: translate to a center. */
const M = new Float64Array(6);

function at(cx: number, cy: number): Float64Array {
  M[0] = cx;
  M[1] = cy;
  M[2] = 1;
  M[3] = 0;
  M[4] = 0;
  M[5] = 1;
  return M;
}

/** Strokes a sketched outline (two passes) after `path` added pass p1 or p2 to a fresh path. */
function strokeSketched(
  sk: Sketched,
  f0: number,
  f1: number,
  cx: number,
  cy: number,
  alpha: number,
): void {
  const ctx = P.ctx;
  const m = at(cx, cy);
  ctx.beginPath();
  polyPath(ctx, sk.p1, sk.n, sk.closed, f0, f1, m);
  setAlpha(alpha);
  ctx.stroke();
  ctx.beginPath();
  polyPath(ctx, sk.p2, sk.n, sk.closed, f0, f1, m);
  setAlpha(alpha * 0.6);
  ctx.stroke();
}

/** The color of the effect of shape i, as a packed color. */
function effectColor(c: Compiled, fs: FrameState, i: number): number {
  if (c.kind[i] === KIND_GROUP) {
    const f = fs.bFill[i]!;
    if (f >= 0) return fs.fill[f]!;
    const s = fs.bStroke[i]!;
    return s >= 0 ? fs.stroke[s]! : c.ink;
  }
  const fc = fs.fill[i]!;
  if (fc >= 0) return fc;
  const sc = fs.stroke[i]!;
  return sc >= 0 ? sc : c.ink;
}

/**
 * Draws the effect of shape i (code fs.eff[i], progress fs.effP[i]) when it is a drawn
 * effect. `seed` is the sketch seed of the shape and `sketch` the strength s.
 */
export function drawEffect(
  c: Compiled,
  fs: FrameState,
  i: number,
  seed: number,
  sketch: number,
): void {
  const code = fs.eff[i]!;
  if (code < EFFECT_FLASH) return;
  const kd = c.kind[i]!;
  const op = fs.opacity[i]!;
  const p = fs.effP[i]!;
  const ctx = P.ctx;

  // the box, in world coordinates
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (kd === KIND_LINE) {
    x0 = Math.min(fs.e[i]!, fs.x2[i]!);
    y0 = Math.min(fs.f[i]!, fs.y2[i]!);
    x1 = Math.max(fs.e[i]!, fs.x2[i]!);
    y1 = Math.max(fs.f[i]!, fs.y2[i]!);
  } else if (kd === KIND_GROUP) {
    x0 = fs.bx0[i]!;
    y0 = fs.by0[i]!;
    x1 = fs.bx1[i]!;
    y1 = fs.by1[i]!;
    if (!(x1 >= x0 && y1 >= y0)) return; // no drawn member
  } else {
    boxOf(c, fs, i);
    x0 = BOX[0]!;
    y0 = BOX[1]!;
    x1 = BOX[2]!;
    y1 = BOX[3]!;
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2;
  const hh = (y1 - y0) / 2;
  const col = code === EFFECT_SWEEP ? c.ink : effectColor(c, fs, i);

  shadowOff();
  setStroke(hexOf(col));
  setWidth(code === EFFECT_SWEEP ? 4 : 2);
  setDash(0, 0);
  worldTransform();

  switch (code) {
    case EFFECT_FLASH: {
      const r0 = Math.hypot(hw, hh) + RAY_GAP;
      const a = op * (1 - p);
      if (sketch > 0) {
        for (let k = 0; k < RAY_COUNT; k++) {
          const ang = (k * TWO_PI) / RAY_COUNT;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);
          const sk = sketchSegment(
            RAY_LENGTH,
            0,
            (seed ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0,
            sketch,
          );
          M[0] = cx + dx * r0;
          M[1] = cy + dy * r0;
          M[2] = dx;
          M[3] = dy;
          M[4] = -dy;
          M[5] = dx;
          ctx.beginPath();
          polyPath(ctx, sk.p1, sk.n, false, 0, 1, M);
          setAlpha(a);
          ctx.stroke();
          ctx.beginPath();
          polyPath(ctx, sk.p2, sk.n, false, 0, 1, M);
          setAlpha(a * 0.6);
          ctx.stroke();
        }
      } else {
        setAlpha(a);
        ctx.beginPath();
        for (let k = 0; k < RAY_COUNT; k++) {
          const ang = (k * TWO_PI) / RAY_COUNT;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);
          ctx.moveTo(cx + dx * r0, cy + dy * r0);
          ctx.lineTo(cx + dx * (r0 + RAY_LENGTH), cy + dy * (r0 + RAY_LENGTH));
        }
        ctx.stroke();
      }
      return;
    }
    case EFFECT_CIRCUMSCRIBE: {
      const frac = Math.min(1, 2 * p);
      const a = op * (p < 0.5 ? 1 : 2 * (1 - p));
      if (frac <= 0) return;
      if (kd === KIND_CIRCLE) {
        const r = hw + OUTSET;
        if (sketch > 0) strokeSketched(sketchCircle(r, seed, sketch), 0, frac, cx, cy, a);
        else {
          setAlpha(a);
          ctx.beginPath();
          circlePath(ctx, cx, cy, r, 0, frac);
          ctx.stroke();
        }
        return;
      }
      const w = hw + OUTSET;
      const h = hh + OUTSET;
      // a rect keeps its corner rounding (scaled by its world scale) plus the outset
      let rad = OUTSET;
      if (kd === KIND_RECT) {
        const s = hw > 0 ? hw / (c.geomA[i]! / 2) : 0;
        rad = c.geomR[i]! * s + OUTSET;
      }
      rad = Math.min(rad, w, h);
      if (sketch > 0) {
        strokeSketched(sketchRect(w, h, rad, seed, sketch), 0, frac, cx, cy, a);
      } else {
        setAlpha(a);
        ctx.setTransform(P.K, 0, 0, P.K, P.K * cx + P.TX, P.K * cy + P.TY);
        ctx.beginPath();
        rrPath(ctx, w, h, rad, 0, frac * rrPerimeter(w, h, rad));
        ctx.stroke();
      }
      return;
    }
    case EFFECT_RIPPLE: {
      const r = Math.max(hw, hh) + RIPPLE_GROWTH * p;
      const a = op * (1 - p);
      if (sketch > 0) strokeSketched(sketchCircle(r, seed, sketch), 0, 1, cx, cy, a);
      else {
        setAlpha(a);
        ctx.beginPath();
        circlePath(ctx, cx, cy, r, 0, 1);
        ctx.stroke();
      }
      return;
    }
    default: {
      // sweep: a segment of 20% of the length, centered at 1.2 p - 0.1
      const center = 1.2 * p - 0.1;
      const f0 = Math.max(0, center - SWEEP_SHARE / 2);
      const f1 = Math.min(1, center + SWEEP_SHARE / 2);
      if (!(f1 > f0)) return;
      if (kd === KIND_LINE) {
        const ex = fs.e[i]!;
        const ey = fs.f[i]!;
        const dx = fs.x2[i]! - ex;
        const dy = fs.y2[i]! - ey;
        const len = Math.hypot(dx, dy);
        if (sketch > 0 && len > 0) {
          const sk = sketchSegment(len, 0, seed, sketch);
          M[0] = ex;
          M[1] = ey;
          M[2] = dx / len;
          M[3] = dy / len;
          M[4] = -dy / len;
          M[5] = dx / len;
          ctx.beginPath();
          polyPath(ctx, sk.p1, sk.n, false, f0, f1, M);
          setAlpha(op);
          ctx.stroke();
          ctx.beginPath();
          polyPath(ctx, sk.p2, sk.n, false, f0, f1, M);
          setAlpha(op * 0.6);
          ctx.stroke();
        } else {
          setAlpha(op);
          ctx.beginPath();
          ctx.moveTo(ex + dx * f0, ey + dy * f0);
          ctx.lineTo(ex + dx * f1, ey + dy * f1);
          ctx.stroke();
        }
        return;
      }
      if (sketch > 0) {
        const sk = sketchRect(hw, hh, 0, seed, sketch);
        strokeSketched(sk, f0, f1, cx, cy, op);
      } else {
        setAlpha(op);
        ctx.setTransform(P.K, 0, 0, P.K, P.K * cx + P.TX, P.K * cy + P.TY);
        ctx.beginPath();
        const per = rrPerimeter(hw, hh, 0);
        rrPath(ctx, hw, hh, 0, f0 * per, f1 * per);
        ctx.stroke();
      }
    }
  }
}
