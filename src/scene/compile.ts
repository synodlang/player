// compileScene: a Scene becomes a struct of typed arrays that evaluate() reads
// without allocating. Shape index i is the position in Scene.shapes (file order,
// which is also the draw order).
//
// Per-property tracks (one Track per property, all shapes in one set of arrays):
//   keys of shape i are  times[start[i] .. start[i + 1])  (sorted by time)
//   numeric tracks:  vals[k]            the value at key k
//   color tracks:    vals[3k .. 3k + 2] OKLab L, a, b of key k
//                    ival[k]            packed 0xRRGGBB of key k, or -1 for none
//   text track:      ival[k]            index into Compiled.strings
//   effect track:    ival[k]            1 for "glow", 0 for anything else
//   cursor[i]        hint: index of the last key found for shape i (a pure cache)
// A key is in a track only when the key sets that property.

import { parseHex, rgbToOklab } from "../math/oklab.ts";
import type { CompiledScene, Scene, SceneKey } from "../types.ts";
import { BRAND_THEME } from "./load.ts";

export const KIND_CIRCLE = 0;
export const KIND_RECT = 1;
export const KIND_LABEL = 2;
export const KIND_LINE = 3;
export const KIND_GROUP = 4;

export const P_X = 0;
export const P_Y = 1;
export const P_SCALE = 2;
export const P_OPACITY = 3;
export const P_ROTATION = 4;
export const P_FILL = 5;
export const P_STROKE = 6;
export const P_TEXT = 7;
export const P_EFFECT = 8;
export const PROP_COUNT = 9;

/** Value of a numeric property before its first key (x, y, scale, opacity, rotation). */
export const NUM_DEFAULTS: readonly number[] = [800, 500, 1, 1, 0];

export interface Track {
  start: Int32Array;
  times: Float64Array;
  vals: Float64Array;
  ival: Int32Array;
  cursor: Int32Array;
}

export interface Compiled extends CompiledScene {
  readonly n: number;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly ids: readonly string[];
  readonly kind: Uint8Array;
  /** Time of the shape's first key. */
  readonly firstAt: Float64Array;
  /** Effective end (own end, or its group's if earlier); Infinity when it never ends. */
  readonly end: Float64Array;
  /** For a group: the earliest firstAt among itself and all its descendants. */
  readonly reachAt: Float64Array;
  /** Index of the containing group, or -1. */
  readonly parent: Int32Array;
  /** circle: r. rect: w. */
  readonly geomA: Float64Array;
  /** rect: h. */
  readonly geomB: Float64Array;
  /** rect: corner radius already limited to min(radius, w/2, h/2), at least 0. */
  readonly geomR: Float64Array;
  /** line: index of the `from` and `to` shapes, else -1. */
  readonly lineFrom: Int32Array;
  readonly lineTo: Int32Array;
  /** Every non-line shape, parents before children. */
  readonly order: Int32Array;
  /** Every line shape, file order. */
  readonly lines: Int32Array;
  /** Indexed by P_*. */
  readonly tracks: readonly Track[];
  /** Fill and stroke before the first key: packed color or -1 (label fill Ink, line stroke Line). */
  readonly defFill: Int32Array;
  readonly defStroke: Int32Array;
  /** Label texts; index 0 is "". */
  readonly strings: readonly string[];
  /** Packed Paper and Ink. */
  readonly paper: number;
  readonly ink: number;
}

function packedColor(theme: Record<string, string>, name: string, ink: number): number {
  if (name === "") return -1;
  const hex = theme[name];
  if (hex === undefined) return name === "none" ? -1 : ink;
  const v = parseHex(hex);
  return v < 0 ? ink : v;
}

function has(k: SceneKey, p: number): boolean {
  switch (p) {
    case P_X:
      return k.x !== undefined;
    case P_Y:
      return k.y !== undefined;
    case P_SCALE:
      return k.scale !== undefined;
    case P_OPACITY:
      return k.opacity !== undefined;
    case P_ROTATION:
      return k.rotation !== undefined;
    case P_FILL:
      return k.fill !== undefined;
    case P_STROKE:
      return k.stroke !== undefined;
    case P_TEXT:
      return k.text !== undefined;
    default:
      return k.effect !== undefined;
  }
}

