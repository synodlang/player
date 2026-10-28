// createPlayer: a clock, a compiled scene and a canvas, with events.

import { hitTestScene, nodeBoundsScene } from "../eval/hit.ts";
import { renderToContext } from "../render/draw.ts";
import { FONT_FILES, FONT_WEIGHTS } from "../render/style.ts";
import { backingSize } from "../render/viewport.ts";
import type { Compiled } from "../scene/compile.ts";
import { compileScene } from "../scene/compile.ts";
import { loadScene } from "../scene/load.ts";
import type {
  CompiledScene,
  Ctx2D,
  Player,
  PlayerEventMap,
  PlayerEventName,
  PlayerOptions,
  Scene,
  SceneMarker,
  TraceEntry,
  View,
} from "../types.ts";
import { Clock, clampRate } from "./clock.ts";

/** What the player needs from its environment; tests inject fakes. */
export interface PlayerEnv {
  now(): number;
  raf(cb: () => void): number;
  caf(handle: number): void;
  /** Called with a resize callback; returns a disconnect function. */
  observe?(canvas: object, cb: () => void): () => void;
  /** document.fonts (or a fake). */
  fonts?: {
    ready: Promise<unknown>;
    addEventListener(type: "loadingdone", cb: () => void): void;
    removeEventListener(type: "loadingdone", cb: () => void): void;
    load?(font: string): Promise<unknown>;
    add?(face: unknown): unknown;
  };
  /** The FontFace constructor, when the environment has one. */
  fontFace?: new (
    family: string,
    source: string,
    descriptors: { weight: string; style: string },
  ) => { load(): Promise<unknown> };
  devicePixelRatio: number;
}

function defaultEnv(): PlayerEnv {
  const g = globalThis as unknown as {
    requestAnimationFrame?: (cb: () => void) => number;
    cancelAnimationFrame?: (h: number) => void;
    ResizeObserver?: new (cb: () => void) => { observe(el: object): void; disconnect(): void };
    document?: { fonts?: PlayerEnv["fonts"] };
    FontFace?: PlayerEnv["fontFace"];
    devicePixelRatio?: number;
  };
  const env: PlayerEnv = {
    now: () => performance.now(),
    raf: (cb) =>
      g.requestAnimationFrame
        ? g.requestAnimationFrame(cb)
        : (setTimeout(cb, 16) as unknown as number),
    caf: (h) => {
      if (g.cancelAnimationFrame) g.cancelAnimationFrame(h);
      else clearTimeout(h);
    },
    devicePixelRatio: g.devicePixelRatio ?? 1,
  };
  const RO = g.ResizeObserver;
  if (RO) {
    env.observe = (canvas, cb) => {
      const ro = new RO(cb);
      ro.observe(canvas);
      return () => ro.disconnect();
    };
  }
  const fonts = g.document?.fonts;
  if (fonts) env.fonts = fonts;
  if (g.FontFace) env.fontFace = g.FontFace;
  return env;
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
type Listener = (e: never) => void;

function byAt<T extends { at: number }>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => a.at - b.at);
}

export function createPlayer(
  canvas: CanvasLike,
  scene: Scene | string | object,
  options?: PlayerOptions,
): Player {
  return createPlayerWithEnv(canvas, scene, options, defaultEnv());
}

