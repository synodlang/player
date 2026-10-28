// evaluate(compiled, at, state): the scene at time `at`, written into a
// preallocated FrameState. Allocation free. This is the API the renderer uses:
//
//   const c = compileScene(scene) as Compiled;      // once per scene (src/scene/compile.ts)
//   const fs = createFrameState(c);                 // once per compiled scene
//   evaluate(c, at, fs);                            // per frame; clamps at to [0, duration]
//   for (let i = 0; i < c.n; i++) {                 // file order is z-order, back to front
//     if (c.kind[i] === KIND_GROUP || !fs.visible[i]) continue;
//     // draw shape i: kind c.kind[i]; geometry c.geomA/geomB/geomR[i]; transform fs.a..fs.f[i];
//     // colors fs.fill/fs.stroke[i] (-1 none); alpha fs.opacity[i]; glow fs.glow[i];
//     // label text c.strings[fs.text[i]]; line from (e, f) to (x2, y2) in scene space.
//   }
//
// Semantics are the reader rules of 04-formats ("Drawing a scene"): each property
// interpolates between the keys that set it; numbers with smootherstep (x, y, scale,
// rotation and the camera with the spring curve under style.easing "spring"), colors in
// OKLab, text, effect, curve, trail, dash, role and face step; icons morph pointwise;
// before its first key a property has its default; a member evaluated before its group's
// first key sees the group's first-key values.

import { smootherstep, spring } from "../math/ease.ts";
import { mixOklab, rgbToOklab } from "../math/oklab.ts";
import { cameraAt } from "../render/camera.ts";
import type { Compiled, Track } from "../scene/compile.ts";
import {
  EFFECT_GLOW,
  EFFECT_INDICATE,
  KIND_CIRCLE,
  KIND_COUNTER,
  KIND_GROUP,
  KIND_ICON,
  KIND_LABEL,
  KIND_RECT,
  NUM_DEFAULTS,
  P_COUNT,
  P_CURVE,
  P_DASH,
  P_DRAW,
  P_EFFECT,
  P_FACE,
  P_FILL,
  P_HALO,
  P_ICON,
  P_OPACITY,
  P_ROLE,
  P_ROTATION,
  P_SCALE,
  P_STROKE,
  P_TEXT,
  P_TRAIL,
  P_X,
  P_Y,
} from "../scene/compile.ts";
import type { FrameState } from "./frame-state.ts";

/** Shapes whose composed opacity is below this are not drawn. */
export const MIN_OPACITY = 1 / 512;

const DEG = Math.PI / 180;

/** Index of the last key of shape i with time <= t, or start[i] - 1. Cached cursor, then search. */
function find(tr: Track, i: number, t: number): number {
  const s = tr.start[i]!;
  const e = tr.start[i + 1]!;
  const times = tr.times;
  const k = tr.cursor[i]!;
  if (k >= s - 1 && k < e) {
    if (k < s || times[k]! <= t) {
      if (k + 1 >= e || times[k + 1]! > t) return k;
      if (k + 2 >= e || times[k + 2]! > t) {
        tr.cursor[i] = k + 1;
        return k + 1;
      }
    } else if (k - 1 < s || times[k - 1]! <= t) {
      tr.cursor[i] = k - 1;
      return k - 1;
    }
  }
  let lo = s;
  let hi = e;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  tr.cursor[i] = lo - 1;
  return lo - 1;
}

/** The numeric track at key k (already found), eased with the spring curve or smootherstep. */
function numK(tr: Track, i: number, k: number, t: number, def: number, sp: boolean): number {
  if (k < tr.start[i]!) return def;
  const v = tr.vals[k]!;
  if (k + 1 >= tr.start[i + 1]! || tr.times[k]! === t) return v;
  const t0 = tr.times[k]!;
  const u = (t - t0) / (tr.times[k + 1]! - t0);
  return v + (tr.vals[k + 1]! - v) * (sp ? spring(u) : smootherstep(u));
}

function num(tr: Track, i: number, t: number, def: number, sp: boolean): number {
  return numK(tr, i, find(tr, i, t), t, def, sp);
}

