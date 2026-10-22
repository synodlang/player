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
// Semantics are plan section 3 (and compiler/internal/scene/timeline.go valueAt):
// each property interpolates between the keys that set it; numbers with
// smootherstep, colors in OKLab, text and effect step; before its first key a
// property has its default; a member evaluated before its group's first key
// sees the group's first-key values.

import { smootherstep } from "../math/ease.ts";
import { mixOklab } from "../math/oklab.ts";
import type { Compiled, Track } from "../scene/compile.ts";
import {
  KIND_GROUP,
  KIND_LABEL,
  NUM_DEFAULTS,
  P_EFFECT,
  P_FILL,
  P_OPACITY,
  P_ROTATION,
  P_SCALE,
  P_STROKE,
  P_TEXT,
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

function num(tr: Track, i: number, t: number, def: number): number {
  const k = find(tr, i, t);
  if (k < tr.start[i]!) return def;
  const v = tr.vals[k]!;
  if (k + 1 >= tr.start[i + 1]! || tr.times[k]! === t) return v;
  const t0 = tr.times[k]!;
  const u = (t - t0) / (tr.times[k + 1]! - t0);
  return v + (tr.vals[k + 1]! - v) * smootherstep(u);
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

export function evaluate(c: Compiled, at: number, fs: FrameState): void {
  const t = at > 0 ? (at < c.duration ? at : c.duration) : 0;
  fs.at = t;
  const tracks = c.tracks;
  const tx = tracks[P_X]!;
  const ty = tracks[P_Y]!;
  const tsc = tracks[P_SCALE]!;
  const top = tracks[P_OPACITY]!;
  const trot = tracks[P_ROTATION]!;
  const tfill = tracks[P_FILL]!;
  const tstroke = tracks[P_STROKE]!;
  const ttext = tracks[P_TEXT]!;
  const teff = tracks[P_EFFECT]!;
  const { visible, a, b, c: wc, d, e, f, opacity, glow } = fs;
  const kind = c.kind;
  const order = c.order;

  for (let q = 0; q < order.length; q++) {
    const i = order[q]!;
    visible[i] = 0;
    if (t >= c.end[i]!) continue;
    const isGroup = kind[i] === KIND_GROUP;
    let tt = t;
    if (isGroup) {
      if (t < c.reachAt[i]!) continue;
      // before its first key a group holds its first-key values (members may be older)
      if (t < c.firstAt[i]!) tt = c.firstAt[i]!;
    } else if (t < c.firstAt[i]!) {
      continue;
    }
    const x = num(tx, i, tt, NUM_DEFAULTS[P_X]!);
    const y = num(ty, i, tt, NUM_DEFAULTS[P_Y]!);
    let sc = num(tsc, i, tt, 1);
    if (!(sc > 0)) sc = 0;
    let op = num(top, i, tt, 1);
    op = op > 0 ? (op < 1 ? op : 1) : 0;
    const rot = num(trot, i, tt, 0);
    let ca = sc;
    let sa = 0;
    if (rot !== 0) {
      const r = rot * DEG;
      ca = Math.cos(r) * sc;
      sa = Math.sin(r) * sc;
    }
    // local matrix: T(x, y) R S  =  [ca, sa, -sa, ca, x, y]
    const p = c.parent[i]!;
    if (p < 0) {
      a[i] = ca;
      b[i] = sa;
      wc[i] = -sa;
      d[i] = ca;
      e[i] = x;
      f[i] = y;
      opacity[i] = op;
      glow[i] = step(teff, i, tt);
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
      glow[i] = step(teff, i, tt) | glow[p]!;
    }
    if (isGroup) {
      visible[i] = t >= c.firstAt[i]! && opacity[i]! >= MIN_OPACITY ? 1 : 0;
      continue;
    }
    visible[i] = opacity[i]! >= MIN_OPACITY ? 1 : 0;
    if (!visible[i]) continue;
    fs.fill[i] = color(tfill, i, t, c.defFill[i]!);
    if (kind[i] === KIND_LABEL) {
      fs.stroke[i] = -1;
      fs.text[i] = step(ttext, i, t);
    } else {
      fs.stroke[i] = color(tstroke, i, t, c.defStroke[i]!);
    }
  }

  const lines = c.lines;
  for (let q = 0; q < lines.length; q++) {
    const i = lines[q]!;
    visible[i] = 0;
    if (t >= c.end[i]! || t < c.firstAt[i]!) continue;
    const from = c.lineFrom[i]!;
    const to = c.lineTo[i]!;
    if (from < 0 || to < 0 || !visible[from] || !visible[to]) continue;
    let op = num(top, i, t, 1);
    op = op > 0 ? (op < 1 ? op : 1) : 0;
    const p = c.parent[i]!;
    if (p >= 0) op *= opacity[p]!;
    opacity[i] = op;
    if (op < MIN_OPACITY) continue;
    visible[i] = 1;
    e[i] = e[from]!;
    f[i] = f[from]!;
    fs.x2[i] = e[to]!;
    fs.y2[i] = f[to]!;
    fs.fill[i] = -1;
    fs.stroke[i] = color(tstroke, i, t, c.defStroke[i]!);
    glow[i] = step(teff, i, t) | (p >= 0 ? glow[p]! : 0);
  }
}
