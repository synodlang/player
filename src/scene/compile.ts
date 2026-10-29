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
//   effect track:    ival[k]            EFFECT_* code, 0 for "none" and anything unknown
//   dash track:      vals[2k], vals[2k + 1]  on and off lengths, 0 0 for solid
//   icon track:      ival[k]            index into ICON_NAMES, or -1 for an unknown name
//   role, face:      ival[k]            ROLE_* / FACE_* code
//   curve, trail, draw, halo, count: vals[k]
//   cursor[i]        hint: index of the last key found for shape i (a pure cache)
// A key is in a track only when the key sets that property.

import { parseHex, rgbToOklab } from "../math/oklab.ts";
import type { CameraTrack } from "../render/camera.ts";
import { iconIndex } from "../render/icons.ts";
import type { CompiledScene, Scene, SceneKey, Style } from "../types.ts";
import { BRAND_THEME } from "./load.ts";

export const KIND_CIRCLE = 0;
export const KIND_RECT = 1;
export const KIND_LABEL = 2;
export const KIND_LINE = 3;
export const KIND_GROUP = 4;
export const KIND_ICON = 5;
export const KIND_COUNTER = 6;

export const P_X = 0;
export const P_Y = 1;
export const P_SCALE = 2;
export const P_OPACITY = 3;
export const P_ROTATION = 4;
export const P_FILL = 5;
export const P_STROKE = 6;
export const P_TEXT = 7;
export const P_EFFECT = 8;
export const P_CURVE = 9;
export const P_TRAIL = 10;
export const P_DASH = 11;
export const P_DRAW = 12;
export const P_HALO = 13;
export const P_ICON = 14;
export const P_COUNT = 15;
export const P_ROLE = 16;
export const P_FACE = 17;
export const PROP_COUNT = 18;

/** Value of a numeric property before its first key (x, y, scale, opacity, rotation); x and y default to the canvas centre, so these two are unused. */
export const NUM_DEFAULTS: readonly number[] = [800, 500, 1, 1, 0];

/** Effect codes of the effect track. */
export const EFFECT_NONE = 0;
export const EFFECT_GLOW = 1;
export const EFFECT_INDICATE = 2;
export const EFFECT_FLASH = 3;
export const EFFECT_CIRCUMSCRIBE = 4;
export const EFFECT_RIPPLE = 5;
export const EFFECT_SWEEP = 6;
const EFFECT_CODES: Readonly<Record<string, number>> = {
  glow: EFFECT_GLOW,
  indicate: EFFECT_INDICATE,
  flash: EFFECT_FLASH,
  circumscribe: EFFECT_CIRCUMSCRIBE,
  ripple: EFFECT_RIPPLE,
  sweep: EFFECT_SWEEP,
};

/** Role codes: label is the default (0). */
export const ROLE_LABEL = 0;
export const ROLE_TITLE = 1;
export const ROLE_VALUE = 2;
export const ROLE_CAPTION = 3;
const ROLE_CODES: Readonly<Record<string, number>> = {
  label: ROLE_LABEL,
  title: ROLE_TITLE,
  value: ROLE_VALUE,
  caption: ROLE_CAPTION,
};
export const FACE_SANS = 0;
export const FACE_MONO = 1;

/** Ghosts of a trail (the spec fixes the number). */
export const TRAIL_GHOSTS = 8;

