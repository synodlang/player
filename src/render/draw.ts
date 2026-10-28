// renderToContext: evaluate the scene at `at` and draw it through a Ctx2D.
// One drawing path serves canvases, the display-list goldens and the bench.

import { counterColumns, evaluate, evaluateGhost, MIN_OPACITY } from "../eval/evaluate.ts";
import { createFrameState, type FrameState } from "../eval/frame-state.ts";
import type { Compiled } from "../scene/compile.ts";
import {
  EFFECT_FLASH,
  KIND_CIRCLE,
  KIND_COUNTER,
  KIND_GROUP,
  KIND_ICON,
  KIND_LABEL,
  KIND_LINE,
  KIND_RECT,
  TRAIL_GHOSTS,
} from "../scene/compile.ts";
import type { CompiledScene, Ctx2D, View } from "../types.ts";
import { hexOf } from "./color-cache.ts";
import { drawEffect } from "./effects.ts";
import { contourCount, morphContour } from "./icons.ts";
import { circlePath, polyPath, rrPath, rrPerimeter } from "./outline.ts";
import {
  P,
  setAlpha,
  setDash,
  setFill,
  setJoin,
  setShadow,
  setStroke,
  setWidth,
  shadowOff,
  worldTransform,
} from "./paint.ts";
import {
  type Sketched,
  seedOf,
  sketchCircle,
  sketchPolyline,
  sketchRect,
  sketchSegment,
} from "./sketch.ts";
import { fontTable, roleSizes, TRANSPARENT, TWO_PI } from "./style.ts";
import { computeViewport } from "./viewport.ts";

export interface RenderOptions {
  /** Font family list for face sans (default: the scene's style.sans with system fallbacks). */
  sans?: string;
  /** Font family list for face mono (default: the scene's style.mono with system fallbacks). */
  mono?: string;
}

/** Everything cached for one compiled scene between frames. */
interface RenderCache {
  state: FrameState;
  ghost: FrameState | null;
  seeds: Uint32Array;
  /** Wobbled outlines of circles, rects (static) and lines (keyed by length). */
  sk: (Sketched | null)[];
  skKey: Float64Array;
  /** Wobbled contours of icons, keyed by (icon a, icon b, morph fraction). */
  icons: (Sketched[] | null)[];
  iconKey: Float64Array;
  fonts: Map<string, string[]>;
  /** Letter spacing strings by role (empty strings when the tracking is 0). */
  spacing: string[];
  sizes: number[];
}

const caches = new WeakMap<object, RenderCache>();

function cacheFor(c: Compiled): RenderCache {
  let rc = caches.get(c);
  if (!rc) {
    rc = {
      state: createFrameState(c),
      ghost: null,
      seeds: Uint32Array.from(c.ids, seedOf),
      sk: new Array(c.n).fill(null),
      skKey: new Float64Array(c.n).fill(Number.NaN),
      icons: new Array(c.n).fill(null),
      iconKey: new Float64Array(3 * c.n).fill(Number.NaN),
      fonts: new Map(),
      sizes: roleSizes(c.style),
      spacing: roleSizes(c.style).map((size) => `${c.style.tracking * size}px`),
    };
    caches.set(c, rc);
  }
  return rc;
}

export function frameStateFor(c: Compiled): FrameState {
  return cacheFor(c).state;
}

// Per-frame constants, set by renderToContext (rendering is synchronous and not re-entrant).
let C: Compiled;
let RC: RenderCache;
let FS: FrameState;
let fonts: string[];
let sketch = 0;
let strokeWidth = 2;
let glowBlur = 24;
let tracking = 0;
let dropShadow = TRANSPARENT;
let dropAlpha = 0;
let ink = "";

