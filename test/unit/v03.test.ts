// Synod 0.3 reader rules: loading, easing, effects, curve, trail, draw, sketch noise,
// counter, icon morph, camera, hit testing, fonts.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { evaluate } from "../../src/eval/evaluate.ts";
import { createFrameState } from "../../src/eval/frame-state.ts";
import { hitTestScene, nodeBoundsScene } from "../../src/eval/hit.ts";
import { smootherstep, spring } from "../../src/math/ease.ts";
import { fnv1a32, lattice, mulberry32 } from "../../src/math/hash.ts";
import { createPlayerWithEnv, type PlayerEnv } from "../../src/player/player.ts";
import { cameraAt } from "../../src/render/camera.ts";
import { renderToContext } from "../../src/render/draw.ts";
import { ICON_NAMES, ICONS, iconIndex } from "../../src/render/icons.ts";
import { sketchCircle, sketchSegment } from "../../src/render/sketch.ts";
import { compileScene } from "../../src/scene/compile.ts";
import { DEFAULT_STYLE, loadScene } from "../../src/scene/load.ts";
import type { View } from "../../src/types.ts";
import { NullContext } from "../helpers/null-context.ts";
import { RecordingContext } from "../helpers/recording-context.ts";
import { compiled, loadFile } from "../helpers/scenes.ts";

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

function build(shapes: object[], extra: object = {}, duration = 2000) {
  const { scene, warnings } = loadScene({
    format: "synod-scene/1",
    duration,
    canvas: { w: 1600, h: 1000 },
    theme: THEME,
    shapes,
    markers: [],
    trace: [],
    ...extra,
  });
  return { scene, warnings, c: compileScene(scene) };
}
const circle = (id: string, keys: object[], r = 50, extra: object = {}) => ({
  id,
  kind: "circle",
  props: { r },
  keys,
  ...extra,
});
const first = (more: object = {}) => ({ at: 0, x: 800, y: 500, opacity: 1, fill: "Ink", ...more });

function frame(c: ReturnType<typeof build>["c"], at: number) {
  const fs = createFrameState(c);
  evaluate(c, at, fs);
  return fs;
}
function lines(c: ReturnType<typeof build>["c"], at: number, view: View = V): string[] {
  const ctx = new RecordingContext();
  renderToContext(ctx, c, at, view);
  return ctx.lines;
}

test("an old scene has the default style, no camera, and loads without warnings", () => {
  const { scene, warnings } = loadFile("handmade", "old-format-0.2.json");
  assert.deepEqual(scene.style, DEFAULT_STYLE);
  assert.deepEqual(scene.camera, []);
  // the unknown kind "hexagon" is the only warning
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] as string, /unknown kind/);
});

test("style, camera and the new key properties load; bad values warn and take the default", () => {
  const { scene, warnings } = build(
    [
      circle("a", [
        first({
          curve: 0.3,
          trail: 200,
          dash: [4, 2],
          draw: 0.5,
          halo: 1,
          role: "title",
          face: "mono",
        }),
        { at: 10, dash: [] },
        { at: 20, dash: [1] },
      ]),
    ],
    {
      style: { sans: "Shantell Sans", sketch: 0.5, easing: "bouncy", glow: "big", unknown: 1 },
      camera: [
        { at: 5, x: 1, y: 2, zoom: 2 },
        { at: 1, x: 0, y: 0, zoom: 1 },
        { at: 9, x: 0, y: 0, zoom: 0 },
      ],
    },
  );
  assert.equal(scene.style.sans, "Shantell Sans");
  assert.equal(scene.style.sketch, 0.5);
  assert.equal(scene.style.easing, "smooth");
  assert.equal(scene.style.glow, 24);
  assert.deepEqual(
    scene.camera.map((k) => k.at),
    [1, 5],
  );
  const keys = scene.shapes[0]?.keys ?? [];
  assert.deepEqual(keys[0]?.dash, [4, 2]);
  assert.deepEqual(keys[1]?.dash, []);
  assert.equal(keys[2]?.dash, undefined);
  assert.equal(keys[0]?.role, "title");
  assert.ok(warnings.some((w) => w.includes("style.easing")));
  assert.ok(warnings.some((w) => w.includes("style.glow")));
  assert.ok(warnings.some((w) => w.includes("camera key")));
  assert.ok(warnings.some((w) => w.includes("dash must be")));
});

