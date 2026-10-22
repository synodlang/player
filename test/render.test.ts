import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToContext } from "../src/render/draw.ts";
import { computeViewport } from "../src/render/viewport.ts";
import { compileScene } from "../src/scene/compile.ts";
import { loadScene } from "../src/scene/load.ts";
import type { View } from "../src/types.ts";
import { NullContext } from "./helpers/null-context.ts";
import { RecordingContext } from "./helpers/recording-context.ts";
import { allScenes, compiled, loadFile } from "./helpers/scenes.ts";

const V: View = { width: 1600, height: 1000, pixelRatio: 1 };
const THEME = {
  Paper: "#151A2E",
  Ink: "#EDE9E1",
  Line: "#3A4366",
  Quiet: "#8A90A8",
  Accent: "#F4A340",
  Good: "#5CC8B8",
  Warning: "#E8C35A",
  Critical: "#E86F5A",
};

function draw(group: "examples" | "builder" | "handmade", name: string, at: number, v = V) {
  const { c } = compiled(group, name);
  const ctx = new RecordingContext();
  renderToContext(ctx, c, at, v);
  return ctx.lines;
}

function inline(shapes: unknown[], duration = 1000) {
  const { scene } = loadScene({
    format: "synod-scene/1",
    duration,
    canvas: { w: 1600, h: 1000 },
    theme: THEME,
    shapes,
    markers: [],
    trace: [],
  });
  return compileScene(scene);
}

test("viewport: letterbox 1000x1000 at DPR 2", () => {
  const vp = computeViewport(1600, 1000, 1000, 1000, 2);
  assert.equal(vp.scale, 0.625);
  assert.equal(vp.oy, 187.5);
  assert.deepEqual([vp.k, vp.tx, vp.ty], [1.25, 0, 375]);
  assert.deepEqual([vp.deviceWidth, vp.deviceHeight], [2000, 2000]);
  const odd = computeViewport(1600, 1000, 333.3, 200.2, 1.5);
  assert.equal(odd.deviceWidth, Math.round(333.3 * 1.5));
});

test("frame: clears with Paper, sets the fit transform, clips to the canvas", () => {
  const lines = draw("handmade", "stroke-only-rect", 0, {
    width: 1000,
    height: 1000,
    pixelRatio: 2,
  });
  assert.deepEqual(lines.slice(0, 11), [
    "save",
    "setTransform 1.00 0.00 0.00 1.00 0.00 0.00",
    "globalAlpha = 1.00",
    "shadowBlur = 0.00",
    "shadowColor = rgba(0, 0, 0, 0)",
    "fillStyle = #151a2e",
    "fillRect 0.00 0.00 2000.00 2000.00",
    "setTransform 1.25 0.00 0.00 1.25 0.00 375.00",
    "beginPath",
    "rect 0.00 0.00 1600.00 1000.00",
    "clip",
  ]);
  assert.equal(lines[lines.length - 1], "restore");
});

test("labels use 500 16px and the sans stack, centred", () => {
  const lines = draw("handmade", "stroke-only-rect", 0);
  assert.ok(lines.some((l) => l.startsWith("font = 500 16px -apple-system, system-ui")));
  assert.ok(lines.includes("textAlign = center"));
  assert.ok(lines.includes("textBaseline = middle"));
  assert.ok(lines.includes('fillText "stroke ignored" 0.00 0.00'));
  const ctx = new RecordingContext();
  renderToContext(ctx, compiled("handmade", "stroke-only-rect").c, 0, V, { sans: "Foo" });
  assert.ok(ctx.lines.includes("font = 500 16px Foo"));
});

test("stroke-only rect: arcTo path, stroke but no fill; radius limited; label ignores stroke", () => {
  const lines = draw("handmade", "stroke-only-rect", 0);
  const i = lines.indexOf("strokeStyle = #f4a340");
  assert.ok(i > 0);
  const path = lines.slice(i - 10, i + 2);
  assert.ok(path.includes("arcTo 100.00 -50.00 100.00 50.00 12.00"));
  assert.equal(lines[i + 1], "stroke");
  // the first rect has no fill() between its beginPath and stroke
  const bp = lines.indexOf(
    "beginPath",
    lines.indexOf("setTransform 1.00 0.00 0.00 1.00 400.00 300.00"),
  );
  assert.ok(!lines.slice(bp, i + 2).includes("fill"));
  // second rect: radius 100 limited to h/2 = 10
  assert.ok(lines.includes("arcTo 20.00 -10.00 20.00 10.00 10.00"));
  // label: no stroke after its fillText
  const ft = lines.findIndex((l) => l.startsWith("fillText"));
  assert.ok(!lines.slice(ft).includes("strokeStyle = #e86f5a"));
});

