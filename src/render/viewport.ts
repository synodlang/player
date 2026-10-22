// Fit the scene canvas into the host canvas: uniform scale, centred, letterboxed.

export interface Viewport {
  /** Scene unit to CSS pixel scale. */
  scale: number;
  /** CSS pixel offset of the scene origin. */
  ox: number;
  oy: number;
  /** Device pixel ratio actually used (positive, finite). */
  dpr: number;
  /** Scene unit to device pixel scale (dpr * scale). */
  k: number;
  /** Device pixel offset of the scene origin (dpr * ox, dpr * oy). */
  tx: number;
  ty: number;
  /** Backing store size in device pixels: round(css * dpr). */
  deviceWidth: number;
  deviceHeight: number;
}

export function backingSize(css: number, pixelRatio: number): number {
  return Math.round(css * pixelRatio);
}

export function computeViewport(
  sceneW: number,
  sceneH: number,
  cssW: number,
  cssH: number,
  pixelRatio = 1,
): Viewport {
  const dpr = pixelRatio > 0 && Number.isFinite(pixelRatio) ? pixelRatio : 1;
  let scale = Math.min(cssW / sceneW, cssH / sceneH);
  if (!(scale > 0) || !Number.isFinite(scale)) scale = 0;
  const ox = (cssW - sceneW * scale) / 2;
  const oy = (cssH - sceneH * scale) / 2;
  return {
    scale,
    ox,
    oy,
    dpr,
    k: dpr * scale,
    tx: dpr * ox,
    ty: dpr * oy,
    deviceWidth: backingSize(cssW, dpr),
    deviceHeight: backingSize(cssH, dpr),
  };
}