test("icons and counters are kinds; an unknown kind is still skipped", () => {
  const { scene } = build([
    { id: "i", kind: "icon", props: { size: 32 }, keys: [{ at: 0, x: 1, y: 2, icon: "server" }] },
    { id: "k", kind: "counter", props: {}, keys: [{ at: 0, x: 1, y: 2, count: 3 }] },
    { id: "z", kind: "wormhole", props: {}, keys: [{ at: 0 }] },
  ]);
  assert.deepEqual(
    scene.shapes.map((s) => s.kind),
    ["icon", "counter"],
  );
});

test("spring easing is the back-out polynomial; smootherstep is unchanged", () => {
  assert.ok(Math.abs(spring(0)) < 1e-12);
  assert.equal(spring(1), 1);
  assert.ok(spring(0.8) > 1, "overshoots");
  const c = 1.70158;
  const u = 0.37;
  assert.ok(Math.abs(spring(u) - (1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2)) < 1e-12);
  const shapes = [circle("a", [first({ x: 0, opacity: 0 }), { at: 1000, x: 100, opacity: 1 }])];
  const sm = frame(build(shapes).c, 400);
  const sp = frame(build(shapes, { style: { easing: "spring" } }).c, 400);
  assert.ok(Math.abs((sm.e[0] as number) - 100 * smootherstep(0.4)) < 1e-9);
  assert.ok(Math.abs((sp.e[0] as number) - 100 * spring(0.4)) < 1e-9);
  // opacity never uses the spring curve
  assert.ok(Math.abs((sp.opacity[0] as number) - smootherstep(0.4)) < 1e-9);
  assert.ok(
    (frame(build(shapes, { style: { easing: "spring" } }).c, 800).e[0] as number) > 100 * 0.95,
  );
});

test("curve: a quadratic Bezier with its control point on the left normal, eased by F(u)", () => {
  const shapes = [
    circle("a", [first({ x: 100, y: 500, curve: 0.5 }), { at: 1000, x: 500, y: 500 }]),
    circle("b", [first({ x: 100, y: 500, curve: 0 }), { at: 1000, x: 500, y: 500 }]),
    // x and y keys differ in time: straight
    circle("c", [
      first({ x: 100, y: 500, curve: 0.5 }),
      { at: 1000, x: 500 },
      { at: 1500, y: 700 },
    ]),
  ];
  const fs = frame(build(shapes).c, 500);
  const f = smootherstep(0.5);
  // A = (100, 500), B = (500, 500), left normal (dy, -dx) = (0, -400): control (300, 300)
  const g = 1 - f;
  assert.ok(Math.abs((fs.e[0] as number) - (g * g * 100 + 2 * g * f * 300 + f * f * 500)) < 1e-9);
  assert.ok(Math.abs((fs.f[0] as number) - (g * g * 500 + 2 * g * f * 300 + f * f * 500)) < 1e-9);
  assert.ok((fs.f[0] as number) < 500, "bends toward -y");
  assert.equal(fs.f[1], 500);
  // the y keys of c are not at the times of its x keys, so the move is straight
  assert.ok(Math.abs((fs.f[2] as number) - (500 + 200 * smootherstep(500 / 1500))) < 1e-9);
  assert.equal(fs.e[2], 100 + 400 * smootherstep(0.5));
  const keysAt = frame(build(shapes).c, 1000);
  assert.equal(keysAt.e[0], 500);
});

