import assert from "node:assert/strict";
import { test } from "node:test";
import { toHex } from "../../src/math/oklab.ts";
import {
  compileScene,
  KIND_CIRCLE,
  KIND_GROUP,
  KIND_LABEL,
  KIND_LINE,
  KIND_RECT,
  P_FILL,
  P_TEXT,
  P_X,
} from "../../src/scene/compile.ts";
import { loadScene } from "../../src/scene/load.ts";
import { allScenes, compiled, loadFile } from "../helpers/scenes.ts";

test("every scene compiles; arrays are consistent", () => {
  for (const [g, f] of allScenes()) {
    const { scene } = loadFile(g, f);
    const c = compileScene(scene);
    assert.equal(c.n, scene.shapes.length, f);
    assert.equal(c.order.length + c.lines.length, c.n, f);
    // parents before children
    const pos = new Int32Array(c.n).fill(-1);
    c.order.forEach((i, q) => {
      pos[i] = q;
    });
    for (const i of c.order) {
      const p = c.parent[i] as number;
      if (p >= 0) assert.ok((pos[p] as number) < (pos[i] as number), `${f} ${c.ids[i]}`);
    }
    for (const tr of c.tracks) {
      assert.equal(tr.start.length, c.n + 1);
      for (let i = 0; i < c.n; i++) {
        for (let k = (tr.start[i] as number) + 1; k < (tr.start[i + 1] as number); k++) {
          assert.ok((tr.times[k] as number) >= (tr.times[k - 1] as number), `${f} sorted`);
        }
      }
    }
  }
});

test("kinds, geometry and times of the markers scene", () => {
  const { scene, c } = compiled("builder", "markers");
  assert.equal(c.width, 1600);
  assert.equal(c.height, 1000);
  assert.equal(c.duration, 2930);
  assert.equal(c.kind[0], KIND_RECT);
  assert.equal(c.geomA[0], 1592);
  assert.equal(c.geomB[0], 992);
  assert.equal(c.geomR[0], 12);
  assert.equal(c.kind[2], KIND_LABEL);
  assert.equal(c.kind[3], KIND_GROUP);
  assert.equal(c.firstAt[3], 30);
  assert.equal(c.end[3], Number.POSITIVE_INFINITY);
  const circle = scene.shapes.findIndex((s) => s.kind === "circle");
  assert.equal(c.kind[circle], KIND_CIRCLE);
  assert.equal(c.geomA[circle], 6);
  assert.equal(c.end[circle], 880);
  // membership: the circle belongs to the next group
  assert.equal(c.parent[circle], circle + 2);
  assert.equal(c.parent[0], -1);
});

test("a member ends with its group and a group is reached from its earliest member", () => {
  const { scene } = loadScene({
    format: "synod-scene/1",
    duration: 1000,
    canvas: { w: 100, h: 100 },
    shapes: [
      { id: "g", kind: "group", props: { items: ["m", "l"] }, keys: [{ at: 300, x: 1 }], end: 500 },
      { id: "m", kind: "circle", props: { r: 1 }, keys: [{ at: 100, x: 1 }] },
      { id: "l", kind: "line", props: { from: "m", to: "g" }, keys: [{ at: 150, opacity: 1 }] },
    ],
    markers: [],
    trace: [],
  });
  const c = compileScene(scene);
  assert.equal(c.end[1], 500);
  assert.equal(c.end[2], 500);
  assert.equal(c.reachAt[0], 100);
  assert.equal(c.firstAt[0], 300);
  assert.deepEqual([...c.order], [0, 1]); // the group is placed before its member
  assert.deepEqual([...c.lines], [2]);
  assert.equal(c.kind[2], KIND_LINE);
  assert.equal(c.lineFrom[2], 1);
  assert.equal(c.lineTo[2], 0);
});

test("tracks hold only the keys that set the property", () => {
  const { c } = compiled("builder", "group");
  // 8 shapes; x is set by every first key plus one later key of each group
  assert.equal((c.tracks[P_X] as { times: Float64Array }).times.length, 8 + 2);
  const text = c.tracks[P_TEXT]!;
  assert.equal(text.times.length, 2); // two labels
  assert.deepEqual([...c.strings], ["", "node"]);
  assert.deepEqual([...text.ival], [1, 1]);
  const fill = c.tracks[P_FILL]!;
  assert.equal(fill.times.length, 6);
  assert.equal(toHex(fill.ival[0] as number), "#5cc8b8"); // Good
});

test("defaults: label fill is Ink, line stroke is Line, others none", () => {
  const { c } = compiled("handmade", "lines");
  assert.equal(c.defFill[0], -1);
  assert.equal(c.defStroke[0], -1);
  assert.equal(toHex(c.defStroke[3] as number), "#3a4366");
  const lab = compiled("builder", "group").c;
  assert.equal(toHex(lab.defFill[2] as number), "#ede9e1");
  assert.equal(toHex(lab.ink), "#ede9e1");
  assert.equal(toHex(lab.paper), "#151a2e");
});

test("colors: names resolve through the theme; unknown names and bad hex are Ink; empty is none", () => {
  const { c } = compiled("handmade", "missing-theme");
  const fill = c.tracks[P_FILL]!;
  assert.equal(toHex(fill.ival[0] as number), "#f4a340"); // Accent from the brand table
  assert.equal(toHex(fill.ival[1] as number), "#ffffff"); // Mystery -> Ink of this theme
  assert.equal(toHex(c.paper), "#101010");
  const n = compiled("handmade", "none-to-color").c;
  assert.deepEqual(
    [...(n.tracks[P_FILL] as { ival: Int32Array }).ival].map((v) => v < 0),
    [
      false, // e01 Accent
      false,
      false,
      true, // ""
      true,
      false,
    ],
  );
});

test("rect corner radius is limited to half the shorter side", () => {
  const { c } = compiled("handmade", "stroke-only-rect");
  assert.equal(c.geomR[0], 12);
  assert.equal(c.geomR[1], 10);
});

test("stress fixture: 50 cards and 200 flights", () => {
  const { scene } = loadFile("handmade", "stress-50x200.json");
  const groups = scene.shapes.filter((s) => s.kind === "group");
  assert.equal(groups.length, 250);
  assert.equal(scene.shapes.length, 50 * 6 + 200 * 3);
});