function isNumericProp(p: number): boolean {
  return (
    p <= P_ROTATION ||
    p === P_CURVE ||
    p === P_TRAIL ||
    p === P_DRAW ||
    p === P_HALO ||
    p === P_COUNT
  );
}

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
  /** Resolved node (own, else nearest enclosing group's): index into nodeNames, or -1. */
  readonly nodeIx: Int32Array;
  readonly nodeNames: readonly string[];
  /** Resolved msg id (own, else nearest enclosing group's), or -1. */
  readonly msgOf: Float64Array;
  /** Indexed by P_*. */
  readonly tracks: readonly Track[];
  /** Fill and stroke before the first key: packed color or -1 (label fill Ink, line stroke Line). */
  readonly defFill: Int32Array;
  readonly defStroke: Int32Array;
  /** Label texts; index 0 is "". */
  readonly strings: readonly string[];
  /** Length of each string in code points. */
  readonly strLen: Int32Array;
  /** Packed Paper, Ink and Warning. */
  readonly paper: number;
  readonly ink: number;
  readonly warning: number;
  /** OKLab of Warning, for the indicate effect. */
  readonly warningLab: Float64Array;
  readonly style: Style;
  /** style.easing is "spring". */
  readonly spring: boolean;
  /** The camera keys, or null when the scene has none. */
  readonly camera: CameraTrack | null;
  /** icon: size. */
  readonly iconSize: Float64Array;
  /**
   * For a shape with a trail: the shapes to evaluate at a ghost's time, ancestors first, then
   * itself and its descendants, parents before children; else null.
   */
  readonly ghostSet: readonly (Int32Array | null)[];
  /** For a group: the highest shape index among its descendants, else -1. */
  readonly lastMember: Int32Array;
  /** Chain of groups whose last member is shape i: head per shape, then next per group. */
  readonly groupsEndingAt: Int32Array;
  readonly nextGroupEnding: Int32Array;
  /** Whether some group (or line) can carry a drawn effect (flash, circumscribe, ripple, sweep). */
  readonly groupEffects: boolean;
  /** Font families the scene uses: face sans and mono. */
  readonly usesSans: boolean;
  readonly usesMono: boolean;
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
    case P_EFFECT:
      return k.effect !== undefined;
    case P_CURVE:
      return k.curve !== undefined;
    case P_TRAIL:
      return k.trail !== undefined;
    case P_DASH:
      return k.dash !== undefined;
    case P_DRAW:
      return k.draw !== undefined;
    case P_HALO:
      return k.halo !== undefined;
    case P_ICON:
      return k.icon !== undefined;
    case P_COUNT:
      return k.count !== undefined;
    case P_ROLE:
      return k.role !== undefined;
    default:
      return k.face !== undefined;
  }
}