test("draw, halo and count are smootherstep numbers with defaults; a group's draw limits its members", () => {
  const shapes = [
    circle("a", [first({ draw: 0, halo: 0, count: 0 }), { at: 1000, draw: 1, halo: 1 }]),
    circle("b", [first()]),
    {
      id: "g",
      kind: "group",
      props: { items: ["m"] },
      keys: [{ at: 0, x: 0, y: 0, draw: 0.25, halo: 0.5 }],
    },
    circle("m", [first()]),
  ];
  const fs = frame(build(shapes).c, 500);
  assert.ok(Math.abs((fs.draw[0] as number) - 0.5) < 1e-12);
  assert.ok(Math.abs((fs.halo[0] as number) - 0.5) < 1e-12);
  assert.equal(fs.draw[1], 1);
  assert.equal(fs.halo[1], 0);
  assert.equal(fs.draw[3], 0.25);
  assert.equal(fs.halo[3], 0.5);
});

test("hash: FNV-1a-32 and mulberry32 are the fixed functions", () => {
  assert.equal(fnv1a32(""), 0x811c9dc5);
  assert.equal(fnv1a32("a"), 0xe40c292c);
  assert.equal(fnv1a32("foobar"), 0xbf9cf968);
  // mulberry32 reference: state 0 first output (a = 0x6D2B79F5 mixed)
  const a = 0x6d2b79f5 | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  assert.equal(mulberry32(0), ((t ^ (t >>> 14)) >>> 0) / 4294967296);
  assert.ok(lattice(7, 3) >= -1 && lattice(7, 3) < 1);
  assert.equal(lattice(7, 3), lattice(7, 3));
});

test("sketch wobbles every 12 units, stable per seed, differs per pass, open ends overshoot", () => {
  const sk = sketchCircle(60, fnv1a32("s0123456789ab"), 1);
  assert.equal(sk.n, Math.ceil((2 * Math.PI * 60) / 12));
  assert.equal(sk.closed, true);
  assert.notEqual(Array.from(sk.p1).join(), Array.from(sk.p2).join());
  const again = sketchCircle(60, fnv1a32("s0123456789ab"), 1);
  assert.deepEqual(Array.from(sk.p1), Array.from(again.p1));
  const flat = sketchCircle(60, fnv1a32("s0123456789ab"), 0);
  for (let i = 0; i < sk.n; i++) {
    const d = Math.hypot(
      (sk.p1[2 * i] as number) - (flat.p1[2 * i] as number),
      (sk.p1[2 * i + 1] as number) - (flat.p1[2 * i + 1] as number),
    );
    assert.ok(d <= 1.6 + 1e-9, "at most s * 1.6");
  }
  const seg = sketchSegment(100, 4, 5, 1);
  assert.equal(seg.closed, false);
  assert.ok(Math.abs((seg.p1[0] as number) - -4) < 1.6 + 1e-9);
  assert.ok(Math.abs((seg.p1[2 * (seg.n - 1)] as number) - 104) < 1.6 + 1e-9);
  assert.equal(seg.n, Math.max(4, Math.ceil(108 / 12)));
});

test("sketch 0 draws the exact old path; sketch above 0 draws two polygon passes at alpha 0.6", () => {
  const shapes = [circle("a", [first({ stroke: "Accent" })], 40)];
  const plain = lines(build(shapes).c, 0);
  assert.ok(plain.includes("arc 0.00 0.00 40.00 0.00 6.28"));
  const rough = lines(build(shapes, { style: { sketch: 1 } }).c, 0);
  assert.ok(!rough.some((l) => l.startsWith("arc ")));
  assert.equal(rough.filter((l) => l === "stroke").length, 2);
  assert.ok(rough.includes("globalAlpha = 0.60"));
  assert.ok(rough.includes("closePath"));
});

test("trail: 8 ghosts oldest first, at 0.5 op (1 - j/9), none before the first key", () => {
  const shapes = [circle("a", [first({ trail: 800, x: 100 }), { at: 1000, x: 900 }], 10)];
  const c = build(shapes).c;
  const l = lines(c, 1000);
  const alphas = l.filter((x) => x.startsWith("globalAlpha =")).map((x) => x.slice(14));
  // the ghosts (j = 8 .. 1) then the shape itself
  const want = [8, 7, 6, 5, 4, 3, 2, 1].map((j) => (0.5 * (1 - j / 9)).toFixed(2));
  assert.deepEqual(alphas.slice(1, 9), want);
  assert.equal(l.filter((x) => x === "fill").length, 9);
  // at 200 ms the oldest ghosts are before the first key: skipped
  const early = lines(c, 200).filter((x) => x === "fill").length;
  assert.equal(early, 3);
});

