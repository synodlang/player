import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { generateHitGoldens, HITS_DIR } from "../../scripts/update-goldens.ts";
import { hitTestScene, nodeBoundsScene } from "../../src/eval/hit.ts";
import { compileScene } from "../../src/scene/compile.ts";
import { BRAND_THEME, loadScene } from "../../src/scene/load.ts";
import type { View } from "../../src/types.ts";

const V: View = { width: 1600, height: 1000, pixelRatio: 1 };

function build(shapes: object[], duration = 1000) {
  const { scene, warnings } = loadScene({
    format: "synod-scene/1",
    duration,
    canvas: { w: 1600, h: 1000 },
    theme: { ...BRAND_THEME },
    shapes,
    markers: [],
    trace: [],
  });
  assert.deepEqual(warnings, []);
  return compileScene(scene);
}
const circle = (id: string, extra: object = {}, key: object = {}, r = 50) => ({
  id,
  kind: "circle",
  props: { r },
  keys: [{ at: 0, x: 800, y: 500, fill: "Ink", ...key }],
  ...extra,
});
const rect = (id: string, extra: object = {}, key: object = {}) => ({
  id,
  kind: "rect",
  props: { w: 200, h: 100, radius: 0 },
  keys: [{ at: 0, x: 800, y: 500, fill: "Ink", ...key }],
  ...extra,
});
const group = (id: string, items: string[], extra: object = {}, key: object = {}) => ({
  id,
  kind: "group",
  props: { items },
  keys: [{ at: 0, x: 0, y: 0, ...key }],
  ...extra,
});

test("a filled circle hits inside and within the 4 px slop", () => {
  const c = build([circle("a", { node: "n" })]);
  assert.deepEqual(hitTestScene(c, 0, V, 800, 500), {
    id: "a",
    kind: "circle",
    node: "n",
    msg: null,
  });
  assert.ok(hitTestScene(c, 0, V, 853.9, 500));
  assert.equal(hitTestScene(c, 0, V, 854.1, 500), null);
  assert.equal(hitTestScene(c, 0, V, 800, 560), null);
});

test("slop is in CSS pixels, so it shrinks in scene units when the view grows", () => {
  const c = build([circle("a", { node: "n" })]);
  const big: View = { width: 3200, height: 2000 }; // scale 2
  assert.ok(hitTestScene(c, 0, big, 1600 + 103.9, 1000));
  assert.equal(hitTestScene(c, 0, big, 1600 + 104.1, 1000), null);
});

test("a filled rect hits inside, in the slop, and respects rounded corners", () => {
  const c = build([rect("r", { node: "n", props: { w: 200, h: 100, radius: 50 } })]);
  assert.ok(hitTestScene(c, 0, V, 800, 500));
  assert.ok(hitTestScene(c, 0, V, 903.9, 500));
  assert.equal(hitTestScene(c, 0, V, 904.1, 500), null);
  // the corner (900, 550) is outside the rounded outline by about 20.7 units
  assert.equal(hitTestScene(c, 0, V, 899, 549), null);
  const sq = build([rect("r", { node: "n" })]);
  assert.ok(hitTestScene(sq, 0, V, 899, 549));
});

test("an unfilled stroked shape hits near its outline only", () => {
  const c = build([circle("a", { node: "n" }, { fill: "", stroke: "Good" })]);
  assert.equal(hitTestScene(c, 0, V, 800, 500), null);
  assert.ok(hitTestScene(c, 0, V, 850, 500));
  assert.ok(hitTestScene(c, 0, V, 854.9, 500)); // 1 + 4 units
  assert.equal(hitTestScene(c, 0, V, 855.1, 500), null);
  assert.ok(hitTestScene(c, 0, V, 745.1, 500));
  assert.equal(hitTestScene(c, 0, V, 744.9, 500), null);
  const r = build([rect("r", { node: "n" }, { fill: "", stroke: "Good" })]);
  assert.equal(hitTestScene(r, 0, V, 800, 500), null);
  assert.ok(hitTestScene(r, 0, V, 800, 450));
  assert.equal(hitTestScene(r, 0, V, 800, 444), null);
});

test("a shape with neither fill nor stroke, labels, lines and unattached shapes never hit", () => {
  const c = build([
    circle("none", { node: "n" }, { fill: "" }),
    { id: "t", kind: "label", node: "n", props: {}, keys: [{ at: 0, x: 800, y: 500, text: "hi" }] },
    circle("plain"),
  ]);
  assert.equal(hitTestScene(c, 0, V, 800, 500), null);
  const l = build([
    circle("p", {}, { x: 100, y: 100 }, 10),
    circle("q", {}, { x: 500, y: 100 }, 10),
    {
      id: "w",
      kind: "line",
      node: "n",
      msg: 1,
      props: { from: "p", to: "q" },
      keys: [{ at: 0, stroke: "Line" }],
    },
  ]);
  assert.equal(hitTestScene(l, 0, V, 300, 100), null);
});

test("world opacity below 0.05 never hits, 0.05 does", () => {
  const c = build([
    group("g", ["a"], {}, { opacity: 0.04 }),
    circle("a", { node: "n" }),
    group("h", ["b"], {}, { opacity: 0.05 }),
    circle("b", { node: "m" }, { x: 100, y: 100 }),
  ]);
  assert.equal(hitTestScene(c, 0, V, 800, 500), null);
  assert.equal(hitTestScene(c, 0, V, 100, 100)?.id, "b");
});

