import assert from "node:assert/strict";
import { test } from "node:test";
import { BRAND_THEME, loadScene } from "../../src/scene/load.ts";
import { SceneError } from "../../src/types.ts";
import { allScenes, loadFile, sceneFiles } from "../helpers/scenes.ts";

function minimal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "synod-scene/1",
    duration: 100,
    canvas: { w: 1600, h: 1000 },
    theme: { ...BRAND_THEME },
    shapes: [],
    markers: [],
    trace: [],
    ...extra,
  };
}

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    assert.ok(e instanceof SceneError, String(e));
    return e.code;
  }
  return "none";
}

const circle = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "circle",
  props: { r: 5 },
  keys: [{ at: 0, x: 1, y: 2, opacity: 1, fill: "Ink" }],
  ...extra,
});

test("all 37 vendored goldens and every hand-made scene load with zero errors", () => {
  assert.equal(sceneFiles("examples").length, 9);
  assert.equal(sceneFiles("builder").length, 28);
  for (const [g, f] of allScenes()) {
    const { scene } = loadFile(g, f);
    // a look fault (fault-bad-icon) ends the scene before any shape
    assert.ok(scene.shapes.length > 0 || f === "fault-bad-icon.json", f);
  }
});

test("the goldens load without warnings", () => {
  for (const g of ["examples", "builder"] as const) {
    for (const f of sceneFiles(g)) assert.deepEqual(loadFile(g, f).warnings, [], f);
  }
});

test("golden shape counts", () => {
  assert.equal(loadFile("examples", "raft.json").scene.shapes.length, 1928);
  assert.equal(loadFile("examples", "webapp.json").scene.shapes.length, 1304);
  assert.equal(loadFile("examples", "cassandra.json").scene.shapes.length, 614);
  assert.equal(loadFile("examples", "gossip.json").scene.shapes.length, 482);
  assert.equal(loadFile("examples", "paxos.json").scene.shapes.length, 115);
});

test("bad-json", () => {
  assert.equal(
    code(() => loadScene("{")),
    "bad-json",
  );
  assert.equal(
    code(() => loadScene("")),
    "bad-json",
  );
  assert.equal(
    code(() => loadScene("[]")),
    "bad-json",
  );
  assert.equal(
    code(() => loadScene("42")),
    "bad-json",
  );
  assert.equal(
    code(() => loadScene(null)),
    "bad-json",
  );
  assert.equal(
    code(() => loadScene([])),
    "bad-json",
  );
});

test("unsupported-format", () => {
  assert.equal(
    code(() => loadScene(minimal({ format: "synod-scene/2" }))),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene(minimal({ format: "synod-scene/10" }))),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene(minimal({ format: "synod-scene/1.1" }))),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene(minimal({ format: "synod-trace/1" }))),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene(minimal({ format: 1 }))),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene({})),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene(JSON.stringify(minimal({ format: "synod-scene/2" })))),
    "unsupported-format",
  );
  assert.equal(
    code(() => loadScene(minimal())),
    "none",
  );
});

test("bad-scene: wrong types", () => {
  for (const extra of [
    { duration: "100" },
    { duration: -1 },
    { canvas: null },
    { canvas: { w: 0, h: 10 } },
    { canvas: { w: "a", h: 10 } },
    { theme: [] },
    { shapes: {} },
    { shapes: [1] },
    { shapes: [{ id: 1, kind: "circle" }] },
    { shapes: [circle("a", { keys: "no" })] },
    { shapes: [circle("a", { keys: [{ at: "0" }] })] },
    { shapes: [circle("a", { keys: [{ at: 0, x: "1" }] })] },
    { shapes: [circle("a", { props: {} })] },
    { shapes: [circle("a", { end: "9" })] },
    { shapes: [{ id: "g", kind: "group", props: {}, keys: [{ at: 0 }] }] },
    { markers: {} },
    { markers: [{ at: "1", kind: "pause" }] },
    { markers: [1] },
    { trace: {} },
    { trace: [{ seq: 1 }] },
  ]) {
    assert.equal(
      code(() => loadScene(minimal(extra))),
      "bad-scene",
      JSON.stringify(extra),
    );
  }
});