test("effects: indicate swells and mixes toward Warning; the others add strokes", () => {
  const eff = (name: string) => [
    {
      id: "r",
      kind: "rect",
      props: { w: 100, h: 60, radius: 8 },
      keys: [first({ fill: "Ink" }), { at: 100, effect: name }, { at: 1100, effect: "none" }],
    },
  ];
  const ind = frame(build(eff("indicate")).c, 600);
  assert.ok(Math.abs((ind.a[0] as number) - 1.2) < 1e-12, "b = 1 at p = 0.5");
  assert.equal(ind.fill[0] as number, 0xe8c35a);
  const base = lines(build(eff("none")).c, 600).filter((x) => x === "stroke").length;
  const strokes = (name: string, at = 400) =>
    lines(build(eff(name)).c, at).filter((x) => x === "stroke").length;
  assert.equal(strokes("flash"), base + 1);
  assert.equal(strokes("ripple"), base + 1);
  assert.equal(strokes("circumscribe"), base + 1);
  assert.equal(strokes("sweep"), base + 1);
  const flash = lines(build(eff("flash")).c, 400);
  // R0 = half diagonal + 6, rays 24 long: the ray at angle 0 starts at x = 800 + hypot(50, 30) + 6
  const r0 = Math.hypot(50, 30) + 6;
  assert.ok(flash.includes(`moveTo ${(800 + r0).toFixed(2)} 500.00`));
  assert.ok(flash.includes(`lineTo ${(800 + r0 + 24).toFixed(2)} 500.00`));
  // ripple at p = 0.3: radius r0 + 60 p with r0 = 50
  const rip = lines(build(eff("ripple")).c, 400);
  assert.ok(rip.includes(`arc 800.00 500.00 ${(50 + 60 * 0.3).toFixed(2)} -1.57 4.71`));
  // an unknown effect draws as none
  assert.equal(strokes("sparkle"), base);
});

test("counter rolls with the fractional part; digits are columns of 0.6 size", () => {
  const k = (count: number) => [{ id: "k", kind: "counter", props: {}, keys: [first({ count })] }];
  const whole = lines(build(k(42)).c, 0).filter((l) => l.startsWith("fillText"));
  // the units column is drawn first
  assert.deepEqual(whole, ['fillText "2" 4.80 0.00', 'fillText "4" -4.80 0.00']);
  assert.equal(
    lines(build(k(49)).c, 0).filter((l) => l === "clip").length,
    1 /* the paper clip only */,
  );
  const rolling = lines(build(k(9.5)).c, 0);
  // 9.5: column 1 rolls 0 -> 1 (q = 0.95), column 0 rolls 9 -> 0 (q = 9.5); both clipped
  assert.equal(rolling.filter((l) => l === "clip").length, 3);
  assert.ok(rolling.filter((l) => l.startsWith("fillText")).length >= 4);
  const neg = lines(build(k(-5)).c, 0).filter((l) => l.startsWith("fillText"));
  assert.equal(neg.length, 2);
  assert.ok(neg.some((l) => l.includes("−")));
});