/** The value of a numeric property key (x ... rotation, curve, trail, draw, halo, count). */
function numeric(k: SceneKey, p: number): number {
  switch (p) {
    case P_X:
      return k.x as number;
    case P_Y:
      return k.y as number;
    case P_SCALE:
      return k.scale as number;
    case P_OPACITY:
      return k.opacity as number;
    case P_ROTATION:
      return k.rotation as number;
    case P_CURVE:
      return k.curve as number;
    case P_TRAIL:
      return k.trail as number;
    case P_DRAW:
      return k.draw as number;
    case P_HALO:
      return k.halo as number;
    default:
      return k.count as number;
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
      case "icon":
        kind[i] = KIND_ICON;
        geomA[i] = s.props.size;
        defStroke[i] = ink;
        break;
      case "counter":
        kind[i] = KIND_COUNTER;
        defFill[i] = ink;
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

  // node and msg resolve outward along the group chain, separately.
  const nodeNames: string[] = [];
  const nodeIx = new Int32Array(n).fill(-1);
  const msgOf = new Float64Array(n).fill(-1);
  {
    const nameIx = new Map<string, number>();
    for (const i of order) {
      const own = shapes[i] as { node?: string; msg?: number };
      const p = parent[i] as number;
      if (own.node !== undefined) {
        let v = nameIx.get(own.node);
        if (v === undefined) {
          v = nodeNames.length;
          nodeNames.push(own.node);
          nameIx.set(own.node, v);
        }
        nodeIx[i] = v;
      } else if (p >= 0) {
        nodeIx[i] = nodeIx[p] as number;
      }
      msgOf[i] = own.msg !== undefined ? own.msg : p >= 0 ? (msgOf[p] as number) : -1;
    }
  }

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
    const numericProp = isNumericProp(p);
    const vals = new Float64Array(
      numericProp ? total : color ? total * 3 : p === P_DASH ? total * 2 : 0,
    );
    const ival = new Int32Array(numericProp || p === P_DASH ? 0 : total);
    let w = 0;
    for (let i = 0; i < n; i++) {
      for (const k of (shapes[i] as { keys: SceneKey[] }).keys) {
        if (!has(k, p)) continue;
        times[w] = k.at;
        if (numericProp) {
          vals[w] = numeric(k, p);
        } else {
          switch (p) {
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
            case P_EFFECT:
              ival[w] = EFFECT_CODES[k.effect as string] ?? EFFECT_NONE;
              break;
            case P_DASH: {
              const d = k.dash as number[];
              vals[2 * w] = d.length === 2 ? (d[0] as number) : 0;
              vals[2 * w + 1] = d.length === 2 ? (d[1] as number) : 0;
              break;
            }
            case P_ICON:
              ival[w] = iconIndex(k.icon as string);
              break;
            case P_ROLE:
              ival[w] = ROLE_CODES[k.role as string] ?? ROLE_LABEL;
              break;
            default:
              ival[w] = k.face === "mono" ? FACE_MONO : FACE_SANS;
          }
        }
        w++;
      }
    }
    tracks.push({ start, times, vals, ival, cursor: new Int32Array(n).fill(-1) });
  }

  // Groups: the last descendant (for the effects drawn after the group's members).
  const lastMember = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let p = parent[i] as number; p >= 0; p = parent[p] as number) {
      if (i > (lastMember[p] as number)) lastMember[p] = i;
    }
  }
  const groupsEndingAt = new Int32Array(n).fill(-1);
  const nextGroupEnding = new Int32Array(n).fill(-1);
  for (let g = n - 1; g >= 0; g--) {
    const l = lastMember[g] as number;
    if (l < 0) continue;
    nextGroupEnding[g] = groupsEndingAt[l] as number;
    groupsEndingAt[l] = g;
  }

  // Trails: for each shape with a positive trail, the shapes a ghost evaluates.
  const trailTrack = tracks[P_TRAIL] as Track;
  const ghostSet: (Int32Array | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let on = false;
    for (let k = trailTrack.start[i] as number; k < (trailTrack.start[i + 1] as number); k++) {
      if ((trailTrack.vals[k] as number) > 0) on = true;
    }
    if (!on || kind[i] === KIND_LINE) continue;
    const chain: number[] = [];
    for (let p = parent[i] as number; p >= 0; p = parent[p] as number) chain.unshift(p);
    const set = [...chain];
    const inside = new Set<number>([i]);
    set.push(i);
    for (const j of order) {
      if (inside.has(j)) continue;
      if (inside.has(parent[j] as number)) {
        inside.add(j);
        set.push(j);
      }
    }
    ghostSet[i] = Int32Array.from(set);
  }

  // Which font families the scene draws with.
  let usesSans = false;
  let usesMono = false;
  const faceTrack = tracks[P_FACE] as Track;
  for (let i = 0; i < n; i++) {
    if (kind[i] !== KIND_LABEL && kind[i] !== KIND_COUNTER) continue;
    const a = faceTrack.start[i] as number;
    const b = faceTrack.start[i + 1] as number;
    if (a === b) {
      usesSans = true;
      continue;
    }
    if ((faceTrack.times[a] as number) > (firstAt[i] as number)) usesSans = true;
    for (let k = a; k < b; k++) {
      if (faceTrack.ival[k] === FACE_MONO) usesMono = true;
      else usesSans = true;
    }
  }

  let groupEffects = false;
  const effTrack = tracks[P_EFFECT] as Track;
  for (let i = 0; i < n; i++) {
    for (let k = effTrack.start[i] as number; k < (effTrack.start[i + 1] as number); k++) {
      if ((effTrack.ival[k] as number) >= EFFECT_FLASH && kind[i] === KIND_GROUP)
        groupEffects = true;
    }
  }

  const warning = packedColor({ ...BRAND_THEME, ...theme }, "Warning", ink);
  const warningLab = new Float64Array(3);
  rgbToOklab(warning, warningLab, 0);
  const style = scene.style;
  const camKeys = scene.camera;
  const camera: CameraTrack | null =
    camKeys.length > 0
      ? {
          at: Float64Array.from(camKeys, (k) => k.at),
          x: Float64Array.from(camKeys, (k) => k.x),
          y: Float64Array.from(camKeys, (k) => k.y),
          zoom: Float64Array.from(camKeys, (k) => k.zoom),
        }
      : null;

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
    nodeIx,
    nodeNames,
    msgOf,
    tracks,
    defFill,
    defStroke,
    strings,
    strLen: Int32Array.from(strings, (str) => [...str].length),
    paper,
    ink,
    warning,
    warningLab,
    style,
    spring: style.easing === "spring",
    camera,
    iconSize: geomA,
    ghostSet,
    lastMember,
    groupsEndingAt,
    nextGroupEnding,
    groupEffects,
    usesSans,
    usesMono,
  };
  return c as unknown as Compiled;
}