export function compileScene(scene: Scene): Compiled {
  const shapes = scene.shapes;
  const n = shapes.length;
  const theme = scene.theme;
  const ink = packedColor({ ...BRAND_THEME, ...theme }, "Ink", 0xede9e1);
  const paper = parseHex(theme.Paper ?? "") >= 0 ? parseHex(theme.Paper as string) : 0x151a2e;
  const lineColor = packedColor(theme, "Line", ink);

  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set((shapes[i] as { id: string }).id, i);

  const kind = new Uint8Array(n);
  const firstAt = new Float64Array(n);
  const end = new Float64Array(n);
  const parent = new Int32Array(n).fill(-1);
  const geomA = new Float64Array(n);
  const geomB = new Float64Array(n);
  const geomR = new Float64Array(n);
  const lineFrom = new Int32Array(n).fill(-1);
  const lineTo = new Int32Array(n).fill(-1);
  const defFill = new Int32Array(n).fill(-1);
  const defStroke = new Int32Array(n).fill(-1);
  const ids: string[] = [];

  for (let i = 0; i < n; i++) {
    const s = shapes[i];
    if (!s) continue;
    ids.push(s.id);
    firstAt[i] = (s.keys[0] as SceneKey).at;
    end[i] = s.end ?? Number.POSITIVE_INFINITY;
    switch (s.kind) {
      case "circle":
        kind[i] = KIND_CIRCLE;
        geomA[i] = s.props.r;
        break;
      case "rect":
        kind[i] = KIND_RECT;
        geomA[i] = s.props.w;
        geomB[i] = s.props.h;
        geomR[i] = Math.max(0, Math.min(s.props.radius, s.props.w / 2, s.props.h / 2));
        break;
      case "label":
        kind[i] = KIND_LABEL;
        defFill[i] = ink;
        break;
      case "line":
        kind[i] = KIND_LINE;
        lineFrom[i] = index.get(s.props.from) ?? -1;
        lineTo[i] = index.get(s.props.to) ?? -1;
        defStroke[i] = lineColor;
        break;
      case "group":
        kind[i] = KIND_GROUP;
        for (const id of s.props.items) {
          const m = index.get(id);
          if (m !== undefined) parent[m] = i;
        }
        break;
    }
  }

  // Parents before children (a group may be listed before or after its members).
  const orderList: number[] = [];
  const lineList: number[] = [];
  const seen = new Uint8Array(n);
  const visit = (i: number): void => {
    if (seen[i]) return;
    seen[i] = 1;
    const p = parent[i] as number;
    if (p >= 0) visit(p);
    orderList.push(i);
  };
  for (let i = 0; i < n; i++) {
    if (kind[i] === KIND_LINE) lineList.push(i);
    else visit(i);
  }
  const order = Int32Array.from(orderList);
  const lines = Int32Array.from(lineList);

  // A member ends no later than its group; a group is needed from its earliest descendant.
  const reachAt = Float64Array.from(firstAt);
  for (let i = 0; i < n; i++) {
    for (let p = parent[i] as number; p >= 0; p = parent[p] as number) {
      if ((firstAt[i] as number) < (reachAt[p] as number)) reachAt[p] = firstAt[i] as number;
    }
  }
  for (const i of order) {
    const p = parent[i] as number;
    if (p >= 0 && (end[p] as number) < (end[i] as number)) end[i] = end[p] as number;
  }
  for (const i of lines) {
    const p = parent[i] as number;
    if (p >= 0 && (end[p] as number) < (end[i] as number)) end[i] = end[p] as number;
  }

  const strings: string[] = [""];
  const stringIndex = new Map<string, number>([["", 0]]);
  const intern = (s: string): number => {
    let v = stringIndex.get(s);
    if (v === undefined) {
      v = strings.length;
      strings.push(s);
      stringIndex.set(s, v);
    }
    return v;
  };

  const tracks: Track[] = [];
  const lab = new Float64Array(3);
  for (let p = 0; p < PROP_COUNT; p++) {
    const start = new Int32Array(n + 1);
    let total = 0;
    for (let i = 0; i < n; i++) {
      start[i] = total;
      for (const k of (shapes[i] as { keys: SceneKey[] }).keys) if (has(k, p)) total++;
    }
    start[n] = total;
    const times = new Float64Array(total);
    const color = p === P_FILL || p === P_STROKE;
    const vals = new Float64Array(p <= P_ROTATION ? total : color ? total * 3 : 0);
    const ival = new Int32Array(p <= P_ROTATION ? 0 : total);
    let w = 0;
    for (let i = 0; i < n; i++) {
      for (const k of (shapes[i] as { keys: SceneKey[] }).keys) {
        if (!has(k, p)) continue;
        times[w] = k.at;
        switch (p) {
          case P_X:
            vals[w] = k.x as number;
            break;
          case P_Y:
            vals[w] = k.y as number;
            break;
          case P_SCALE:
            vals[w] = k.scale as number;
            break;
          case P_OPACITY:
            vals[w] = k.opacity as number;
            break;
          case P_ROTATION:
            vals[w] = k.rotation as number;
            break;
          case P_FILL:
          case P_STROKE: {
            const rgb = packedColor(theme, (p === P_FILL ? k.fill : k.stroke) as string, ink);
            ival[w] = rgb;
            if (rgb >= 0) {
              rgbToOklab(rgb, lab, 0);
              vals.set(lab, w * 3);
            }
            break;
          }
          case P_TEXT:
            ival[w] = intern(k.text as string);
            break;
          default:
            ival[w] = k.effect === "glow" ? 1 : 0;
        }
        w++;
      }
    }
    tracks.push({ start, times, vals, ival, cursor: new Int32Array(n).fill(-1) });
  }

  const c = {
    n,
    width: scene.canvas.w,
    height: scene.canvas.h,
    duration: scene.duration,
    ids,
    kind,
    firstAt,
    end,
    reachAt,
    parent,
    geomA,
    geomB,
    geomR,
    lineFrom,
    lineTo,
    order,
    lines,
    tracks,
    defFill,
    defStroke,
    strings,
    paper,
    ink,
  };
  return c as unknown as Compiled;
}