function color(tr: Track, i: number, t: number, def: number): number {
  const k = find(tr, i, t);
  if (k < tr.start[i]!) return def;
  const cur = tr.ival[k]!;
  if (cur < 0 || k + 1 >= tr.start[i + 1]! || tr.times[k]! === t) return cur;
  const nxt = tr.ival[k + 1]!;
  if (nxt < 0 || nxt === cur) return cur;
  const t0 = tr.times[k]!;
  const u = (t - t0) / (tr.times[k + 1]! - t0);
  return mixOklab(tr.vals, k * 3, k * 3 + 3, smootherstep(u));
}

function step(tr: Track, i: number, t: number): number {
  const k = find(tr, i, t);
  return k < tr.start[i]! ? 0 : tr.ival[k]!;
}

/** A step track of numbers (curve, trail). */
function stepNum(tr: Track, i: number, t: number, def: number): number {
  const k = find(tr, i, t);
  return k < tr.start[i]! ? def : tr.vals[k]!;
}

const LAB = new Float64Array(6);

/** The OKLab mix of a packed color toward Warning by b. */
function toward(c: Compiled, rgb: number, b: number): number {
  rgbToOklab(rgb, LAB, 0);
  LAB[3] = c.warningLab[0]!;
  LAB[4] = c.warningLab[1]!;
  LAB[5] = c.warningLab[2]!;
  return mixOklab(LAB, 0, 3, b);
}

let MX = 0;
let MY = 0;

/** The position (MX, MY) of shape i at t, following a curve when the x and y keys coincide. */
function position(c: Compiled, i: number, t: number): void {
  const tx = c.tracks[P_X]!;
  const ty = c.tracks[P_Y]!;
  const sp = c.spring;
  const kx = find(tx, i, t);
  const ky = find(ty, i, t);
  if (
    kx >= tx.start[i]! &&
    ky >= ty.start[i]! &&
    kx + 1 < tx.start[i + 1]! &&
    ky + 1 < ty.start[i + 1]!
  ) {
    const a = tx.times[kx]!;
    const b = tx.times[kx + 1]!;
    const tcurve = c.tracks[P_CURVE]!;
    if (tcurve.times.length > 0 && a !== t && a === ty.times[ky]! && b === ty.times[ky + 1]!) {
      const bend = stepNum(tcurve, i, a, 0);
      const x0 = tx.vals[kx]!;
      const y0 = ty.vals[ky]!;
      const dx = tx.vals[kx + 1]! - x0;
      const dy = ty.vals[ky + 1]! - y0;
      if (bend !== 0 && (dx !== 0 || dy !== 0)) {
        const u = (t - a) / (b - a);
        const f = sp ? spring(u) : smootherstep(u);
        // control point: the midpoint plus c |AB| along the left normal (dy, -dx) / |AB|
        const cx = x0 + dx / 2 + bend * dy;
        const cy = y0 + dy / 2 - bend * dx;
        const g = 1 - f;
        MX = g * g * x0 + 2 * g * f * cx + f * f * (x0 + dx);
        MY = g * g * y0 + 2 * g * f * cy + f * f * (y0 + dy);
        return;
      }
    }
  }
  MX = numK(tx, i, kx, t, NUM_DEFAULTS[P_X]!, sp);
  MY = numK(ty, i, ky, t, NUM_DEFAULTS[P_Y]!, sp);
}

function clamp01(v: number): number {
  return v > 0 ? (v < 1 ? v : 1) : 0;
}

/** Digit columns of a counter showing `count`. */
export function counterColumns(count: number): number {
  const r = Math.round(Math.abs(count));
  let n = 1;
  let p = 10;
  while (r >= p) {
    n++;
    p *= 10;
  }
  return n;
}

/** Writes the world box of a drawn non-group, non-line shape to BOX: x0, y0, x1, y1. */
export const BOX = new Float64Array(4);
export function boxOf(c: Compiled, fs: FrameState, i: number): void {
  let w: number;
  let h: number;
  switch (c.kind[i]) {
    case KIND_CIRCLE:
      w = h = 2 * c.geomA[i]!;
      break;
    case KIND_RECT:
      w = c.geomA[i]!;
      h = c.geomB[i]!;
      break;
    case KIND_ICON:
      w = h = c.geomA[i]!;
      break;
    case KIND_COUNTER:
      w = 8 * counterColumns(fs.count[i]!);
      h = 18;
      break;
    default:
      w = 8 * c.strLen[fs.text[i]!]!;
      h = 18;
  }
  const s = Math.sqrt(Math.abs(fs.a[i]! * fs.d[i]! - fs.b[i]! * fs.c[i]!));
  const hw = (w * s) / 2;
  const hh = (h * s) / 2;
  BOX[0] = fs.e[i]! - hw;
  BOX[1] = fs.f[i]! - hh;
  BOX[2] = fs.e[i]! + hw;
  BOX[3] = fs.f[i]! + hh;
}