test("icons: the set is the 16 icons; a morph is pointwise and unknown names draw nothing", () => {
  assert.equal(ICON_NAMES.length, 16);
  assert.equal(iconIndex("server"), 0);
  assert.equal(iconIndex("nope"), -1);
  for (const icon of ICONS) {
    assert.ok(icon.length >= 1 && icon.length <= 4);
    for (const c of icon) assert.equal(c.length, 64);
  }
  const shapes = (name: string) => [
    {
      id: "i",
      kind: "icon",
      props: { size: 100 },
      keys: [first({ icon: "check", stroke: "Ink" }), { at: 1000, icon: name }],
    },
  ];
  const fs = frame(build(shapes("cross")).c, 500);
  assert.equal(fs.iconA[0], iconIndex("check"));
  assert.equal(fs.iconB[0], iconIndex("cross"));
  assert.ok(Math.abs((fs.iconT[0] as number) - 0.5) < 1e-12);
  const unknown = lines(
    build([
      {
        id: "i",
        kind: "icon",
        props: { size: 100 },
        keys: [first({ icon: "nope", stroke: "Ink" })],
      },
    ]).c,
    0,
  );
  assert.ok(!unknown.includes("stroke"));
  const drawn = lines(build(shapes("cross")).c, 500);
  assert.equal(drawn.filter((l) => l === "stroke").length, 1);
  assert.ok(drawn.includes("lineJoin = round"));
  // a missing contour collapses to the center: check (1 contour) to server (4) draws 4
  const m = lines(
    build([
      {
        id: "i",
        kind: "icon",
        props: { size: 100 },
        keys: [first({ icon: "check", stroke: "Ink" }), { at: 1000, icon: "server" }],
      },
    ]).c,
    500,
  );
  assert.equal(m.filter((l) => l.startsWith("moveTo")).length, 4);
});

test("camera home and the default position are the canvas centre, not a fixed 800 by 500", () => {
  const v = { zoom: 1, tx: 0, ty: 0 };
  // a 1040 by 650 canvas: home (520, 325); a key at home is the identity, a key at 800, 500 is not
  const cam = {
    at: new Float64Array([0]),
    x: new Float64Array([520]),
    y: new Float64Array([325]),
    zoom: new Float64Array([1]),
  };
  cameraAt(null, false, 0, 50, v, 520, 325);
  assert.deepEqual(v, { zoom: 1, tx: 0, ty: 0 });
  cameraAt(cam, false, 0, 50, v, 520, 325);
  assert.deepEqual(v, { zoom: 1, tx: 0, ty: 0 });
  const shape = {
    id: "a",
    kind: "circle",
    props: { r: 10 },
    keys: [{ at: 1000, opacity: 1, fill: "Ink" }],
  };
  const small = build([shape], {
    canvas: { w: 1040, h: 650 },
    camera: [{ at: 0, x: 520, y: 325, zoom: 1 }],
  }).c;
  const fs = frame(small, 1000);
  assert.deepEqual(fs.cam, { zoom: 1, tx: 0, ty: 0 });
  assert.equal(fs.e[0], 520);
  assert.equal(fs.f[0], 325);
  const zoomed = build([shape], {
    canvas: { w: 1040, h: 650 },
    camera: [{ at: 0, x: 520, y: 325, zoom: 2 }],
  }).c;
  assert.deepEqual(frame(zoomed, 1000).cam, { zoom: 2, tx: -520, ty: -325 });
});

test("camera: eased keys, drift, identity by default, letterbox then camera", () => {
  const cam = {
    at: new Float64Array([100, 1100]),
    x: new Float64Array([800, 400]),
    y: new Float64Array([500, 300]),
    zoom: new Float64Array([1, 2]),
  };
  const v = { zoom: 1, tx: 0, ty: 0 };
  cameraAt(null, false, 0, 50, v, 800, 500);
  assert.deepEqual(v, { zoom: 1, tx: 0, ty: 0 });
  cameraAt(cam, false, 0, 50, v, 800, 500);
  assert.deepEqual(v, { zoom: 1, tx: 0, ty: 0 });
  cameraAt(cam, false, 0, 600, v, 800, 500); // u = 0.5
  assert.ok(Math.abs(v.zoom - 1.5) < 1e-12);
  assert.ok(Math.abs(v.tx - (800 - 1.5 * 600)) < 1e-9);
  cameraAt(cam, false, 0, 5000, v, 800, 500);
  assert.deepEqual(v, { zoom: 2, tx: 800 - 2 * 400, ty: 500 - 2 * 300 });
  // drift: cx' = cx + D sin(2 pi t / 19000), cy' = cy + 0.6 D sin(2 pi t / 23000)
  cameraAt(null, false, 10, 4750, v, 800, 500);
  assert.ok(Math.abs(v.tx - (800 - (800 + 10))) < 1e-9);
  assert.ok(Math.abs(v.ty - (500 - (500 + 6 * Math.sin((2 * Math.PI * 4750) / 23000)))) < 1e-9);
  // the spring curve applies to the camera
  cameraAt(cam, true, 0, 600, v, 800, 500);
  assert.ok(Math.abs(v.zoom - (1 + spring(0.5))) < 1e-12);
});

