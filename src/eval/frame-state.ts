// FrameState: the output of evaluate(), preallocated once per compiled scene and
// reused for every frame. All arrays are indexed by shape index (file order).

import type { Compiled } from "../scene/compile.ts";

export interface FrameState {
  /** The time of the last evaluate(), clamped to [0, duration]. */
  at: number;
  /**
   * 1 when the shape is to be drawn: alive (firstAt <= at < end), composed opacity at least
   * 1/512 and, for a line, both ends visible. Groups carry the flag too (lines use it) but
   * draw nothing.
   */
  visible: Uint8Array;
  /**
   * World transform in canvas order: x' = a x + c y + e, y' = b x + d y + f. The shape's
   * (x, y) centre maps to (e, f). Valid where visible is 1. For a line, (e, f) is the world
   * centre of its `from` end, (x2, y2) that of its `to` end; a-d are unused.
   */
  a: Float64Array;
  b: Float64Array;
  c: Float64Array;
  d: Float64Array;
  e: Float64Array;
  f: Float64Array;
  x2: Float64Array;
  y2: Float64Array;
  /** Composed opacity (own clamped to 0..1, times all its groups'). */
  opacity: Float64Array;
  /** Packed 0xRRGGBB, or -1 for none. Groups and labels' strokes are not evaluated. */
  fill: Int32Array;
  stroke: Int32Array;
  /** Labels: index into Compiled.strings. */
  text: Int32Array;
  /** 1 while the shape's or a containing group's effect is glow. */
  glow: Uint8Array;
}

export function createFrameState(c: Compiled): FrameState {
  const n = c.n;
  return {
    at: 0,
    visible: new Uint8Array(n),
    a: new Float64Array(n),
    b: new Float64Array(n),
    c: new Float64Array(n),
    d: new Float64Array(n),
    e: new Float64Array(n),
    f: new Float64Array(n),
    x2: new Float64Array(n),
    y2: new Float64Array(n),
    opacity: new Float64Array(n),
    fill: new Int32Array(n).fill(-1),
    stroke: new Int32Array(n).fill(-1),
    text: new Int32Array(n),
    glow: new Uint8Array(n),
  };
}