test("unknown fields are ignored without a warning", () => {
  const r = loadScene(
    minimal({
      future: 1,
      shapes: [
        circle("a", {
          colour: "red",
          props: { r: 5, glow: true },
          keys: [{ at: 0, x: 1, blur: 3 }],
        }),
      ],
      markers: [{ at: 5, kind: "caption", text: "t", extra: true }],
      trace: [{ seq: 1, at: 0, t: 9 }],
    }),
  );
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.scene.shapes[0]?.keys, [{ at: 0, x: 1 }]);
  assert.equal(r.scene.markers.length, 1);
  assert.deepEqual(r.scene.trace, [{ seq: 1, at: 0 }]);
});

test("unknown marker kinds are ignored silently", () => {
  const r = loadScene(
    minimal({
      markers: [
        { at: 1, kind: "pause", text: "a" },
        { at: 2, kind: "bookmark", text: "b" },
        { at: 3, kind: "failed", text: "c" },
      ],
    }),
  );
  assert.deepEqual(
    r.scene.markers.map((m) => m.kind),
    ["pause", "failed"],
  );
  assert.deepEqual(r.warnings, []);
});

test("an unknown shape kind warns and is skipped, with what refers only to it", () => {
  const r = loadScene(
    minimal({
      shapes: [
        { id: "p", kind: "polygon", props: {}, keys: [{ at: 0 }] },
        circle("c"),
        { id: "l", kind: "line", props: { from: "p", to: "c" }, keys: [{ at: 0, opacity: 1 }] },
        { id: "g1", kind: "group", props: { items: ["p"] }, keys: [{ at: 0 }] },
        { id: "g2", kind: "group", props: { items: ["p", "c"] }, keys: [{ at: 0 }] },
        { id: "g3", kind: "group", props: { items: [] }, keys: [{ at: 0 }] },
        { id: "g4", kind: "group", props: { items: ["g1"] }, keys: [{ at: 0 }] },
      ],
    }),
  );
  assert.deepEqual(
    r.scene.shapes.map((s) => s.id),
    ["c", "g2", "g3"],
  );
  const g2 = r.scene.shapes[1];
  assert.deepEqual(g2?.kind === "group" ? g2.props.items : null, ["c"]);
  assert.ok(r.warnings.some((w) => w.includes("polygon")));
});

test("the hand-made unknown-kind scene", () => {
  const { scene, warnings } = loadFile("handmade", "unknown-kind.json");
  assert.deepEqual(
    scene.shapes.map((s) => s.id),
    ["s000000000f02", "s000000000f05", "s000000000f06"],
  );
  assert.ok(warnings.length > 0);
});

test("unsorted keys are stably sorted with a warning", () => {
  const r = loadScene(
    minimal({
      shapes: [
        circle("a", {
          keys: [
            { at: 10, x: 3 },
            { at: 0, x: 1, y: 1, opacity: 1 },
            { at: 10, y: 4 },
            { at: 5, x: 2 },
          ],
        }),
      ],
    }),
  );
  assert.deepEqual(
    r.scene.shapes[0]?.keys.map((k) => [k.at, k.x ?? k.y]),
    [
      [0, 1],
      [5, 2],
      [10, 3],
      [10, 4],
    ],
  );
  assert.equal(r.warnings.length, 1);
});

test("unsorted markers and trace are sorted with a warning", () => {
  const r = loadScene(
    minimal({
      markers: [
        { at: 9, kind: "pause", text: "b" },
        { at: 1, kind: "pause", text: "a" },
      ],
      trace: [
        { seq: 2, at: 9 },
        { seq: 1, at: 1 },
      ],
    }),
  );
  assert.deepEqual(
    r.scene.markers.map((m) => m.text),
    ["a", "b"],
  );
  assert.deepEqual(
    r.scene.trace.map((t) => t.seq),
    [1, 2],
  );
  assert.equal(r.warnings.length, 2);
});

test("a first key without x and y is accepted", () => {
  const r = loadScene(minimal({ shapes: [circle("a", { keys: [{ at: 0, opacity: 1 }] })] }));
  assert.deepEqual(r.warnings, []);
});