/**
 * Evaluates one shape that is not a line at time t into fs. A ghost (a trail) leaves out
 * effects and halo. Returns nothing; fs.visible[i] says whether the shape is drawn.
 */
function evalShape(c: Compiled, fs: FrameState, i: number, t: number, ghost: boolean): void {
  const tracks = c.tracks;
  const { visible, a, b, c: wc, d, e, f, opacity } = fs;
  visible[i] = 0;
  if (t >= c.end[i]!) return;
  const kd = c.kind[i]!;
  const isGroup = kd === KIND_GROUP;
  let tt = t;
  if (isGroup) {
    if (t < c.reachAt[i]!) return;
    // before its first key a group holds its first-key values (members may be older)
    if (t < c.firstAt[i]!) tt = c.firstAt[i]!;
  } else if (t < c.firstAt[i]!) {
    return;
  }
  const sp = c.spring;
  position(c, i, tt);
  const x = MX;
  const y = MY;
  let sc = num(tracks[P_SCALE]!, i, tt, 1, sp);
  let op = num(tracks[P_OPACITY]!, i, tt, 1, false);
  op = op > 0 ? (op < 1 ? op : 1) : 0;
  const rot = num(tracks[P_ROTATION]!, i, tt, 0, sp);

  // effects: glow lights the shape, indicate swells it
  let code = 0;
  let ind = 0;
  const teff = tracks[P_EFFECT]!;
  fs.eff[i] = 0;
  if (!ghost && teff.times.length > 0) {
    const k = find(teff, i, tt);
    if (k >= teff.start[i]!) {
      code = teff.ival[k]!;
      if (code > EFFECT_GLOW) {
        const on = teff.times[k]!;
        const off = k + 1 < teff.start[i + 1]! ? teff.times[k + 1]! : c.duration;
        const p = off > on ? clamp01((tt - on) / (off - on)) : 0;
        fs.eff[i] = code;
        fs.effP[i] = p;
        if (code === EFFECT_INDICATE) {
          ind = 4 * p * (1 - p);
          sc *= 1 + 0.2 * ind;
        }
      }
    }
  }
  if (!(sc > 0)) sc = 0;
  let ca = sc;
  let sa = 0;
  if (rot !== 0) {
    const r = rot * DEG;
    ca = Math.cos(r) * sc;
    sa = Math.sin(r) * sc;
  }
  // own draw and halo; a group's apply to its members
  let draw = 1;
  const tdraw = tracks[P_DRAW]!;
  if (tdraw.times.length > 0) draw = clamp01(num(tdraw, i, tt, 1, false));
  let halo = 0;
  const thalo = tracks[P_HALO]!;
  if (!ghost && thalo.times.length > 0) halo = clamp01(num(thalo, i, tt, 0, false));

  // local matrix: T(x, y) R S  =  [ca, sa, -sa, ca, x, y]
  const p = c.parent[i]!;
  const own = code === EFFECT_GLOW ? 1 : 0;
  if (p < 0) {
    a[i] = ca;
    b[i] = sa;
    wc[i] = -sa;
    d[i] = ca;
    e[i] = x;
    f[i] = y;
    opacity[i] = op;
    fs.glow[i] = own;
    fs.ind[i] = ind;
  } else {
    const pa = a[p]!;
    const pb = b[p]!;
    const pc = wc[p]!;
    const pd = d[p]!;
    a[i] = pa * ca + pc * sa;
    b[i] = pb * ca + pd * sa;
    wc[i] = pa * -sa + pc * ca;
    d[i] = pb * -sa + pd * ca;
    e[i] = pa * x + pc * y + e[p]!;
    f[i] = pb * x + pd * y + f[p]!;
    opacity[i] = op * opacity[p]!;
    fs.glow[i] = own | fs.glow[p]!;
    fs.ind[i] = ind > fs.ind[p]! ? ind : fs.ind[p]!;
    if (!ghost && fs.halo[p]! > halo) halo = fs.halo[p]!;
    if (fs.draw[p]! < draw) draw = fs.draw[p]!;
  }
  fs.draw[i] = draw;
  fs.halo[i] = halo;
  if (!ghost) {
    fs.trail[i] = tracks[P_TRAIL]!.times.length > 0 ? stepNum(tracks[P_TRAIL]!, i, tt, 0) : 0;
  }
  if (isGroup) {
    visible[i] = t >= c.firstAt[i]! && opacity[i]! >= MIN_OPACITY ? 1 : 0;
    if (visible[i] && c.groupEffects) {
      fs.bx0[i] = Number.POSITIVE_INFINITY;
      fs.by0[i] = Number.POSITIVE_INFINITY;
      fs.bx1[i] = Number.NEGATIVE_INFINITY;
      fs.by1[i] = Number.NEGATIVE_INFINITY;
      fs.bFill[i] = -1;
      fs.bStroke[i] = -1;
    }
    return;
  }
  visible[i] = opacity[i]! >= MIN_OPACITY ? 1 : 0;
  if (!visible[i]) return;
  let fill = color(tracks[P_FILL]!, i, t, c.defFill[i]!);
  if (fs.ind[i]! > 0 && fill >= 0) fill = toward(c, fill, fs.ind[i]!);
  fs.fill[i] = fill;
  if (kd === KIND_LABEL || kd === KIND_COUNTER) {
    fs.stroke[i] = -1;
    if (kd === KIND_LABEL) fs.text[i] = step(tracks[P_TEXT]!, i, t);
    else fs.count[i] = num(tracks[P_COUNT]!, i, t, 0, false);
    fs.role[i] = step(tracks[P_ROLE]!, i, t);
    fs.face[i] = step(tracks[P_FACE]!, i, t);
  } else {
    fs.stroke[i] = color(tracks[P_STROKE]!, i, t, c.defStroke[i]!);
    const tdash = tracks[P_DASH]!;
    if (tdash.times.length > 0) {
      const k = find(tdash, i, t);
      fs.dashOn[i] = k < tdash.start[i]! ? 0 : tdash.vals[2 * k]!;
      fs.dashOff[i] = k < tdash.start[i]! ? 0 : tdash.vals[2 * k + 1]!;
    }
    if (kd === KIND_ICON) icon(c, fs, i, t);
  }
  if (!ghost) {
    if (c.groupEffects) {
      for (let g = p; g >= 0; g = c.parent[g]!) {
        boxOf(c, fs, i);
        if (BOX[0]! < fs.bx0[g]!) fs.bx0[g] = BOX[0]!;
        if (BOX[1]! < fs.by0[g]!) fs.by0[g] = BOX[1]!;
        if (BOX[2]! > fs.bx1[g]!) fs.bx1[g] = BOX[2]!;
        if (BOX[3]! > fs.by1[g]!) fs.by1[g] = BOX[3]!;
        if (fill >= 0 && (fs.bFill[g]! < 0 || i < fs.bFill[g]!)) fs.bFill[g] = i;
        const sk = fs.stroke[i]!;
        if (sk >= 0 && (fs.bStroke[g]! < 0 || i < fs.bStroke[g]!)) fs.bStroke[g] = i;
      }
    }
  }
}

