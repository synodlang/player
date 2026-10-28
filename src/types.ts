// Public types of the Synod player. This file is self-contained (it imports
// nothing) so that the build can concatenate it into one declaration file.

/** The theme: color name to "#rrggbb". The eight std/theme names are always present. */
export type Theme = Record<string, string>;

/** One keyframe. Only the properties that change at `at` are present. */
export interface SceneKey {
  at: number;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  /** Degrees, clockwise (y points down). */
  rotation?: number;
  /** A color name; "" means no fill. */
  fill?: string;
  stroke?: string;
  text?: string;
  /** "glow", "indicate", "flash", "circumscribe", "ripple", "sweep" or "none"; anything else draws as "none". */
  effect?: string;
  /** Bend of later moves (-1..1), a step (0.3). */
  curve?: number;
  /** Trail length in ms, a step (0.3). */
  trail?: number;
  /** [on, off] dash lengths in scene units, a step; [] is solid (0.3). */
  dash?: number[];
  /** How much of the shape is drawn, 0..1 (0.3). */
  draw?: number;
  /** Sustained glow, 0..1 (0.3). */
  halo?: number;
  /** Name of an icon of the icon set; morphs between keys (0.3). */
  icon?: string;
  /** The number a counter shows (0.3). */
  count?: number;
  /** "title", "label", "value" or "caption", a step (0.3). */
  role?: string;
  /** "sans" or "mono", a step (0.3). */
  face?: string;
}

export interface CircleShape {
  id: string;
  kind: "circle";
  props: { r: number };
  keys: SceneKey[];
  end?: number;
  /** The node this shape is attached to (`draw ... for n`); not drawn. */
  node?: string;
  /** The trace message id of the shape's first flight; not drawn. */
  msg?: number;
}
export interface RectShape {
  id: string;
  kind: "rect";
  props: { w: number; h: number; radius: number };
  keys: SceneKey[];
  end?: number;
  /** The node this shape is attached to (`draw ... for n`); not drawn. */
  node?: string;
  /** The trace message id of the shape's first flight; not drawn. */
  msg?: number;
}
export interface LabelShape {
  id: string;
  kind: "label";
  props: Record<string, never>;
  keys: SceneKey[];
  end?: number;
  /** The node this shape is attached to (`draw ... for n`); not drawn. */
  node?: string;
  /** The trace message id of the shape's first flight; not drawn. */
  msg?: number;
}
export interface LineShape {
  id: string;
  kind: "line";
  props: { from: string; to: string };
  keys: SceneKey[];
  end?: number;
  /** The node this shape is attached to (`draw ... for n`); not drawn. */
  node?: string;
  /** The trace message id of the shape's first flight; not drawn. */
  msg?: number;
}
export interface GroupShape {
  id: string;
  kind: "group";
  props: { items: string[] };
  keys: SceneKey[];
  end?: number;
  /** The node this shape is attached to (`draw ... for n`); not drawn. */
  node?: string;
  /** The trace message id of the shape's first flight; not drawn. */
  msg?: number;
}
export interface IconShape {
  id: string;
  kind: "icon";
  props: { size: number };
  keys: SceneKey[];
  end?: number;
  node?: string;
  msg?: number;
}
export interface CounterShape {
  id: string;
  kind: "counter";
  props: Record<string, never>;
  keys: SceneKey[];
  end?: number;
  node?: string;
  msg?: number;
}
export type SceneShape =
  | CircleShape
  | RectShape
  | LabelShape
  | LineShape
  | GroupShape
  | IconShape
  | CounterShape;

/** The look of a scene (0.3); every key has the value of std/theme/default when absent. */
export interface Style {
  sans: string;
  mono: string;
  titleSize: number;
  titleWeight: number;
  labelSize: number;
  labelWeight: number;
  valueSize: number;
  captionSize: number;
  tracking: number;
  stroke: number;
  glow: number;
  shadow: number;
  vignette: number;
  sketch: number;
  drift: number;
  easing: "smooth" | "spring";
}

/** One camera key (0.3): the camera is at (x, y) with `zoom` at time `at`. */
export interface CameraKey {
  at: number;
  x: number;
  y: number;
  zoom: number;
}

export type MarkerKind = "pause" | "caption" | "broken" | "failed";
export interface SceneMarker {
  at: number;
  kind: MarkerKind;
  text: string;
  /** Predict choices; only on `pause`, only when not empty. */
  choices?: string[];
}
/** Maps a trace seq to its presentation slot (ms). */
export interface TraceEntry {
  seq: number;
  at: number;
}

/**
 * A loaded, validated and normalized scene: keys sorted, unknown shape kinds
 * and unknown marker kinds removed, references to removed shapes dropped, every
 * id unique, every shape in at most one group, no group cycles.
 */