test("missing theme names take the brand colors, with a warning", () => {
  const r = loadScene(minimal({ theme: { Paper: "#000000", Extra: "#123456", Bad: "red" } }));
  assert.equal(r.scene.theme.Paper, "#000000");
  assert.equal(r.scene.theme.Accent, "#F4A340");
  assert.equal(r.scene.theme.Critical, "#E86F5A");
  assert.equal(r.scene.theme.Extra, "#123456");
  assert.ok(r.warnings.some((w) => w.includes("Bad")));
  assert.equal(r.warnings.filter((w) => w.startsWith("theme has no")).length, 7);
  const none = loadScene(minimal({ theme: undefined }));
  assert.deepEqual(none.scene.theme, { ...BRAND_THEME });
});

test("duplicate ids, double membership and cycles are repaired with warnings", () => {
  const r = loadScene(
    minimal({
      shapes: [
        circle("a"),
        circle("a"),
        { id: "g1", kind: "group", props: { items: ["a", "g2"] }, keys: [{ at: 0 }] },
        { id: "g2", kind: "group", props: { items: ["a", "g1", "g2"] }, keys: [{ at: 0 }] },
        { id: "l", kind: "line", props: { from: "a", to: "zz" }, keys: [{ at: 0 }] },
      ],
    }),
  );
  assert.deepEqual(
    r.scene.shapes.map((s) => s.id),
    ["a", "g1", "g2"],
  );
  const g1 = r.scene.shapes[1];
  const g2 = r.scene.shapes[2];
  assert.deepEqual(g1?.kind === "group" ? g1.props.items : null, ["a", "g2"]);
  assert.deepEqual(g2?.kind === "group" ? g2.props.items : null, []);
  assert.ok(r.warnings.length >= 4);
});

test("loadScene accepts a parsed object and does not change it", () => {
  const doc = minimal({ shapes: [circle("a", { keys: [{ at: 5 }, { at: 1 }] })] });
  const before = JSON.stringify(doc);
  loadScene(doc);
  assert.equal(JSON.stringify(doc), before);
});

test("node, msg and choices are kept when valid", () => {
  const { scene, warnings } = loadScene(
    minimal({
      shapes: [circle("a", { node: "n1", msg: 0, future: 1 }), circle("b")],
      markers: [
        { at: 5, kind: "pause", text: "Q?", choices: ["x", "y"] },
        { at: 6, kind: "pause", text: "Q?", choices: [] },
        { at: 7, kind: "pause", text: "Q?" },
      ],
    }),
  );
  assert.deepEqual(warnings, []);
  assert.equal(scene.shapes[0]?.node, "n1");
  assert.equal(scene.shapes[0]?.msg, 0);
  assert.equal(scene.shapes[1]?.node, undefined);
  assert.equal("msg" in (scene.shapes[1] as object), false);
  assert.deepEqual(scene.markers[0]?.choices, ["x", "y"]);
  assert.equal("choices" in (scene.markers[1] as object), false);
  assert.equal("choices" in (scene.markers[2] as object), false);
});

test("invalid node, msg and choices are dropped with a warning", () => {
  const { scene, warnings } = loadScene(
    minimal({
      shapes: [
        circle("a", { node: 3 }),
        circle("b", { msg: -1 }),
        circle("c", { msg: 1.5 }),
        circle("d", { msg: "5", node: "" }),
      ],
      markers: [
        { at: 1, kind: "pause", text: "Q", choices: "x" },
        { at: 2, kind: "pause", text: "Q", choices: ["x", 1] },
        { at: 3, kind: "caption", text: "C", choices: ["x"] },
      ],
    }),
  );
  for (const s of scene.shapes) {
    assert.equal(s.node, undefined);
    assert.equal(s.msg, undefined);
  }
  for (const m of scene.markers) assert.equal(m.choices, undefined);
  assert.equal(warnings.length, 8);
  assert.match(warnings[0] as string, /shape a: node/);
  assert.match(warnings[7] as string, /marker 2: choices/);
});
