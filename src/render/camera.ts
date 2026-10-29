// The camera (0.3): keys {at, x, y, zoom} interpolated with the easing curve, plus the idle
// drift. World to canvas is translate(w/2, h/2) . scale(zoom) . translate(-cx', -cy'), so a
// world point (x, y) lands at (zoom x + tx, zoom y + ty) on the canvas.

import { smootherstep, spring } from "../math/ease.ts";

export interface CameraTrack {
  at: Float64Array;
  x: Float64Array;
  y: Float64Array;
  zoom: Float64Array;
}

export interface CameraView {
  zoom: number;
  tx: number;
  ty: number;
}

const DRIFT_X_MS = 19000;
const DRIFT_Y_MS = 23000;
const TAU = Math.PI * 2;

/** Writes the world-to-canvas map at time t into out; the camera home is the canvas centre (homeX, homeY). */
export function cameraAt(
  cam: CameraTrack | null,
  isSpring: boolean,
  drift: number,
  t: number,
  out: CameraView,
  homeX: number,
  homeY: number,
): void {
  let cx = homeX;
  let cy = homeY;
  let zoom = 1;
  if (cam && cam.at.length > 0) {
    const n = cam.at.length;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cam.at[mid]! <= t) lo = mid + 1;
      else hi = mid;
    }
    const k = lo - 1;
    if (k >= 0) {
      cx = cam.x[k]!;
      cy = cam.y[k]!;
      zoom = cam.zoom[k]!;
      if (k + 1 < n && cam.at[k]! !== t) {
        const u = (t - cam.at[k]!) / (cam.at[k + 1]! - cam.at[k]!);
        const f = isSpring ? spring(u) : smootherstep(u);
        cx += (cam.x[k + 1]! - cx) * f;
        cy += (cam.y[k + 1]! - cy) * f;
        zoom += (cam.zoom[k + 1]! - zoom) * f;
      }
    }
  }
  if (drift !== 0) {
    cx += drift * Math.sin((TAU * t) / DRIFT_X_MS);
    cy += 0.6 * drift * Math.sin((TAU * t) / DRIFT_Y_MS);
  }
  out.zoom = zoom;
  out.tx = homeX - zoom * cx;
  out.ty = homeY - zoom * cy;
}

/** The world point under a canvas point (xc, yc); the inverse of cameraAt. */
export function canvasToWorldX(v: CameraView, xc: number): number {
  return (xc - v.tx) / v.zoom;
}
export function canvasToWorldY(v: CameraView, yc: number): number {
  return (yc - v.ty) / v.zoom;
}