export function createPlayerWithEnv(
  canvas: CanvasLike,
  initial: Scene | string | object,
  options: PlayerOptions | undefined,
  env: PlayerEnv,
): Player {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as unknown as Ctx2D | null;
  if (!ctx) throw new Error("synod player: the canvas has no 2d context");
  const isHtml = "clientWidth" in canvas;

  const clock = new Clock(env.now);
  const opts = options ?? {};
  clock.loop = opts.loop ?? false;
  clock.rate = clampRate(opts.rate ?? 1);
  let stopAtPause = opts.stopAtPause ?? false;
  const timeEventMs =
    opts.timeEventHz && opts.timeEventHz > 0 ? 1000 / opts.timeEventHz : 1000 / 60;
  const renderOpts: { sans?: string; mono?: string } = {};
  if (opts.fonts?.sans !== undefined) renderOpts.sans = opts.fonts.sans;
  if (opts.fonts?.mono !== undefined) renderOpts.mono = opts.fonts.mono;

  let compiled: CompiledScene;
  let duration = 0;
  let markers: SceneMarker[] = [];
  let trace: TraceEntry[] = [];
  let warnings: string[] = [];
  let pixelRatio = opts.pixelRatio ?? env.devicePixelRatio;
  let view: View | null = null;
  let drawnAt = 0;
  let rafHandle = 0;
  let lastTimeEmit = Number.NEGATIVE_INFINITY;
  let factSeq = -1;
  let destroyed = false;
  const listeners = new Map<PlayerEventName, Set<Listener>>();
  /** Font files requested through options.fontBase, by family. */
  const loading = new Map<string, Promise<unknown>>();

  function emit<K extends PlayerEventName>(name: K, payload: PlayerEventMap[K]): void {
    const set = listeners.get(name);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as (e: PlayerEventMap[K]) => void)(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function install(input: Scene | string | object): void {
    const result = loadScene(input);
    const s = result.scene;
    compiled = compileScene(s);
    duration = s.duration;
    markers = byAt(s.markers);
    trace = byAt(s.trace);
    warnings = result.warnings;
    registerFonts();
  }

  /** The families of the font set this scene draws with, less the ones the host overrides. */
  function families(): string[] {
    const c = compiled as Compiled;
    const out: string[] = [];
    if (c.usesSans && opts.fonts?.sans === undefined) out.push(c.style.sans);
    if (c.usesMono && opts.fonts?.mono === undefined && !out.includes(c.style.mono)) {
      out.push(c.style.mono);
    }
    return out;
  }

  /** Registers the font files of `options.fontBase` for the families the scene uses. */
  function registerFonts(): void {
    const base = opts.fontBase;
    if (base === undefined || !env.fontFace || !env.fonts?.add) return;
    for (const family of families()) {
      const file = FONT_FILES[family];
      if (file === undefined || loading.has(family)) continue;
      const face = new env.fontFace(family, `url(${base.replace(/\/+$/, "")}/${file})`, {
        weight: FONT_WEIGHTS[family] as string,
        style: "normal",
      });
      env.fonts.add(face);
      loading.set(family, face.load());
    }
  }

  function fontsReady(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const family of families()) {
      const pending = loading.get(family);
      if (pending) jobs.push(pending);
      else if (env.fonts?.load) jobs.push(env.fonts.load(`500 16px "${family}"`));
    }
    return Promise.all(jobs.map((j) => j.catch(() => undefined))).then(() => {
      if (!destroyed && !clock.playing && view) draw(drawnAt);
    });
  }

  function factAt(at: number): TraceEntry | null {
    let lo = 0;
    let hi = trace.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (trace[mid]!.at <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? null : trace[lo - 1]!;
  }

  function draw(at: number = clock.time): void {
    if (!view || !(view.width > 0) || !(view.height > 0)) return;
    drawnAt = at;
    renderToContext(ctx as Ctx2D, compiled, at, view, renderOpts);
  }

  function emitTime(): void {
    lastTimeEmit = env.now();
    emit("time", { at: clock.time });
  }

  function checkFact(): void {
    const f = factAt(clock.time);
    if (f && f.seq !== factSeq) {
      factSeq = f.seq;
      emit("fact", { seq: f.seq, at: f.at });
    } else if (!f) factSeq = -1;
  }

  /** Markers with lo < at <= hi (lo = -Infinity includes everything up to hi). */
  function crossing(lo: number, hi: number, out: SceneMarker[], includeStart: boolean): void {
    for (const m of markers) {
      if (m.at > hi) break;
      if (m.at > lo || (includeStart && m.at === lo)) out.push(m);
    }
  }

  function schedule(): void {
    if (rafHandle === 0 && clock.playing && !destroyed) rafHandle = env.raf(onFrame);
  }
  function cancel(): void {
    if (rafHandle !== 0) {
      env.caf(rafHandle);
      rafHandle = 0;
    }
  }

  function halt(reason: "user" | "marker" | "end"): void {
    clock.stop();
    cancel();
    emit("pause", { reason });
  }

  /** Advance the clock, fire crossed markers, stop at pause markers or the end. */
  function advance(): boolean {
    const step = clock.advance();
    if (!step) return false;
    const crossed: SceneMarker[] = [];
    if (step.wrapped) {
      crossing(step.from, duration, crossed, false);
      crossing(0, step.to, crossed, true);
    } else {
      crossing(step.from, step.to, crossed, false);
    }
    let stoppedAt: SceneMarker | null = null;
    if (stopAtPause) {
      const i = crossed.findIndex((m) => m.kind === "pause");
      if (i >= 0) {
        stoppedAt = crossed[i]!;
        crossed.length = i + 1;
        clock.seek(stoppedAt.at);
        clock.stop();
      }
    }
    for (const m of crossed) emit("marker", { marker: m });
    checkFact();
    if (stoppedAt) {
      emitTime();
      draw();
      halt("marker");
    } else if (step.ended) {
      emitTime();
      draw();
      halt("end");
    } else {
      if (env.now() - lastTimeEmit >= timeEventMs) emitTime();
      draw();
    }
    return true;
  }

  function onFrame(): void {
    rafHandle = 0;
    if (destroyed) return;
    advance();
    schedule();
  }

  function play(): void {
    if (destroyed || clock.playing) return;
    if (!clock.loop && clock.time >= duration && duration > 0) clock.seek(0);
    clock.start();
    emit("play", {});
    schedule();
  }

  function pause(): void {
    if (destroyed || !clock.playing) return;
    advance();
    if (clock.playing) {
      emitTime();
      draw();
      halt("user");
    }
  }

  function seek(at: number): void {
    if (destroyed) return;
    clock.seek(at);
    checkFact();
    emitTime();
    draw();
  }

  function distinct(dir: 1 | -1): TraceEntry | null {
    const t = clock.time;
    let at: number | null = null;
    for (const e of trace) {
      if (dir === 1 && e.at > t) {
        at = e.at;
        break;
      }
      if (dir === -1 && e.at < t) at = e.at;
    }
    return at === null ? null : factAt(at);
  }

  function jump(dir: 1 | -1): TraceEntry | null {
    if (destroyed) return null;
    const e = distinct(dir);
    if (!e) return null;
    pause();
    seek(e.at);
    return e;
  }

  function resize(cssWidth?: number, cssHeight?: number, ratio?: number): void {
    if (destroyed) return;
    if (ratio !== undefined && ratio > 0) pixelRatio = ratio;
    const pr = pixelRatio > 0 && Number.isFinite(pixelRatio) ? pixelRatio : 1;
    const w = cssWidth ?? (isHtml ? (canvas as HTMLCanvasElement).clientWidth : canvas.width / pr);
    const h =
      cssHeight ?? (isHtml ? (canvas as HTMLCanvasElement).clientHeight : canvas.height / pr);
    view = { width: w, height: h, pixelRatio: pr };
    if (w > 0 && h > 0) {
      const bw = backingSize(w, pr);
      const bh = backingSize(h, pr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
    }
    draw();
  }

  install(initial);
  clock.setDuration(duration);
  clock.seek(0);
  const factInit = factAt(0);
  if (factInit) factSeq = factInit.seq;

  const disconnect: (() => void)[] = [];
  resize();
  if (isHtml && (opts.autoResize ?? true) && env.observe) {
    disconnect.push(env.observe(canvas, () => resize()));
  }
  if (env.fonts) {
    const fonts = env.fonts;
    const redraw = () => {
      if (!destroyed && !clock.playing) draw(drawnAt);
    };
    fonts.addEventListener("loadingdone", redraw);
    disconnect.push(() => fonts.removeEventListener("loadingdone", redraw));
    void fonts.ready.then(redraw);
  }

  const player: Player = {
    get duration() {
      return duration;
    },
    get time() {
      return clock.time;
    },
    get playing() {
      return clock.playing;
    },
    get rate() {
      return clock.rate;
    },
    get markers() {
      return markers;
    },
    get trace() {
      return trace;
    },
    get warnings() {
      return warnings;
    },
    play,
    pause,
    toggle() {
      if (clock.playing) pause();
      else play();
    },
    seek,
    setRate(r) {
      if (destroyed) return;
      advance();
      clock.setRate(r);
    },
    setLoop(b) {
      clock.loop = b;
    },
    setStopAtPause(b) {
      stopAtPause = b;
    },
    nextFact: () => jump(1),
    prevFact: () => jump(-1),
    factAt,
    timeOfSeq(seq) {
      for (const e of trace) if (e.seq === seq) return e.at;
      return null;
    },
    setScene(input, o) {
      if (destroyed) return;
      const keep = o?.keepTime ?? true;
      advance();
      install(input);
      clock.setDuration(duration);
      clock.seek(keep ? Math.min(clock.time, duration) : 0);
      const f = factAt(clock.time);
      factSeq = f ? f.seq : -1;
      draw();
      emit("scene", {});
      emitTime();
    },
    hitTest(x, y) {
      if (destroyed || !view || !(view.width > 0) || !(view.height > 0)) return null;
      return hitTestScene(compiled, drawnAt, view, x, y);
    },
    nodeBounds() {
      if (destroyed || !view || !(view.width > 0) || !(view.height > 0)) return [];
      return nodeBoundsScene(compiled, drawnAt, view);
    },
    resize,
    fontsReady,
    renderFrame(at) {
      if (!destroyed) draw(at);
    },
    on(event, cb) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(cb as unknown as Listener);
      return () => {
        listeners.get(event)?.delete(cb as unknown as Listener);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clock.stop();
      cancel();
      for (const d of disconnect) d();
      disconnect.length = 0;
      listeners.clear();
    },
  };

  if (opts.autoplay) play();
  return player;
}
