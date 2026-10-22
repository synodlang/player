import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlayerWithEnv, type PlayerEnv } from "../../src/player/player.ts";
import type { Player, PlayerEventName } from "../../src/types.ts";
import { SceneError } from "../../src/types.ts";
import { NullContext } from "../helpers/null-context.ts";

interface Fake {
  env: PlayerEnv;
  canvas: { width: number; height: number; getContext(k: string): NullContext };
  ctx: NullContext;
  wall: number;
  /** Move the wall clock and run the pending frame callback, if any. */
  frame(ms: number): void;
  pending(): number;
  cancelled: number;
}

function fake(): Fake {
  const ctx = new NullContext();
  let cb: (() => void) | null = null;
  let handle = 0;
  const f: Fake = {
    ctx,
    canvas: { width: 800, height: 500, getContext: () => ctx },
    wall: 0,
    cancelled: 0,
    pending: () => (cb ? 1 : 0),
    frame(ms) {
      f.wall += ms;
      const run = cb;
      cb = null;
      run?.();
    },
    env: {
      now: () => f.wall,
      raf(fn) {
        cb = fn;
        return ++handle;
      },
      caf() {
        cb = null;
        f.cancelled++;
      },
      devicePixelRatio: 1,
    },
  };
  return f;
}

function scene(extra: object = {}) {
  return {
    format: "synod-scene/1",
    duration: 1000,
    canvas: { w: 800, h: 500 },
    shapes: [
      {
        id: "a",
        kind: "circle",
        props: { r: 10 },
        keys: [
          { at: 0, x: 100, y: 100, fill: "Ink" },
          { at: 1000, x: 700 },
        ],
      },
    ],
    markers: [
      { at: 200, kind: "caption", text: "c" },
      { at: 500, kind: "pause", text: "p" },
      { at: 800, kind: "broken", text: "b" },
    ],
    trace: [
      { seq: 1, at: 100 },
      { seq: 2, at: 300 },
      { seq: 3, at: 300 },
      { seq: 4, at: 700 },
    ],
    ...extra,
  };
}

function make(extra: object = {}, opts = {}) {
  const f = fake();
  const p = createPlayerWithEnv(
    f.canvas as unknown as HTMLCanvasElement,
    scene(extra),
    { pixelRatio: 1, ...opts },
    f.env,
  );
  return { f, p };
}

function record(p: Player, ...names: PlayerEventName[]) {
  const log: string[] = [];
  for (const n of names) {
    p.on(n, (e: unknown) => log.push(`${n}:${JSON.stringify(e)}`));
  }
  return log;
}

test("draws once at creation and sizes the backing store", () => {
  const { f, p } = make();
  assert.ok(f.ctx.calls > 0);
  assert.equal(p.duration, 1000);
  assert.equal(p.time, 0);
  assert.equal(p.playing, false);
  assert.equal(f.pending(), 0);
  p.resize(400, 250, 2);
  assert.equal(f.canvas.width, 800);
  assert.equal(f.canvas.height, 500);
});

test("playback follows the clock and the rate", () => {
  const { f, p } = make({}, { rate: 2 });
  p.play();
  f.frame(100);
  assert.equal(p.time, 200);
  p.setRate(1);
  assert.equal(p.rate, 1);
  f.frame(100);
  assert.equal(p.time, 300);
  p.setRate(100);
  assert.equal(p.rate, 4);
});

test("pauses at the end and play restarts from 0", () => {
  const { f, p } = make();
  const log = record(p, "pause", "play");
  p.play();
  f.frame(5000);
  assert.equal(p.time, 1000);
  assert.equal(p.playing, false);
  assert.deepEqual(log, ["play:{}", 'pause:{"reason":"end"}']);
  assert.equal(f.pending(), 0);
  p.play();
  assert.equal(p.time, 0);
  assert.equal(p.playing, true);
});

test("loop wraps and keeps playing", () => {
  const { f, p } = make({}, { loop: true });
  p.play();
  f.frame(1200);
  assert.equal(p.time, 200);
  assert.equal(p.playing, true);
  assert.equal(f.pending(), 1);
});

test("marker crossing fires each marker once, in order", () => {
  const { f, p } = make();
  const log = record(p, "marker");
  p.play();
  f.frame(250);
  f.frame(100);
  f.frame(600);
  f.frame(10);
  assert.equal(log.length, 3);
  assert.match(log[0] as string, /"c"/);
  assert.match(log[2] as string, /"b"/);
});

test("markers fire across a loop wrap, including the start", () => {
  const { f, p } = make(
    {
      markers: [
        { at: 0, kind: "caption", text: "z" },
        { at: 900, kind: "caption", text: "n" },
      ],
    },
    { loop: true },
  );
  p.seek(800);
  const log = record(p, "marker");
  p.play();
  f.frame(300);
  assert.equal(log.length, 2);
  assert.match(log[0] as string, /"n"/);
  assert.match(log[1] as string, /"z"/);
});

test("stopAtPause clamps to the marker, pauses, and resuming does not re-fire", () => {
  const { f, p } = make({}, { stopAtPause: true });
  const log = record(p, "marker", "pause");
  p.play();
  f.frame(700);
  assert.equal(p.time, 500);
  assert.equal(p.playing, false);
  assert.deepEqual(
    log.slice(-2).map((l) => l.slice(0, 6)),
    ["marker", "pause:"],
  );
  assert.match(log[log.length - 1] as string, /marker/);
  const n = log.length;
  p.play();
  f.frame(100);
  assert.equal(p.time, 600);
  assert.equal(log.length, n); // pause marker not fired again
  f.frame(300); // crosses the broken marker at 800
  assert.equal(log.length, n + 1);
});

