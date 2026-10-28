// FrameState: the output of evaluate(), preallocated once per compiled scene and
// reused for every frame. All arrays are indexed by shape index (file order).

import type { CameraView } from "../render/camera.ts";
import type { Compiled } from "../scene/compile.ts";

export interface FrameState {
  /** The time of the last evaluate(), clamped to [0, duration]. */
  at: number;
  /** World to canvas (camera and drift): x' = zoom x + tx, y' = zoom y + ty. */
  cam: CameraView;
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
  /** How much is drawn, 0..1: the smaller of the shape's and its groups'. */
  draw: Float64Array;
  /** Sustained glow, 0..1: the larger of the shape's and its groups'. */
  halo: Float64Array;
  /** Trail length in ms held at the shape's time. */
  trail: Float64Array;
  /** Dash lengths on, off in scene units; 0, 0 is solid. */
  dashOn: Float64Array;
  dashOff: Float64Array;
  /** Role and face codes of labels and counters. */
  role: Uint8Array;
  face: Uint8Array;
  /** Counters: the number shown (before rounding). */
  count: Float64Array;
  /** Icons: the two icons of the morph (-1 for none) and the morph fraction. */
  iconA: Int32Array;
  iconB: Int32Array;
  iconT: Float64Array;
  /** The shape's own effect code and its progress p, and the indicate weight b (own or a group's). */
  eff: Uint8Array;
  effP: Float64Array;
  ind: Float64Array;
  /** For a group with a drawn effect: the union box of its drawn members, in world coordinates. */
  bx0: Float64Array;
  by0: Float64Array;
  bx1: Float64Array;
  by1: Float64Array;
  /** For such a group: its first member with a fill, and with a stroke (shape index), or -1. */
  bFill: Int32Array;
  bStroke: Int32Array;
}

export function createFrameState(c: Compiled): FrameState {
  const n = c.n;
  return {
    at: 0,
    cam: { zoom: 1, tx: 0, ty: 0 },
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
    draw: new Float64Array(n).fill(1),
    halo: new Float64Array(n),
    trail: new Float64Array(n),
    dashOn: new Float64Array(n),
    dashOff: new Float64Array(n),
    role: new Uint8Array(n),
    face: new Uint8Array(n),
    count: new Float64Array(n),
    iconA: new Int32Array(n).fill(-1),
    iconB: new Int32Array(n).fill(-1),
    iconT: new Float64Array(n),
    eff: new Uint8Array(n),
    effP: new Float64Array(n),
    ind: new Float64Array(n),
    bx0: new Float64Array(n),
    by0: new Float64Array(n),
    bx1: new Float64Array(n),
    by1: new Float64Array(n),
    bFill: new Int32Array(n).fill(-1),
    bStroke: new Int32Array(n).fill(-1),
  };
}
