// The painter's state: what the 2D context currently holds, so that a property is set
// only when it changes. One instance serves every frame (rendering is synchronous and not
// re-entrant), so drawing allocates nothing per frame.

import type { Ctx2D } from "../types.ts";
import { TRANSPARENT } from "./style.ts";

export interface Paint {
  ctx: Ctx2D;
  /** Scene unit to device pixel scale including the camera zoom, and the device offset. */
  K: number;
  TX: number;
  TY: number;
  alpha: number;
  fill: string;
  stroke: string;
  font: string;
  spacing: string;
  width: number;
  blur: number;
  shadowColor: string;
  shadowY: number;
  round: boolean;
  dashed: boolean;
}

export const P: Paint = {
  ctx: null as unknown as Ctx2D,
  K: 1,
  TX: 0,
  TY: 0,
  alpha: 1,
  fill: "",
  stroke: "",
  font: "",
  spacing: "0px",
  width: 2,
  blur: 0,
  shadowColor: TRANSPARENT,
  shadowY: 0,
  round: false,
  dashed: false,
};

export function setAlpha(a: number): void {
  if (a !== P.alpha) {
    P.ctx.globalAlpha = a;
    P.alpha = a;
  }
}

export function setFill(s: string): void {
  if (s !== P.fill) {
    P.ctx.fillStyle = s;
    P.fill = s;
  }
}

export function setStroke(s: string): void {
  if (s !== P.stroke) {
    P.ctx.strokeStyle = s;
    P.stroke = s;
  }
}

export function setWidth(w: number): void {
  if (w !== P.width) {
    P.ctx.lineWidth = w;
    P.width = w;
  }
}

/** Shadow in device pixels: blur, color and vertical offset; each is set only when it changes. */
export function setShadow(blur: number, color: string, offsetY: number): void {
  if (blur !== P.blur) {
    P.ctx.shadowBlur = blur;
    P.blur = blur;
  }
  if (color !== P.shadowColor) {
    P.ctx.shadowColor = color;
    P.shadowColor = color;
  }
  if (offsetY !== P.shadowY) {
    P.ctx.shadowOffsetY = offsetY;
    P.shadowY = offsetY;
  }
}

export function shadowOff(): void {
  setShadow(0, TRANSPARENT, 0);
}

const DASH: number[] = [0, 0];

/** Sets the dash pattern of strokes: on <= 0 is solid. */
export function setDash(on: number, off: number): void {
  if (on > 0) {
    DASH[0] = on;
    DASH[1] = off;
    P.ctx.setLineDash(DASH);
    P.dashed = true;
  } else if (P.dashed) {
    P.ctx.setLineDash([]);
    P.dashed = false;
  }
}

export function setJoin(round: boolean): void {
  if (round !== P.round) {
    P.ctx.lineJoin = round ? "round" : "miter";
    P.round = round;
  }
}

/** The world transform: scene units to device pixels through letterbox and camera. */
export function worldTransform(): void {
  P.ctx.setTransform(P.K, 0, 0, P.K, P.TX, P.TY);
}