test("without stopAtPause a pause marker only fires an event", () => {
  const { f, p } = make();
  p.play();
  f.frame(600);
  assert.equal(p.playing, true);
  p.setStopAtPause(true);
  p.seek(0);
  f.frame(0);
  f.frame(600);
  assert.equal(p.time, 500);
  assert.equal(p.playing, false);
});

test("seek clamps and fires no markers", () => {
  const { p } = make();
  const log = record(p, "marker", "time");
  p.seek(900);
  p.seek(-5);
  p.seek(5000);
  assert.equal(p.time, 1000);
  assert.deepEqual(
    log.filter((l) => l.startsWith("marker")),
    [],
  );
  assert.equal(log.filter((l) => l.startsWith("time")).length, 3);
});

test("nextFact and prevFact move over distinct at values", () => {
  const { p } = make();
  const a = p.nextFact();
  assert.equal(a?.at, 100);
  assert.equal(p.time, 100);
  const b = p.nextFact();
  assert.equal(b?.at, 300);
  assert.equal(b?.seq, 3); // the fact in force at 300
  assert.equal(p.nextFact()?.at, 700);
  assert.equal(p.nextFact(), null);
  assert.equal(p.prevFact()?.at, 300);
  assert.equal(p.prevFact()?.at, 100);
  assert.equal(p.prevFact(), null);
  assert.equal(p.time, 100);
});

test("nextFact pauses playback", () => {
  const { p } = make();
  p.play();
  p.nextFact();
  assert.equal(p.playing, false);
});

test("fact event fires when the current fact changes", () => {
  const { f, p } = make();
  const log = record(p, "fact");
  p.play();
  f.frame(150);
  f.frame(100);
  f.frame(100);
  assert.deepEqual(log, ['fact:{"seq":1,"at":100}', 'fact:{"seq":3,"at":300}']);
  assert.equal(p.factAt(50), null);
  assert.equal(p.timeOfSeq(4), 700);
  assert.equal(p.timeOfSeq(99), null);
});

test("setScene keeps time clamped, or resets it", () => {
  const { f, p } = make();
  const log = record(p, "scene");
  p.seek(900);
  p.setScene(scene({ duration: 400 }));
  assert.equal(p.duration, 400);
  assert.equal(p.time, 400);
  assert.deepEqual(log, ["scene:{}"]);
  p.setScene(scene(), { keepTime: false });
  assert.equal(p.time, 0);
  p.seek(300);
  p.setScene(JSON.stringify(scene()));
  assert.equal(p.time, 300);
  assert.throws(() => p.setScene("nope"), SceneError);
  assert.equal(p.time, 300);
  assert.ok(f.ctx.calls > 0);
});

test("pause keeps the time of the moment of the call", () => {
  const { f, p } = make();
  p.play();
  f.frame(100);
  f.wall += 50;
  p.pause();
  assert.equal(p.time, 150);
  assert.equal(p.playing, false);
  assert.equal(f.pending(), 0);
});

test("time events are throttled while playing", () => {
  const { f, p } = make({}, { timeEventHz: 10 });
  const log = record(p, "time");
  p.play();
  for (let i = 0; i < 10; i++) f.frame(16);
  assert.ok(log.length <= 2, `got ${log.length}`);
  assert.ok(log.length >= 1);
});

test("renderFrame draws without changing time or playback", () => {
  const { f, p } = make();
  const before = f.ctx.calls;
  p.renderFrame(500);
  assert.ok(f.ctx.calls > before);
  assert.equal(p.time, 0);
  assert.equal(p.playing, false);
});

test("unsubscribe stops delivery", () => {
  const { p } = make();
  let n = 0;
  const off = p.on("time", () => n++);
  p.seek(1);
  off();
  p.seek(2);
  assert.equal(n, 1);
});

test("destroy cancels the frame, clears listeners and ignores later calls", () => {
  const { f, p } = make();
  let events = 0;
  p.on("time", () => events++);
  p.play();
  assert.equal(f.pending(), 1);
  p.destroy();
  assert.equal(f.pending(), 0);
  assert.ok(f.cancelled >= 1);
  const calls = f.ctx.calls;
  p.seek(500);
  p.play();
  p.renderFrame(1);
  p.setScene(scene());
  assert.equal(events, 0);
  assert.equal(f.ctx.calls, calls);
  assert.equal(p.playing, false);
  p.destroy();
});

test("autoplay starts playing; bad scenes throw SceneError", () => {
  const f = fake();
  const p = createPlayerWithEnv(
    f.canvas as unknown as HTMLCanvasElement,
    scene(),
    { autoplay: true },
    f.env,
  );
  assert.equal(p.playing, true);
  assert.equal(f.pending(), 1);
  assert.throws(
    () => createPlayerWithEnv(f.canvas as unknown as HTMLCanvasElement, "{", {}, f.env),
    SceneError,
  );
});

test("fonts loadingdone redraws a paused player and is removed on destroy", () => {
  const f = fake();
  let listener: (() => void) | null = null;
  let removed = false;
  f.env.fonts = {
    ready: Promise.resolve(),
    addEventListener: (_t, cb) => {
      listener = cb;
    },
    removeEventListener: () => {
      removed = true;
    },
  };
  const p = createPlayerWithEnv(f.canvas as unknown as HTMLCanvasElement, scene(), {}, f.env);
  const calls = f.ctx.calls;
  (listener as (() => void) | null)?.();
  assert.ok(f.ctx.calls > calls);
  p.destroy();
  assert.equal(removed, true);
});