/** The icon morph of shape i at t: icons iconA to iconB at fraction iconT (smootherstep). */
function icon(c: Compiled, fs: FrameState, i: number, t: number): void {
  const tr = c.tracks[P_ICON]!;
  const k = find(tr, i, t);
  if (k < tr.start[i]!) {
    fs.iconA[i] = -1;
    fs.iconB[i] = -1;
    fs.iconT[i] = 0;
    return;
  }
  const a = tr.ival[k]!;
  fs.iconA[i] = a;
  fs.iconB[i] = a;
  fs.iconT[i] = 0;
  if (k + 1 >= tr.start[i + 1]! || tr.times[k]! === t) return;
  const bIcon = tr.ival[k + 1]!;
  // an unknown name draws nothing and does not morph: the held icon steps at the next key
  if (a < 0 || bIcon < 0 || a === bIcon) return;
  const t0 = tr.times[k]!;
  fs.iconB[i] = bIcon;
  fs.iconT[i] = smootherstep((t - t0) / (tr.times[k + 1]! - t0));
}

function evalLine(c: Compiled, fs: FrameState, i: number, t: number): void {
  const tracks = c.tracks;
  const { visible, e, f, opacity } = fs;
  visible[i] = 0;
  if (t >= c.end[i]! || t < c.firstAt[i]!) return;
  const from = c.lineFrom[i]!;
  const to = c.lineTo[i]!;
  if (from < 0 || to < 0 || !visible[from] || !visible[to]) return;
  let op = num(tracks[P_OPACITY]!, i, t, 1, false);
  op = op > 0 ? (op < 1 ? op : 1) : 0;
  const p = c.parent[i]!;
  if (p >= 0) op *= opacity[p]!;
  opacity[i] = op;
  if (op < MIN_OPACITY) return;
  visible[i] = 1;
  e[i] = e[from]!;
  f[i] = f[from]!;
  fs.x2[i] = e[to]!;
  fs.y2[i] = f[to]!;
  fs.fill[i] = -1;
  fs.stroke[i] = color(tracks[P_STROKE]!, i, t, c.defStroke[i]!);
  const code = step(tracks[P_EFFECT]!, i, t);
  fs.glow[i] = (code === EFFECT_GLOW ? 1 : 0) | (p >= 0 ? fs.glow[p]! : 0);
  fs.eff[i] = 0;
  if (code > EFFECT_GLOW) {
    const teff = tracks[P_EFFECT]!;
    const k = find(teff, i, t);
    const on = teff.times[k]!;
    const off = k + 1 < teff.start[i + 1]! ? teff.times[k + 1]! : c.duration;
    fs.eff[i] = code;
    fs.effP[i] = off > on ? clamp01((t - on) / (off - on)) : 0;
  }
  const tdraw = tracks[P_DRAW]!;
  let draw = tdraw.times.length > 0 ? clamp01(num(tdraw, i, t, 1, false)) : 1;
  if (p >= 0 && fs.draw[p]! < draw) draw = fs.draw[p]!;
  fs.draw[i] = draw;
  const thalo = tracks[P_HALO]!;
  let halo = thalo.times.length > 0 ? clamp01(num(thalo, i, t, 0, false)) : 0;
  if (p >= 0 && fs.halo[p]! > halo) halo = fs.halo[p]!;
  fs.halo[i] = halo;
  const tdash = tracks[P_DASH]!;
  if (tdash.times.length > 0) {
    const k = find(tdash, i, t);
    fs.dashOn[i] = k < tdash.start[i]! ? 0 : tdash.vals[2 * k]!;
    fs.dashOff[i] = k < tdash.start[i]! ? 0 : tdash.vals[2 * k + 1]!;
  }
}

export function evaluate(c: Compiled, at: number, fs: FrameState): void {
  const t = at > 0 ? (at < c.duration ? at : c.duration) : 0;
  fs.at = t;
  cameraAt(c.camera, c.spring, c.style.drift, t, fs.cam);
  const order = c.order;
  for (let q = 0; q < order.length; q++) evalShape(c, fs, order[q]!, t, false);
  const lines = c.lines;
  for (let q = 0; q < lines.length; q++) evalLine(c, fs, lines[q]!, t);
}

/**
 * Evaluates the shapes of c.ghostSet[i] at time t into fs (a ghost state, not the frame's):
 * ancestors first, then shape i and its descendants. Returns false when the ghost is before
 * the shape's first key and is skipped.
 */
export function evaluateGhost(c: Compiled, i: number, t: number, fs: FrameState): boolean {
  const set = c.ghostSet[i];
  if (!set) return false;
  const first = c.kind[i] === KIND_GROUP ? c.reachAt[i]! : c.firstAt[i]!;
  if (t < first) return false;
  fs.at = t;
  for (let q = 0; q < set.length; q++) evalShape(c, fs, set[q]!, t, true);
  return true;
}