const PTS = new Float64Array(64);
const ICON_M = new Float64Array(6);
const LINE_M = new Float64Array(6);
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function renderToContext(
  ctx: Ctx2D,
  compiled: CompiledScene,
  at: number,
  view: View,
  options?: RenderOptions,
): void {
  const c = compiled as Compiled;
  RC = cacheFor(c);
  FS = RC.state;
  C = c;
  evaluate(c, at, FS);

  const style = c.style;
  const vp = computeViewport(c.width, c.height, view.width, view.height, view.pixelRatio);
  const { k, tx, ty } = vp;
  const cam = FS.cam;
  const paper = hexOf(c.paper);
  ink = hexOf(c.ink);
  const key = `${options?.sans ?? ""}|${options?.mono ?? ""}`;
  let table = RC.fonts.get(key);
  if (!table) {
    table = fontTable(style, options?.sans, options?.mono);
    RC.fonts.set(key, table);
  }
  fonts = table;
  tracking = style.tracking;
  sketch = style.sketch;
  strokeWidth = style.stroke;
  glowBlur = style.glow;
  dropAlpha = style.shadow;
  dropShadow = dropAlpha > 0 ? `rgba(0, 0, 0, ${dropAlpha})` : TRANSPARENT;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = TRANSPARENT;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, vp.deviceWidth, vp.deviceHeight);
  ctx.setTransform(k, 0, 0, k, tx, ty);
  ctx.beginPath();
  ctx.rect(0, 0, c.width, c.height);
  ctx.clip();

  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.font = fonts[0] as string;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  P.ctx = ctx;
  P.K = k * cam.zoom;
  P.TX = k * cam.tx + tx;
  P.TY = k * cam.ty + ty;
  P.alpha = 1;
  P.fill = "";
  P.stroke = "";
  P.font = fonts[0] as string;
  P.spacing = "0px";
  P.width = strokeWidth;
  P.blur = 0;
  P.shadowColor = TRANSPARENT;
  P.shadowY = 0;
  P.round = false;
  P.dashed = false;

  const kind = c.kind;
  const groups = c.groupEffects;
  for (let i = 0; i < c.n; i++) {
    const kd = kind[i]!;
    if (kd !== KIND_GROUP && FS.visible[i]) {
      if (FS.trail[i]! > 0) drawGhosts(i);
      drawBody(i, FS, 1, false);
      if (FS.eff[i]! >= EFFECT_FLASH) drawEffect(c, FS, i, RC.seeds[i]!, sketch);
    } else if (kd === KIND_GROUP && FS.visible[i] && FS.trail[i]! > 0) {
      // a group draws nothing itself; its ghosts come before its members
      drawGhosts(i);
    }
    if (groups) {
      for (let g = c.groupsEndingAt[i]!; g >= 0; g = c.nextGroupEnding[g]!) {
        if (FS.visible[g] && FS.eff[g]! >= EFFECT_FLASH) drawEffect(c, FS, g, RC.seeds[g]!, sketch);
      }
    }
  }

  if (P.blur !== 0 || P.shadowY !== 0) shadowOff();
  if (P.dashed) setDash(0, 0);
  if (P.spacing !== "0px") ctx.letterSpacing = "0px";

  if (style.vignette > 0) {
    // after everything else, in canvas space (not moved by the camera), clipped to the canvas
    setAlpha(1);
    ctx.setTransform(k, 0, 0, k, tx, ty);
    const diag = Math.hypot(c.width, c.height);
    const g = ctx.createRadialGradient(
      c.width / 2,
      c.height / 2,
      0,
      c.width / 2,
      c.height / 2,
      0.75 * diag,
    );
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(0.35 / 0.75, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, `rgba(0, 0, 0, ${style.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.restore();
}

/** The first n code points of s. */
function prefix(s: string, n: number): string {
  let i = 0;
  for (let k = 0; k < n && i < s.length; k++) i += s.codePointAt(i)! > 0xffff ? 2 : 1;
  return s.slice(0, i);
}

function drawGhosts(i: number): void {
  const c = C;
  const set = c.ghostSet[i];
  if (!set) return;
  const T = FS.trail[i]!;
  let gs = RC.ghost;
  if (!gs) {
    gs = createFrameState(c);
    RC.ghost = gs;
  }
  let from = 0;
  while (set[from] !== i) from++;
  for (let j = TRAIL_GHOSTS; j >= 1; j--) {
    if (!evaluateGhost(c, i, FS.at - (j * T) / TRAIL_GHOSTS, gs)) continue;
    const mul = 0.5 * (1 - j / (TRAIL_GHOSTS + 1));
    for (let q = from; q < set.length; q++) drawBody(set[q]!, gs, mul, true);
  }
}

function legacyPath(ctx: Ctx2D, i: number): void {
  if (C.kind[i] === KIND_CIRCLE) {
    ctx.arc(0, 0, C.geomA[i]!, 0, TWO_PI);
    return;
  }
  const hw = C.geomA[i]! / 2;
  const hh = C.geomB[i]! / 2;
  const r = C.geomR[i]!;
  ctx.moveTo(-hw + r, -hh);
  ctx.arcTo(hw, -hh, hw, hh, r);
  ctx.arcTo(hw, hh, -hw, hh, r);
  ctx.arcTo(-hw, hh, -hw, -hh, r);
  ctx.arcTo(-hw, -hh, hw, -hh, r);
  ctx.closePath();
}

/** The outline from its top center clockwise to fraction f, exact. */
function exactOutline(ctx: Ctx2D, i: number, f: number): void {
  if (C.kind[i] === KIND_CIRCLE) {
    circlePath(ctx, 0, 0, C.geomA[i]!, 0, f);
    return;
  }
  const hw = C.geomA[i]! / 2;
  const hh = C.geomB[i]! / 2;
  const r = C.geomR[i]!;
  rrPath(ctx, hw, hh, r, 0, f * rrPerimeter(hw, hh, r));
  if (f >= 1) ctx.closePath();
}

function sketchOf(i: number): Sketched {
  let sk = RC.sk[i];
  if (!sk) {
    sk =
      C.kind[i] === KIND_CIRCLE
        ? sketchCircle(C.geomA[i]!, RC.seeds[i]!, sketch)
        : sketchRect(C.geomA[i]! / 2, C.geomB[i]! / 2, C.geomR[i]!, RC.seeds[i]!, sketch);
    RC.sk[i] = sk;
  }
  return sk;
}

function drawBody(i: number, st: FrameState, mul: number, ghost: boolean): void {
  const c = C;
  const kd = c.kind[i]!;
  if (kd === KIND_GROUP || !st.visible[i]) return;
  const op = st.opacity[i]! * mul;
  if (op < MIN_OPACITY) return;
  const ctx = P.ctx;
  const fc = st.fill[i]!;
  const sc = st.stroke[i]!;
  const isText = kd === KIND_LABEL || kd === KIND_COUNTER;

  if (kd !== KIND_LINE) {
    const det = st.a[i]! * st.d[i]! - st.b[i]! * st.c[i]!;
    if (det === 0) return;
  }
  if (isText && fc < 0) return;
  if (kd === KIND_LABEL && c.strings[st.text[i]!] === "") return;
  if (!isText && fc < 0 && sc < 0) return;
  const draw = st.draw[i]!;
  if (!(draw > 0)) return;

  setAlpha(op);

  // glow and halo: shadow in device pixels, colored fill, else stroke, else Ink; otherwise the
  // drop shadow of circles, rects and icons
  let blur = 0;
  if (!ghost) {
    if (st.glow[i]) blur = glowBlur;
    const hb = glowBlur * st.halo[i]!;
    if (hb > blur) blur = hb;
  }
  if (blur > 0) {
    setShadow(blur * P.K, fc >= 0 ? hexOf(fc) : sc >= 0 ? hexOf(sc) : ink, 0);
  } else if (
    dropAlpha > 0 &&
    !ghost &&
    ((fc >= 0 && (kd === KIND_CIRCLE || kd === KIND_RECT)) || kd === KIND_ICON)
  ) {
    setShadow(16 * P.K, dropShadow, 6 * P.K);
  } else {
    shadowOff();
  }

  if (kd === KIND_LINE) {
    if (sc < 0) return;
    setStroke(hexOf(sc));
    setWidth(strokeWidth);
    setDash(st.dashOn[i]!, st.dashOff[i]!);
    worldTransform();
    drawLine(ctx, i, st, draw, op);
    return;
  }

  ctx.setTransform(
    P.K * st.a[i]!,
    P.K * st.b[i]!,
    P.K * st.c[i]!,
    P.K * st.d[i]!,
    P.K * st.e[i]! + P.TX,
    P.K * st.f[i]! + P.TY,
  );

  if (isText) {
    setFill(hexOf(fc));
    const face = kd === KIND_LABEL || kd === KIND_COUNTER ? st.face[i]! : 0;
    const role = st.role[i]!;
    const font = fonts[role * 2 + face]!;
    if (font !== P.font) {
      ctx.font = font;
      P.font = font;
    }
    if (tracking !== 0) {
      const sp = RC.spacing[role]!;
      if (sp !== P.spacing) {
        ctx.letterSpacing = sp;
        P.spacing = sp;
      }
    }
    if (kd === KIND_LABEL) {
      let text = c.strings[st.text[i]!]!;
      if (draw < 1) text = prefix(text, Math.ceil(draw * c.strLen[st.text[i]!]!));
      ctx.fillText(text, 0, 0);
    } else {
      drawCounter(ctx, st.count[i]!, draw, RC.sizes[role]!);
    }
    return;
  }

  setWidth(strokeWidth);
  setDash(st.dashOn[i]!, st.dashOff[i]!);

  if (kd === KIND_ICON) {
    setJoin(true);
    drawIcon(ctx, i, st, draw, op, sc);
    return;
  }
  setJoin(false);

  const fm = draw >= 1 ? 1 : Math.max(0, 2 * draw - 1);
  const f = Math.min(1, 2 * draw);
  const dashed = st.dashOn[i]! > 0;
  if (draw >= 1 && !dashed && sketch <= 0) {
    ctx.beginPath();
    legacyPath(ctx, i);
    if (fc >= 0) {
      setFill(hexOf(fc));
      ctx.fill();
    }
    if (sc >= 0) {
      setStroke(hexOf(sc));
      ctx.stroke();
    }
    return;
  }
  const sk = sketch > 0 ? sketchOf(i) : null;
  if (fc >= 0 && fm > 0) {
    setFill(hexOf(fc));
    ctx.beginPath();
    if (sk) polyPath(ctx, sk.p1, sk.n, true, 0, 1);
    else legacyPath(ctx, i);
    if (fm < 1) setAlpha(op * fm);
    ctx.fill();
    setAlpha(op);
  }
  if (sc >= 0) {
    setStroke(hexOf(sc));
    ctx.beginPath();
    if (sk) polyPath(ctx, sk.p1, sk.n, true, 0, f);
    else exactOutline(ctx, i, f);
    ctx.stroke();
    if (sk) {
      ctx.beginPath();
      polyPath(ctx, sk.p2, sk.n, true, 0, f);
      setAlpha(op * 0.6);
      ctx.stroke();
      setAlpha(op);
    }
  }
}

function drawLine(ctx: Ctx2D, i: number, st: FrameState, draw: number, op: number): void {
  const x0 = st.e[i]!;
  const y0 = st.f[i]!;
  const dx = st.x2[i]! - x0;
  const dy = st.y2[i]! - y0;
  const len = Math.hypot(dx, dy);
  if (sketch > 0 && len > 0) {
    let sk = RC.sk[i];
    if (!sk || RC.skKey[i] !== len) {
      sk = sketchSegment(len, 4 * sketch, RC.seeds[i]!, sketch);
      RC.sk[i] = sk;
      RC.skKey[i] = len;
    }
    LINE_M[0] = x0;
    LINE_M[1] = y0;
    LINE_M[2] = dx / len;
    LINE_M[3] = dy / len;
    LINE_M[4] = -dy / len;
    LINE_M[5] = dx / len;
    ctx.beginPath();
    polyPath(ctx, sk.p1, sk.n, false, 0, draw, LINE_M);
    ctx.stroke();
    ctx.beginPath();
    polyPath(ctx, sk.p2, sk.n, false, 0, draw, LINE_M);
    setAlpha(op * 0.6);
    ctx.stroke();
    setAlpha(op);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(draw < 1 ? x0 + dx * draw : st.x2[i]!, draw < 1 ? y0 + dy * draw : st.y2[i]!);
  ctx.stroke();
}

function drawIcon(
  ctx: Ctx2D,
  i: number,
  st: FrameState,
  draw: number,
  op: number,
  sc: number,
): void {
  const a = st.iconA[i]!;
  if (a < 0 || sc < 0) return; // an unknown name draws nothing
  const b = st.iconB[i]!;
  const t = st.iconT[i]!;
  const size = C.geomA[i]!;
  const cn = contourCount(a, b);
  setStroke(hexOf(sc));
  ICON_M[0] = -0.5 * size;
  ICON_M[1] = -0.5 * size;
  ICON_M[2] = size;
  ICON_M[3] = 0;
  ICON_M[4] = 0;
  ICON_M[5] = size;
  if (sketch <= 0) {
    ctx.beginPath();
    for (let ci = 0; ci < cn; ci++) {
      morphContour(a, b, ci, t, PTS);
      polyPath(ctx, PTS, 32, false, 0, draw, ICON_M);
    }
    ctx.stroke();
    return;
  }
  const key = 3 * i;
  let list = RC.icons[i];
  if (!list || RC.iconKey[key] !== a || RC.iconKey[key + 1] !== b || RC.iconKey[key + 2] !== t) {
    list = [];
    for (let ci = 0; ci < cn; ci++) {
      const closed = morphContour(a, b, ci, t, PTS);
      list.push(
        sketchPolyline(PTS, 32, closed, size, -0.5 * size, -0.5 * size, RC.seeds[i]!, sketch),
      );
    }
    RC.icons[i] = list;
    RC.iconKey[key] = a;
    RC.iconKey[key + 1] = b;
    RC.iconKey[key + 2] = t;
  }
  ctx.beginPath();
  for (const sk of list) polyPath(ctx, sk.p1, sk.n, sk.closed, 0, draw);
  ctx.stroke();
  ctx.beginPath();
  for (const sk of list) polyPath(ctx, sk.p2, sk.n, sk.closed, 0, draw);
  setAlpha(op * 0.6);
  ctx.stroke();
  setAlpha(op);
}

/** A counter: digit columns that roll with the fractional part of |count| / 10^k. */
function drawCounter(ctx: Ctx2D, count: number, draw: number, size: number): void {
  const n = counterColumns(count);
  const neg = count < 0;
  const w = 0.6 * size;
  const lh = 1.2 * size;
  const total = n + (neg ? 1 : 0);
  const shown = draw < 1 ? Math.ceil(draw * n) : n;
  const abs = Math.abs(count);
  let pow = 1;
  for (let k = 0; k < n; k++) {
    const left = n - 1 - k; // index among the digit columns from the left
    if (left < shown) {
      const j = total - 1 - k;
      const x = (j - (total - 1) / 2) * w;
      const q = abs / pow;
      const fl = Math.floor(q);
      const g = fl % 10;
      // the units column rolls with frac(count); a higher column waits until the one below
      // is on its last digit and rolls with it (an odometer), so a whole number is crisp
      const fq = q - fl;
      const fr = k === 0 ? fq : Math.max(0, 10 * fq - 9);
      if (fr < 1e-9) {
        ctx.fillText(DIGITS[g]!, x, 0);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - w / 2, -lh / 2, w, lh);
        ctx.clip();
        ctx.fillText(DIGITS[g]!, x, -fr * lh);
        ctx.fillText(DIGITS[(g + 1) % 10]!, x, lh - fr * lh);
        ctx.restore();
      }
    }
    pow *= 10;
  }
  if (neg && shown >= n) ctx.fillText("−", (0 - (total - 1) / 2) * w, 0);
}