export interface Scene {
  format: string;
  duration: number;
  canvas: { w: number; h: number };
  theme: Theme;
  style: Style;
  shapes: SceneShape[];
  camera: CameraKey[];
  markers: SceneMarker[];
  trace: TraceEntry[];
}

export type SceneErrorCode = "bad-json" | "unsupported-format" | "bad-scene";

/** Thrown by loadScene (and by the player when handed a bad scene). */
export class SceneError extends Error {
  code: SceneErrorCode;
  constructor(code: SceneErrorCode, message: string) {
    super(message);
    this.name = "SceneError";
    this.code = code;
  }
}

declare const compiledBrand: unique symbol;
/** A scene compiled for fast evaluation. Opaque: made by compileScene. */
export interface CompiledScene {
  readonly [compiledBrand]: true;
}

/** The part of CanvasRenderingContext2D the player draws with. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  lineWidth: number;
  lineCap: CanvasLineCap;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetY: number;
  lineJoin: CanvasLineJoin;
  /** Optional: a context without letter spacing draws tracking as 0. */
  letterSpacing?: string;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  clip(): void;
  rect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  setLineDash(segments: number[]): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): { addColorStop(offset: number, color: string): void };
}

export interface View {
  /** CSS pixels. */
  width: number;
  height: number;
  pixelRatio?: number;
}

export interface PlayerOptions {
  autoplay?: boolean;
  loop?: boolean;
  /** Viewer speed, clamped to 0.25..4. Default 1. */
  rate?: number;
  /** Predict mode: playback stops at each pause marker. Default false. */
  stopAtPause?: boolean;
  /** Follow the canvas size with a ResizeObserver (HTMLCanvasElement only). Default true. */
  autoResize?: boolean;
  /** Default: devicePixelRatio. */
  pixelRatio?: number;
  /** Overrides the font family of face sans and mono (a CSS family list). */
  fonts?: { sans?: string; mono?: string };
  /**
   * URL of the folder that holds the font files of the release asset
   * `synod-player-fonts-<tag>.tar.gz` (Inter.woff2, JetBrainsMono.woff2,
   * SourceSerif4.woff2, ShantellSans.woff2). The player registers the families the
   * scene uses with `FontFace`. Without it the host must provide the fonts.
   */
  fontBase?: string;
  /** Maximum rate of "time" events. Default 60. */
  timeEventHz?: number;
}

/** What a click on the stage hit: the topmost drawn circle, rect, icon or counter with a node or msg. */
export interface HitResult {
  id: string;
  kind: "circle" | "rect" | "icon" | "counter";
  node: string | null;
  msg: number | null;
}
/** The box of a node in CSS pixels of the canvas, without slop. */
export interface NodeBox {
  node: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PauseReason = "user" | "marker" | "end";

export interface PlayerEventMap {
  time: { at: number };
  marker: { marker: SceneMarker };
  fact: { seq: number; at: number };
  play: Record<string, never>;
  pause: { reason: PauseReason };
  scene: Record<string, never>;
}
export type PlayerEventName = keyof PlayerEventMap;

export interface Player {
  readonly duration: number;
  readonly time: number;
  readonly playing: boolean;
  readonly rate: number;
  readonly markers: readonly SceneMarker[];
  readonly trace: readonly TraceEntry[];
  readonly warnings: readonly string[];
  play(): void;
  pause(): void;
  toggle(): void;
  seek(at: number): void;
  setRate(rate: number): void;
  setLoop(loop: boolean): void;
  setStopAtPause(stop: boolean): void;
  nextFact(): TraceEntry | null;
  prevFact(): TraceEntry | null;
  factAt(at: number): TraceEntry | null;
  timeOfSeq(seq: number): number | null;
  setScene(scene: Scene | string | object, opts?: { keepTime?: boolean }): void;
  /** The hit under (x, y) in CSS pixels of the canvas, on the frame last drawn; null for none. */
  hitTest(x: number, y: number): HitResult | null;
  /** The box of each node with drawn circles or rects, on the frame last drawn. */
  nodeBounds(): NodeBox[];
  resize(cssWidth?: number, cssHeight?: number, pixelRatio?: number): void;
  renderFrame(at: number): void;
  /**
   * Resolves when the font families the scene uses are loaded (or failed to load), so an
   * export can draw its first frame. Never rejects.
   */
  fontsReady(): Promise<void>;
  on<K extends PlayerEventName>(event: K, cb: (e: PlayerEventMap[K]) => void): () => void;
  destroy(): void;
}

export interface LoadResult {
  scene: Scene;
  warnings: string[];
}