test("a camera moves the drawing; a scene without one draws exactly as before", () => {
  const shapes = [circle("a", [first({ x: 1000, y: 500, stroke: "Accent" })], 20)];
  const plain = build(shapes).c;
  const zoomed = build(shapes, { camera: [{ at: 0, x: 1000, y: 500, zoom: 2 }] }).c;
  assert.ok(lines(plain, 0).includes("setTransform 1.00 0.00 0.00 1.00 1000.00 500.00"));
  // the camera looks at (1000, 500) at zoom 2: the circle lands on the canvas center, doubled
  assert.ok(lines(zoomed, 0).includes("setTransform 2.00 0.00 0.00 2.00 800.00 500.00"));
});

test("hit testing inverts letterbox, camera and drift", () => {
  const shapes = [circle("a", [first({ x: 1000, y: 500 })], 40, { node: "n1" })];
  const c = build(shapes, { camera: [{ at: 0, x: 1000, y: 500, zoom: 2 }] }).c;
  const view: View = { width: 800, height: 500, pixelRatio: 1 }; // letterbox scale 0.5
  // the circle is at the canvas center (800, 500) = CSS (400, 250), radius 80 canvas = 40 css
  assert.equal(hitTestScene(c, 0, view, 400, 250)?.node, "n1");
  assert.equal(hitTestScene(c, 0, view, 400 + 43, 250)?.node, "n1", "within the 4 px slop");
  assert.equal(hitTestScene(c, 0, view, 400 + 46, 250), null);
  // without the camera the circle sits at CSS (500, 250)
  assert.equal(hitTestScene(build(shapes).c, 0, view, 400, 250), null);
  const box = nodeBoundsScene(c, 0, view)[0];
  assert.ok(box && Math.abs(box.x - 360) < 1e-9 && Math.abs(box.w - 80) < 1e-9);
  // drift moves the hit area with the drawing: at 4750 ms the camera is D = 24 to the right
  const d = build(shapes, { style: { drift: 24 } }, 30000).c;
  assert.equal(hitTestScene(d, 4750, view, (1000 - 24) / 2, 250)?.node, "n1");
  assert.equal(hitTestScene(d, 4750, view, 1000 / 2 + 22, 250), null);
});

test("icons and counters hit like filled shapes", () => {
  const shapes = [
    {
      id: "i",
      kind: "icon",
      props: { size: 64 },
      node: "n1",
      keys: [first({ x: 400, icon: "server", stroke: "Ink" })],
    },
    { id: "k", kind: "counter", props: {}, msg: 7, keys: [first({ x: 1000, count: 123 })] },
    {
      id: "l",
      kind: "icon",
      props: { size: 64 },
      keys: [first({ x: 1400, icon: "server", stroke: "Ink" })],
    },
  ];
  const c = build(shapes).c;
  assert.deepEqual(hitTestScene(c, 0, V, 400, 500), {
    id: "i",
    kind: "icon",
    node: "n1",
    msg: null,
  });
  assert.deepEqual(hitTestScene(c, 0, V, 1000 + 12, 500), {
    id: "k",
    kind: "counter",
    node: null,
    msg: 7,
  });
  assert.equal(hitTestScene(c, 0, V, 1400, 500), null, "no node or msg");
});

test("vignette is drawn last, in canvas space, as a radial gradient", () => {
  const l = lines(build([circle("a", [first()])], { style: { vignette: 0.5 } }).c, 0);
  const g = l.findIndex((x) => x.startsWith("createRadialGradient"));
  assert.ok(g > 0);
  const d = Math.hypot(1600, 1000);
  assert.equal(
    l[g],
    `createRadialGradient 800.00 500.00 0.00 800.00 500.00 ${(0.75 * d).toFixed(2)}`,
  );
  assert.equal(l[g + 3], "addColorStop 1.00 rgba(0, 0, 0, 0.5)");
  assert.ok(l.slice(g).includes("fillRect 0.00 0.00 1600.00 1000.00"));
  assert.equal(l[l.length - 1], "restore");
});