test("lines: world centre to world centre, scene transform, round caps, own stroke", () => {
  const lines = draw("handmade", "lines", 0);
  assert.ok(lines.includes("lineCap = round"));
  assert.ok(lines.includes("strokeStyle = #f4a340"));
  const m = lines.indexOf("moveTo 200.00 200.00");
  assert.ok(m > 1);
  assert.equal(lines[m - 1], "beginPath");
  assert.equal(lines[m - 2], "setTransform 1.00 0.00 0.00 1.00 0.00 0.00");
  assert.equal(lines[m + 1], "lineTo 1000.00 600.00");
  assert.equal(lines[m + 2], "stroke");
  // the second line is not alive at 0 (starts at 100) and appears at 200
  assert.ok(
    !lines.includes("moveTo 200.00 200.00") ||
      lines.filter((l) => l.startsWith("moveTo")).length === 1,
  );
  const l200 = draw("handmade", "lines", 200);
  assert.equal(l200.filter((l) => l.startsWith("moveTo")).length, 2);
  // not drawn after an end disappears: at 1000 shape b is gone, so the first line is too
  assert.equal(draw("handmade", "lines", 1000).filter((l) => l.startsWith("moveTo")).length, 0);
});

test("rotation and scale reach the shape transform", () => {
  const lines = draw("handmade", "rotation-scale", 1000);
  // circle at (100, 0) in a group at (400, 300) scale 2 rotated 90: world (400, 500), matrix (0, 2, -2, 0)
  assert.ok(lines.includes("setTransform 0.00 2.00 -2.00 0.00 400.00 500.00"));
});

test("nested groups: opacity product, glow on members only while on", () => {
  const on = draw("handmade", "nested-groups", 700);
  assert.ok(on.includes("shadowBlur = 24.00"));
  assert.ok(on.includes("shadowColor = #f4a340"));
  assert.ok(on.includes("globalAlpha = 0.25"));
  assert.equal(on[on.length - 3], "shadowBlur = 0.00");
  assert.equal(on[on.length - 2], "shadowColor = rgba(0, 0, 0, 0)");
  const off = draw("handmade", "nested-groups", 500);
  assert.ok(!off.includes("shadowBlur = 24.00"));
});

test("glow: blur is in device pixels, color falls back fill, stroke, Ink; reset between shapes", () => {
  const key = { at: 0, x: 100, y: 100, opacity: 1, effect: "glow" };
  const c = inline([
    {
      id: "a",
      kind: "circle",
      props: { r: 5 },
      keys: [{ ...key, fill: "Good", stroke: "Accent" }],
    },
    { id: "b", kind: "circle", props: { r: 5 }, keys: [{ ...key, stroke: "Accent" }] },
    {
      id: "c",
      kind: "circle",
      props: { r: 5 },
      keys: [{ ...key, x: 300, effect: "none", fill: "Good" }],
    },
    { id: "d", kind: "label", props: {}, keys: [{ ...key, text: "hi", fill: "Critical" }] },
  ]);
  const ctx = new RecordingContext();
  renderToContext(ctx, c, 10, { width: 800, height: 500, pixelRatio: 2 });
  const l = ctx.lines;
  assert.ok(l.includes("shadowBlur = 24.00")); // 24 * 0.5 * 2
  const colors = l.filter((x) => x.startsWith("shadowColor = ")).slice(1);
  assert.deepEqual(colors, [
    "shadowColor = #5cc8b8",
    "shadowColor = #f4a340",
    "shadowColor = rgba(0, 0, 0, 0)",
    "shadowColor = #e86f5a",
    "shadowColor = rgba(0, 0, 0, 0)",
  ]);
  const view2 = new RecordingContext();
  renderToContext(view2, c, 10, { width: 400, height: 250, pixelRatio: 3 });
  assert.ok(view2.lines.includes("shadowBlur = 18.00")); // 24 * 0.25 * 3
});

test("opacity below 1/512 is skipped, at 1/512 drawn", () => {
  const mk = (op: number) =>
    inline([
      {
        id: "a",
        kind: "circle",
        props: { r: 5 },
        keys: [{ at: 0, x: 1, y: 1, opacity: op, fill: "Ink" }],
      },
    ]);
  const count = (op: number) => {
    const ctx = new RecordingContext();
    renderToContext(ctx, mk(op), 0, V);
    return ctx.lines.filter((l) => l.startsWith("arc ")).length;
  };
  assert.equal(count(1 / 512 - 1e-6), 0);
  assert.equal(count(1 / 512), 1);
  assert.equal(count(0), 0);
});

test("every scene renders balanced, without NaN or Infinity, at many times", () => {
  for (const [g, f] of allScenes()) {
    const { scene } = loadFile(g, f);
    const c = compileScene(scene);
    for (let i = 0; i <= 12; i++) {
      const ctx = new RecordingContext();
      renderToContext(ctx, c, (scene.duration * i) / 12, V);
      const text = ctx.text();
      assert.ok(!/NaN|Infinity/.test(text), `${g}/${f} at ${i}`);
      assert.equal(ctx.lines.filter((l) => l === "save").length, 1);
      assert.equal(ctx.lines.filter((l) => l === "restore").length, 1);
    }
  }
});

test("rendering the same time twice gives the same display list", () => {
  const { c } = compiled("examples", "raft");
  const a = new RecordingContext();
  const b = new RecordingContext();
  renderToContext(a, c, 3000, V);
  renderToContext(b, c, 100, V);
  const b2 = new RecordingContext();
  renderToContext(b2, c, 3000, V);
  assert.equal(a.text(), b2.text());
  assert.notEqual(a.text(), b.text());
});

test("null context accepts a frame", () => {
  const ctx = new NullContext();
  renderToContext(ctx, compiled("examples", "raft").c, 5000, V);
  assert.ok(ctx.calls > 100);
});