test("a shape is hit only while it lives", () => {
  const c = build([
    circle("a", { node: "n", end: 500 }, {}),
    circle("b", { node: "m" }, { x: 100, y: 100 }),
  ]);
  assert.ok(hitTestScene(c, 499, V, 800, 500));
  assert.equal(hitTestScene(c, 500, V, 800, 500), null);
  const late = build([circle("a", { node: "n" }, { at: 300 })]);
  assert.equal(hitTestScene(late, 100, V, 800, 500), null);
  assert.ok(hitTestScene(late, 300, V, 800, 500));
});

test("the topmost hit wins, in file order", () => {
  const c = build([circle("under", { node: "u" }), circle("over", { node: "o" }, {}, 20)]);
  assert.equal(hitTestScene(c, 0, V, 800, 500)?.id, "over");
  assert.equal(hitTestScene(c, 0, V, 840, 500)?.id, "under");
  // an unattached shape on top does not shadow the one below
  const d = build([circle("under", { node: "u" }), circle("plain", {}, {}, 20)]);
  assert.equal(hitTestScene(d, 0, V, 800, 500)?.id, "under");
});

test("node and msg resolve separately along the group chain", () => {
  const c = build([
    group("outer", ["inner"], { node: "n1", msg: 7 }),
    group("inner", ["a", "b", "c"], { node: "n2" }),
    circle("a", {}, { x: 100, y: 100 }),
    circle("b", { msg: 9 }, { x: 300, y: 100 }),
    circle("c", { node: "n3" }, { x: 500, y: 100 }),
  ]);
  assert.deepEqual(hitTestScene(c, 0, V, 100, 100), {
    id: "a",
    kind: "circle",
    node: "n2",
    msg: 7,
  });
  assert.deepEqual(hitTestScene(c, 0, V, 300, 100), {
    id: "b",
    kind: "circle",
    node: "n2",
    msg: 9,
  });
  assert.deepEqual(hitTestScene(c, 0, V, 500, 100), {
    id: "c",
    kind: "circle",
    node: "n3",
    msg: 7,
  });
});

test("rotated and scaled nested groups map through the inverse world transform", () => {
  // g1 at (400,400) rotated 90deg and scaled 2; g2 inside at (100, 0); circle r 20 at (0,0)
  // world centre = (400, 400) + R90 * 2 * (100, 0) = (400, 600); world radius 40
  const c = build([
    group("g1", ["g2"], {}, { x: 400, y: 400, rotation: 90, scale: 2 }),
    group("g2", ["a"], { node: "n" }, { x: 100, y: 0 }),
    circle("a", {}, { x: 0, y: 0 }, 20),
  ]);
  assert.ok(hitTestScene(c, 0, V, 400, 600));
  assert.ok(hitTestScene(c, 0, V, 400, 643.9));
  assert.equal(hitTestScene(c, 0, V, 400, 644.1), null);
  assert.equal(hitTestScene(c, 0, V, 500, 600), null);
  // a rect rotated 90 degrees swaps its extents: 200x100 becomes 100 wide, 200 tall
  const r = build([rect("r", { node: "n" }, { rotation: 90 })]);
  assert.ok(hitTestScene(r, 0, V, 800, 590));
  assert.equal(hitTestScene(r, 0, V, 800, 610.1), null);
});

test("the letterbox view maps CSS pixels back to scene space", () => {
  const c = build([circle("a", { node: "n" }, { x: 0, y: 0 }, 50)]);
  const v: View = { width: 1000, height: 1000 }; // scale 0.625, oy 187.5
  assert.ok(hitTestScene(c, 0, v, 0.625 * 0 + 0, 187.5));
  assert.ok(hitTestScene(c, 0, v, 31, 187.5)); // 50 units = 31.25 px, +4 slop
  assert.equal(hitTestScene(c, 0, v, 36, 187.5), null);
  assert.equal(hitTestScene(c, 0, v, 0, 100), null); // in the letterbox bar
  assert.equal(hitTestScene(c, 0, { width: 0, height: 0 }, 0, 0), null);
});

test("older scenes without node or msg load and never hit", () => {
  const c = build([circle("a"), rect("b")]);
  assert.equal(hitTestScene(c, 0, V, 800, 500), null);
  assert.deepEqual(nodeBoundsScene(c, 0, V), []);
});

test("nodeBounds is the union box of a node's drawn circles and rects, in CSS px", () => {
  const c = build([
    circle("a", { node: "n" }, { x: 100, y: 100 }, 10),
    circle("b", {}, { x: 500, y: 300 }, 10),
    group("g", ["b", "t"], { node: "m" }),
    rect("r", { node: "n" }, { x: 300, y: 200 }),
    { id: "t", kind: "label", props: {}, keys: [{ at: 0, x: 0, y: 900, text: "x" }] },
  ]);
  assert.deepEqual(nodeBoundsScene(c, 0, V), [
    { node: "n", x: 90, y: 90, w: 310, h: 160 },
    { node: "m", x: 490, y: 290, w: 20, h: 20 },
  ]);
  const half: View = { width: 800, height: 500 };
  assert.deepEqual(nodeBoundsScene(c, 0, half)[1], { node: "m", x: 245, y: 145, w: 10, h: 10 });
  // a hidden shape is left out
  const gone = build([circle("a", { node: "n", end: 10 })]);
  assert.deepEqual(nodeBoundsScene(gone, 10, V), []);
});

test("nodeBounds of a rotated rect is its axis-aligned box", () => {
  const c = build([rect("r", { node: "n" }, { rotation: 90 })]);
  assert.deepEqual(nodeBoundsScene(c, 0, V), [{ node: "n", x: 750, y: 400, w: 100, h: 200 }]);
});

test("hit goldens match test/golden/hits", () => {
  for (const g of generateHitGoldens()) {
    assert.equal(readFileSync(join(HITS_DIR, g.file), "utf8"), g.content, g.file);
  }
});