test("shadow draws under filled circles, rects and icons; glow replaces it; halo sets the blur", () => {
  const style = { shadow: 0.4, glow: 10 };
  const l = lines(build([circle("a", [first()], 30)], { style }).c, 0);
  assert.ok(l.includes("shadowBlur = 16.00"));
  assert.ok(l.includes("shadowColor = rgba(0, 0, 0, 0.4)"));
  assert.ok(l.includes("shadowOffsetY = 6.00"));
  const h = lines(build([circle("a", [first({ halo: 0.5 })], 30)], { style }).c, 0);
  assert.ok(h.includes("shadowBlur = 5.00"), "glow 10 x halo 0.5");
  assert.ok(!h.includes("shadowOffsetY = 6.00"));
});

test("role and face choose the font; tracking sets the letter spacing", () => {
  const label = (key: object) => [
    { id: "l", kind: "label", props: {}, keys: [first({ text: "t", ...key })] },
  ];
  const style = { titleSize: 40, titleWeight: 700, mono: "JetBrains Mono", tracking: 0.1 };
  const l = lines(build(label({ role: "title", face: "mono" }), { style }).c, 0);
  assert.ok(l.some((x) => x.startsWith('font = 700 40px "JetBrains Mono", ui-monospace')));
  assert.ok(l.includes("letterSpacing = 4px"));
  const d = lines(build(label({}), {}).c, 0);
  assert.ok(!d.some((x) => x.startsWith("letterSpacing")));
  // a label draws its first ceil(draw n) code points
  const part = lines(
    build([{ id: "l", kind: "label", props: {}, keys: [first({ text: "abcd", draw: 0.5 })] }]).c,
    0,
  );
  assert.ok(part.includes('fillText "ab" 0.00 0.00'));
});

test("draw: outlines to min(1, 2d), fill alpha max(0, 2d - 1), lines grow from `from`", () => {
  const r = (d: number) => [
    {
      id: "r",
      kind: "rect",
      props: { w: 100, h: 60, radius: 0 },
      keys: [first({ fill: "Ink", stroke: "Accent", draw: d })],
    },
  ];
  const none = lines(build(r(0)).c, 0);
  assert.ok(!none.includes("fill") && !none.includes("stroke"));
  const quarter = lines(build(r(0.25)).c, 0);
  assert.ok(!quarter.includes("fill"), "fill waits for d > 0.5");
  assert.equal(quarter.filter((x) => x === "stroke").length, 1);
  // draw 0.25 is half of the 320 unit outline: top half-edge, right edge, half of the bottom edge
  assert.ok(quarter.includes("moveTo 0.00 -30.00"));
  assert.ok(quarter.includes("lineTo 50.00 30.00"));
  assert.ok(quarter.includes("lineTo 0.00 30.00"));
  assert.ok(!quarter.includes("lineTo -50.00 30.00"));
  const most = lines(build(r(0.75)).c, 0);
  assert.ok(most.includes("globalAlpha = 0.50"));
  const ln = [
    circle("a", [first({ x: 100, y: 100 })], 5),
    circle("b", [first({ x: 500, y: 100 })], 5),
    {
      id: "n",
      kind: "line",
      props: { from: "a", to: "b" },
      keys: [{ at: 0, opacity: 1, stroke: "Accent", draw: 0.5 }],
    },
  ];
  assert.ok(lines(build(ln).c, 0).includes("lineTo 300.00 100.00"));
});

test("dash sets the line dash and clears it afterwards", () => {
  const shapes = [circle("a", [first({ stroke: "Accent", dash: [4, 2] })], 30)];
  const l = lines(build(shapes).c, 0);
  assert.ok(l.includes("setLineDash 4.00 2.00"));
  assert.ok(l.includes("setLineDash"));
  assert.ok(l.indexOf("setLineDash") > l.indexOf("setLineDash 4.00 2.00"));
});

