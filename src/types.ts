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
  /** "glow" or "none"; anything else draws as "none". */
  effect?: string;
}

export interface CircleShape {
  id: string;
  kind: "circle";
  props: { r: number };
  keys: SceneKey[];
  end?: number;
}
export interface RectShape {
  id: string;
  kind: "rect";
  props: { w: number; h: number; radius: number };
  keys: SceneKey[];
  end?: number;
}
export interface LabelShape {
  id: string;
  kind: "label";
  props: Record<string, never>;
  keys: SceneKey[];
  end?: number;
}
export interface LineShape {
  id: string;
  kind: "line";
  props: { from: string; to: string };
  keys: SceneKey[];
  end?: number;
}
export interface GroupShape {
  id: string;
  kind: "group";
  props: { items: string[] };
  keys: SceneKey[];
  end?: number;
}
export type SceneShape = CircleShape | RectShape | LabelShape | LineShape | GroupShape;

export type MarkerKind = "pause" | "caption" | "broken" | "failed";
export interface SceneMarker {
  at: number;
  kind: MarkerKind;
  text: string;
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
  shapes: SceneShape[];
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
  fonts?: { sans?: string; mono?: string };
  /** Maximum rate of "time" events. Default 60. */
  timeEventHz?: number;
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
  resize(cssWidth?: number, cssHeight?: number, pixelRatio?: number): void;
  renderFrame(at: number): void;
  on<K extends PlayerEventName>(event: K, cb: (e: PlayerEventMap[K]) => void): () => void;
  destroy(): void;
}

export interface LoadResult {
  scene: Scene;
  warnings: string[];
}
