// renderToContext: evaluate the scene at `at` and draw it through a Ctx2D.
// One drawing path serves canvases, the display-list goldens and the bench.

import { evaluate, MIN_OPACITY } from "../eval/evaluate.ts";
import { createFrameState, type FrameState } from "../eval/frame-state.ts";
import type { Compiled } from "../scene/compile.ts";
import { KIND_CIRCLE, KIND_GROUP, KIND_LABEL, KIND_LINE, KIND_RECT } from "../scene/compile.ts";
import type { CompiledScene, Ctx2D, View } from "../types.ts";
import { hexOf } from "./color-cache.ts";
import { GLOW_BLUR, labelFont, STROKE_WIDTH, TRANSPARENT, TWO_PI } from "./style.ts";
import { computeViewport } from "./viewport.ts";

export interface RenderOptions {
  /** Font family list for labels (default: the system sans stack). */
  sans?: string;
}

// One FrameState per compiled scene, created on first use.
const states = new WeakMap<object, FrameState>();

export function frameStateFor(c: Compiled): FrameState {
  let fs = states.get(c);
  if (!fs) {
    fs = createFrameState(c);
    states.set(c, fs);
  }
  return fs;
}

export function renderToContext(
  ctx: Ctx2D,
  compiled: CompiledScene,
  at: number,
  view: View,
  options?: RenderOptions,
): void {
  const c = compiled as Compiled;
  const fs = frameStateFor(c);
  evaluate(c, at, fs);

  const vp = computeViewport(c.width, c.height, view.width, view.height, view.pixelRatio);
  const { k, tx, ty } = vp;
  const paper = hexOf(c.paper);
  const ink = hexOf(c.ink);
  const font = labelFont(options?.sans);

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

  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const blur = GLOW_BLUR * k;
  let alpha = 1;
  let glowOn = false;
  let shadowColor = TRANSPARENT;
  let lastFill = "";
  let lastStroke = "";

  const { visible, a, b, c: wc, d, e, f, x2, y2, opacity, fill, stroke, glow, text } = fs;
  const kind = c.kind;

  for (let i = 0; i < c.n; i++) {
    const kd = kind[i]!;
    if (kd === KIND_GROUP || !visible[i]) continue;
    const op = opacity[i]!;
    if (op < MIN_OPACITY) continue;
    const fc = fill[i]!;
    const sc = stroke[i]!;

    if (kd !== KIND_LINE) {
      const det = a[i]! * d[i]! - b[i]! * wc[i]!;
      if (det === 0) continue;
    }
    if (kd === KIND_LABEL && (fc < 0 || c.strings[text[i]!] === "")) continue;
    if (kd !== KIND_LABEL && fc < 0 && sc < 0) continue;

    if (op !== alpha) {
      ctx.globalAlpha = op;
      alpha = op;
    }

    // glow: shadow in device pixels, colored fill, else stroke, else Ink
    if (glow[i]) {
      const col = fc >= 0 ? hexOf(fc) : sc >= 0 ? hexOf(sc) : ink;
      if (!glowOn) {
        ctx.shadowBlur = blur;
        glowOn = true;
      }
      if (col !== shadowColor) {
        ctx.shadowColor = col;
        shadowColor = col;
      }
    } else if (glowOn) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = TRANSPARENT;
      shadowColor = TRANSPARENT;
      glowOn = false;
    }

    if (kd === KIND_LINE) {
      if (sc < 0) continue;
      const s = hexOf(sc);
      if (s !== lastStroke) {
        ctx.strokeStyle = s;
        lastStroke = s;
      }
      ctx.setTransform(k, 0, 0, k, tx, ty);
      ctx.beginPath();
      ctx.moveTo(e[i]!, f[i]!);
      ctx.lineTo(x2[i]!, y2[i]!);
      ctx.stroke();
      continue;
    }

    ctx.setTransform(k * a[i]!, k * b[i]!, k * wc[i]!, k * d[i]!, k * e[i]! + tx, k * f[i]! + ty);

    if (kd === KIND_LABEL) {
      const s = hexOf(fc);
      if (s !== lastFill) {
        ctx.fillStyle = s;
        lastFill = s;
      }
      ctx.fillText(c.strings[text[i]!]!, 0, 0);
      continue;
    }

    ctx.beginPath();
    if (kd === KIND_CIRCLE) {
      ctx.arc(0, 0, c.geomA[i]!, 0, TWO_PI);
    } else if (kd === KIND_RECT) {
      const hw = c.geomA[i]! / 2;
      const hh = c.geomB[i]! / 2;
      const r = c.geomR[i]!;
      ctx.moveTo(-hw + r, -hh);
      ctx.arcTo(hw, -hh, hw, hh, r);
      ctx.arcTo(hw, hh, -hw, hh, r);
      ctx.arcTo(-hw, hh, -hw, -hh, r);
      ctx.arcTo(-hw, -hh, hw, -hh, r);
      ctx.closePath();
    }
    if (fc >= 0) {
      const s = hexOf(fc);
      if (s !== lastFill) {
        ctx.fillStyle = s;
        lastFill = s;
      }
      ctx.fill();
    }
    if (sc >= 0) {
      const s = hexOf(sc);
      if (s !== lastStroke) {
        ctx.strokeStyle = s;
        lastStroke = s;
      }
      ctx.stroke();
    }
  }

  if (glowOn) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = TRANSPARENT;
  }
  ctx.restore();
}