test("the real 0.3 scenes of the compiler render and carry their features", () => {
  const sketch = loadFile("builder", "theme-sketch.json").scene;
  assert.equal(sketch.style.sketch, 1);
  assert.equal(sketch.style.easing, "spring");
  assert.ok(loadFile("builder", "camera.json").scene.camera.length > 0);
  for (const name of [
    "arcs",
    "camera",
    "effects",
    "icons-counter",
    "message-color",
    "reveal-halo",
    "theme-sketch",
  ]) {
    const { scene, c } = compiled("builder", name);
    for (let i = 0; i <= 10; i++) {
      const ctx = new NullContext();
      renderToContext(ctx, c, (scene.duration * i) / 10, V);
    }
  }
});

test("icons.json equals the normative copy in dsl (when dsl is checked out beside)", () => {
  const mine = readFileSync(
    join(import.meta.dirname, "..", "..", "src", "render", "icons.json"),
    "utf8",
  );
  const theirs = join(import.meta.dirname, "..", "..", "..", "dsl", "implementation", "icons.json");
  if (!existsSync(theirs)) return; // CI checks it with scripts/sync-icons.ts <dsl> --check
  assert.equal(mine, readFileSync(theirs, "utf8"));
});

// ---- fonts -------------------------------------------------------------------------

interface FontEnv {
  env: PlayerEnv;
  added: string[];
  loaded: string[];
  finish(): void;
}
function fontEnv(): FontEnv {
  const added: string[] = [];
  const loaded: string[] = [];
  const pending: (() => void)[] = [];
  const fe: FontEnv = {
    added,
    loaded,
    finish: () => {
      for (const f of pending.splice(0)) f();
    },
    env: {
      now: () => 0,
      raf: () => 1,
      caf: () => {},
      devicePixelRatio: 1,
      fonts: {
        ready: Promise.resolve(),
        addEventListener: () => {},
        removeEventListener: () => {},
        add: () => {},
        load: (font: string) => {
          loaded.push(font);
          return Promise.resolve();
        },
      },
      fontFace: class {
        family: string;
        constructor(family: string, source: string) {
          this.family = family;
          added.push(`${family} ${source}`);
        }
        load() {
          return new Promise<void>((resolve) => pending.push(resolve));
        }
      },
    },
  };
  return fe;
}

test("fontBase registers only the families the scene uses; fontsReady waits for them", async () => {
  const fe = fontEnv();
  const ctx = new NullContext();
  const canvas = { width: 800, height: 500, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const scene = {
    format: "synod-scene/1",
    duration: 100,
    canvas: { w: 800, h: 500 },
    style: { sans: "Shantell Sans" },
    shapes: [
      { id: "a", kind: "label", props: {}, keys: [{ at: 0, x: 1, y: 1, text: "x", face: "mono" }] },
      { id: "b", kind: "counter", props: {}, keys: [{ at: 0, x: 1, y: 1, count: 1 }] },
    ],
    markers: [],
    trace: [],
  };
  const p = createPlayerWithEnv(
    canvas,
    scene,
    { fontBase: "/assets/fonts/", autoResize: false },
    fe.env,
  );
  assert.deepEqual(fe.added, [
    "Shantell Sans url(/assets/fonts/ShantellSans.woff2)",
    "JetBrains Mono url(/assets/fonts/JetBrainsMono.woff2)",
  ]);
  let done = false;
  const ready = p.fontsReady().then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  fe.finish();
  await ready;
  assert.equal(done, true);
  p.destroy();
});

test("without fontBase fontsReady asks the document for the families", async () => {
  const fe = fontEnv();
  const ctx = new NullContext();
  const canvas = { width: 800, height: 500, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const scene = {
    format: "synod-scene/1",
    duration: 100,
    canvas: { w: 800, h: 500 },
    shapes: [{ id: "a", kind: "label", props: {}, keys: [{ at: 0, x: 1, y: 1, text: "x" }] }],
    markers: [],
    trace: [],
  };
  const p = createPlayerWithEnv(canvas, scene, { autoResize: false }, fe.env);
  await p.fontsReady();
  assert.deepEqual(fe.added, []);
  assert.deepEqual(fe.loaded, ['500 16px "Inter"']);
  p.destroy();
});
