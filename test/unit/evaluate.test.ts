import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, MIN_OPACITY } from "../../src/eval/evaluate.ts";
import type { FrameState } from "../../src/eval/frame-state.ts";
import { createFrameState } from "../../src/eval/frame-state.ts";
import { smootherstep } from "../../src/math/ease.ts";
import { toHex } from "../../src/math/oklab.ts";
import type { Compiled } from "../../src/scene/compile.ts";
import { compileScene } from "../../src/scene/compile.ts";
import { loadScene } from "../../src/scene/load.ts";
import type { Scene, SceneKey, SceneShape } from "../../src/types.ts";
import { plainToHex, plainToLab } from "../helpers/plain-oklab.ts";
import { allScenes, compiled, loadFile } from "../helpers/scenes.ts";

function close(actual: number, expected: number, eps = 1e-9, msg = ""): void {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} ${actual} != ${expected}`);
}

function at(c: Compiled, t: number): FrameState {
  const fs = createFrameState(c);
  evaluate(c, t, fs);
  return fs;
}

function idx(scene: Scene, id: string): number {
  const i = scene.shapes.findIndex((s) => s.id === id);
  assert.ok(i >= 0, id);
  return i;
}

// ---------- concrete checks on the goldens ----------

test("group scene: a member's world x follows the group on the smootherstep curve", () => {
  const { scene, c } = compiled("builder", "group");
  const rect1 = idx(scene, "sf51ce27cc857"); // member of the first group, relative (0, 0)
  // first group: x 520 at 30, 300 at 230; at t = 130 u = 0.5, smootherstep = 0.5 -> 410
  let fs = at(c, 130);
  assert.equal(fs.visible[rect1], 1);
  close(fs.e[rect1] as number, 410);
  close(fs.f[rect1] as number, 325);
  // the label member sits 37 above its group
  const label1 = idx(scene, "sf71ce27ccbbd");
  close(fs.e[label1] as number, 410);
  close(fs.f[label1] as number, 288);
  // second group: 520 at 60, 300 at 260; at t = 130 u = 0.35
  const rect2 = idx(scene, "sb21cdd449450");
  const s = smootherstep(0.35);
  close(fs.e[rect2] as number, 520 - 220 * s);
  close(s, 0.235169375, 1e-12);
  // before a group's key and member exist: nothing visible
  fs = at(c, 29.999);
  assert.equal(fs.visible[rect1], 0);
  fs = at(c, 30);
  assert.equal(fs.visible[rect1], 1);
  close(fs.e[rect1] as number, 520);
  // after the last key the group rests at x 300
  fs = at(c, 1000);
  close(fs.e[rect1] as number, 300);
  close(fs.e[rect2] as number, 300);
});

test("markers scene: text switches at exactly 660", () => {
  const { scene, c } = compiled("builder", "markers");
  const lbl = idx(scene, "s22dc3aec9119");
  const text = (t: number): string => c.strings[at(c, t).text[lbl] as number] as string;
  assert.equal(text(30), "Peers {nobody}");
  assert.equal(text(659), "Peers {nobody}");
  assert.equal(text(659.999), "Peers {nobody}");
  assert.equal(text(660), "Peers {n2}");
  assert.equal(text(2000), "Peers {n2}");
  // the other label steps at 1180 and 2270
  const got = idx(scene, "sdedc402592bb");
  const g = (t: number): string => c.strings[at(c, t).text[got] as number] as string;
  assert.deepEqual(
    [g(60), g(1179), g(1180), g(2269), g(2270)],
    ["Got 0", "Got 0", "Got 1", "Got 1", "Got 2"],
  );
});

test("markers scene: a flight is invisible at its end, visible before", () => {
  const { scene, c } = compiled("builder", "markers");
  const circle = idx(scene, "sde581b0c4d66"); // end 1150
  const grp = idx(scene, "sdc581b0c4a00");
  assert.equal(c.end[circle], 1150);
  assert.equal(at(c, 449.999).visible[circle], 0);
  assert.equal(at(c, 450).visible[circle], 1);
  assert.equal(at(c, 800).visible[circle], 1);
  assert.equal(at(c, 1150).visible[circle], 0);
  assert.equal(at(c, 1150).visible[grp], 0);
  assert.equal(at(c, 3000).visible[circle], 0);
  // while flying it moves 820 -> 220 in x between 450 and 850
  const fs = at(c, 650);
  close(fs.e[circle] as number, 520);
  close(fs.f[circle] as number, 325);
});

test("markers scene: glow is on in [2000, 2600)", () => {
  const { scene, c } = compiled("builder", "markers");
  const rect = idx(scene, "s648ffc90f4c6");
  const glow = (t: number): number => at(c, t).glow[rect] as number;
  assert.deepEqual(
    [glow(0), glow(1999.999), glow(2000), glow(2300), glow(2599.999), glow(2600), glow(3200)],
    [0, 0, 1, 1, 1, 0, 0],
  );
  // stroke only: fill none, stroke Critical; opacity 0 -> 1 between 2000 and 2300
  let fs = at(c, 2450);
  assert.equal(fs.fill[rect], -1);
  assert.equal(toHex(fs.stroke[rect] as number), "#e86f5a");
  close(fs.opacity[rect] as number, 1);
  fs = at(c, 2150);
  close(fs.opacity[rect] as number, 0.5);
  assert.equal(fs.visible[rect], 1);
  assert.equal(at(c, 2000).visible[rect], 0); // opacity 0
  close(at(c, 3050).opacity[rect] as number, 0.5);
});

test("time is clamped to [0, duration]", () => {
  const { c } = compiled("builder", "group");
  const a = at(c, -50);
  assert.equal(a.at, 0);
  const b = at(c, 1e9);
  assert.equal(b.at, c.duration);
  assert.equal(at(c, Number.NaN).at, 0);
});

// ---------- hand-made fixtures ----------

test("lines: centre to centre, only while both ends are drawn", () => {
  const { scene, c } = compiled("handmade", "lines");
  const l1 = idx(scene, "s0000000000d4");
  const l2 = idx(scene, "s0000000000e5");
  const b = idx(scene, "s0000000000b2");
  let fs = at(c, 0);
  assert.equal(fs.visible[l1], 1);
  assert.deepEqual([fs.e[l1], fs.f[l1], fs.x2[l1], fs.y2[l1]], [200, 200, 1000, 600]);
  assert.equal(toHex(fs.stroke[l1] as number), "#f4a340");
  assert.equal(fs.fill[l1], -1);
  fs = at(c, 250);
  // a moves 200 -> 600 in x over 0..1000
  close(fs.e[l1] as number, 200 + 400 * smootherstep(0.25));
  // stroke Accent -> Good, halfway to its key at 500
  assert.equal(
    toHex(fs.stroke[l1] as number),
    plainToHex(mix(plainToLab("#F4A340"), plainToLab("#5CC8B8"), 0.5)),
  );
  fs = at(c, 500);
  assert.equal(toHex(fs.stroke[l1] as number), "#5cc8b8");
  // the end b fades out between 800 and 1000: the line goes when b stops being drawn
  fs = at(c, 900);
  assert.equal(fs.visible[b], 1);
  assert.equal(fs.visible[l1], 1);
  fs = at(c, 990);
  assert.equal(fs.visible[b], 0);
  assert.ok((fs.opacity[b] as number) < MIN_OPACITY);
  assert.equal(fs.visible[l1], 0);
  // a line to the (empty) centre group
  assert.equal(at(c, 99).visible[l2], 0);
  fs = at(c, 100);
  assert.equal(fs.visible[l2], 1);
  close(fs.e[l2] as number, 200 + 400 * smootherstep(0.1));
  close(fs.f[l2] as number, 200);
  assert.deepEqual([fs.x2[l2], fs.y2[l2]], [800, 500]);
  assert.equal(toHex(fs.stroke[l2] as number), "#3a4366"); // a line's default stroke is Line
  assert.equal(at(c, 600).visible[l2], 0);
});

function mix(a: number[], b: number[], e: number): number[] {
  return a.map((x, i) => x + ((b[i] as number) - x) * e);
}

test("rotation and scale compose as T R S, clockwise with y down", () => {
  const { scene, c } = compiled("handmade", "rotation-scale");
  const circ = idx(scene, "s000000000a1a");
  const rect = idx(scene, "s000000000a1b");
  let fs = at(c, 0);
  close(fs.e[circ] as number, 500);
  close(fs.f[circ] as number, 300);
  fs = at(c, 500); // scale 1.5, rotation 45
  const r = (150 * Math.SQRT2) / 2;
  close(fs.e[circ] as number, 400 + r);
  close(fs.f[circ] as number, 300 + r);
  close(fs.a[circ] as number, 1.5 * Math.cos(Math.PI / 4));
  close(fs.b[circ] as number, 1.5 * Math.sin(Math.PI / 4));
  close(fs.c[circ] as number, -1.5 * Math.sin(Math.PI / 4));
  fs = at(c, 1000); // scale 2, rotation 90: (100, 0) -> (0, 200); (0, 50) -> (-100, 0)
  close(fs.e[circ] as number, 400);
  close(fs.f[circ] as number, 500);
  close(fs.e[rect] as number, 300);
  close(fs.f[rect] as number, 300);
  close(fs.a[circ] as number, 0);
  close(fs.b[circ] as number, 2);
  close(fs.c[circ] as number, -2);
  close(fs.d[circ] as number, 0);
  // a free rect: rotation -30 -> 330 interpolates through 150 (scale 0.5, no change)
  const free = idx(scene, "s000000000a1d");
  fs = at(c, 500);
  close(fs.a[free] as number, 0.5 * Math.cos((150 * Math.PI) / 180));
  close(fs.b[free] as number, 0.5 * Math.sin((150 * Math.PI) / 180));
  fs = at(c, 0);
  close(fs.a[free] as number, 0.5 * Math.cos((-30 * Math.PI) / 180));
  close(fs.e[free] as number, 1000);
  // rotation exactly 0 and scale 1 give an exact identity
  const none = at(compiled("builder", "group").c, 30);
  assert.equal(none.a[0], 1);
  assert.equal(none.b[0], 0);
});

test("nested groups: parents placed after their members, opacity product, glow to members, ends", () => {
  const { scene, c } = compiled("handmade", "nested-groups");
  const g1 = idx(scene, "s000000000b01");
  const dot = idx(scene, "s000000000b03");
  const lab = idx(scene, "s000000000b04");
  const far = idx(scene, "s000000000b05");
  let fs = at(c, 500);
  // g1: T(100, 100) S(2); g2 inside it: T(50, 0) R(90); the dot at (10, 0) in g2
  close(fs.e[dot] as number, 200);
  close(fs.f[dot] as number, 120);
  close(fs.opacity[dot] as number, 0.25);
  close(fs.e[far] as number, 100);
  close(fs.f[far] as number, 160);
  close(fs.opacity[far] as number, 0.5);
  close(fs.a[dot] as number, 0);
  close(fs.b[dot] as number, 2);
  assert.equal(fs.visible[g1], 1);
  assert.equal(toHex(fs.fill[dot] as number), "#f4a340");
  assert.equal(c.strings[fs.text[lab] as number], "deep");
  // glow on the outer group reaches both members and the nested one
  assert.deepEqual([fs.glow[dot], fs.glow[far], fs.glow[lab]], [0, 0, 0]);
  fs = at(c, 700);
  assert.deepEqual([fs.glow[dot], fs.glow[far], fs.glow[lab]], [1, 1, 1]);
  fs = at(c, 900);
  assert.deepEqual([fs.glow[dot], fs.glow[far]], [0, 0]);
  // the label ends at 800
  assert.equal(at(c, 799.999).visible[lab], 1);
  assert.equal(at(c, 800).visible[lab], 0);
  assert.equal(at(c, 800).visible[dot], 1);
});

test("a member older than its group sees the group's first-key values", () => {
  const key = (k: SceneKey): SceneKey => k;
  const shapes: SceneShape[] = [
    {
      id: "m",
      kind: "circle",
      props: { r: 3 },
      keys: [key({ at: 0, x: 10, y: 0, opacity: 1, fill: "Ink" })],
    },
    {
      id: "g",
      kind: "group",
      props: { items: ["m"] },
      keys: [key({ at: 200, x: 500, y: 400, opacity: 1 }), key({ at: 400, x: 700 })],
      end: 600,
    },
  ];
  const { scene } = loadScene({
    format: "synod-scene/1",
    duration: 1000,
    canvas: { w: 1600, h: 1000 },
    shapes,
    markers: [],
    trace: [],
  });
  const c = compileScene(scene);
  let fs = at(c, 100);
  assert.equal(fs.visible[0], 1);
  close(fs.e[0] as number, 510);
  close(fs.f[0] as number, 400);
  fs = at(c, 300);
  close(fs.e[0] as number, 610);
  fs = at(c, 599.5);
  assert.equal(fs.visible[0], 1);
  fs = at(c, 600); // the group ended, so did its member
  assert.equal(fs.visible[0], 0);
  assert.equal(fs.visible[1], 0);
});

test("colors interpolate in OKLab with smootherstep; none steps", () => {
  const { scene, c } = compiled("handmade", "color-interpolation");
  const a = idx(scene, "s000000000d01");
  const fill = (t: number): string => toHex(at(c, t).fill[a] as number);
  assert.equal(fill(0), "#ede9e1");
  assert.equal(fill(500), "#efae9d"); // Ink -> Critical midpoint, checked in oklab.test.ts
  assert.equal(fill(1000), "#e86f5a");
  const lab = mix(plainToLab("#EDE9E1"), plainToLab("#E86F5A"), smootherstep(0.25));
  assert.equal(fill(250), plainToHex(lab));
  assert.equal(
    toHex(at(c, 500).stroke[a] as number),
    plainToHex(mix(plainToLab("#5CC8B8"), plainToLab("#E8C35A"), 0.5)),
  );
  // equal neighbouring colors stay put; theme color with a dotted name
  const b = idx(scene, "s000000000d02");
  assert.equal(toHex(at(c, 100).fill[b] as number), "#f4a340");
  assert.equal(
    toHex(at(c, 300).fill[b] as number),
    plainToHex(mix(plainToLab("#F4A340"), plainToLab("#FF0066"), smootherstep(0.25))),
  );
  assert.equal(toHex(at(c, 700).fill[b] as number), "#ff0066");
});

test("none to color is a step at the later key; color to none too", () => {
  const { scene, c } = compiled("handmade", "none-to-color");
  const a = idx(scene, "s000000000e01");
  const b = idx(scene, "s000000000e02");
  assert.equal(at(c, 0).fill[a], -1);
  assert.equal(at(c, 499.999).fill[a], -1);
  assert.equal(toHex(at(c, 500).fill[a] as number), "#f4a340");
  assert.equal(toHex(at(c, 999).fill[a] as number), "#f4a340");
  assert.equal(toHex(at(c, 599.5).fill[b] as number), "#f4a340");
  assert.equal(at(c, 600).fill[b], -1);
  assert.equal(at(c, 999.5).fill[b], -1);
  assert.equal(toHex(at(c, 1000).fill[b] as number), "#5cc8b8");
});

test("stroke-only rect has no fill; a label ignores its stroke", () => {
  const { c } = compiled("handmade", "stroke-only-rect");
  const fs = at(c, 100);
  assert.equal(fs.fill[0], -1);
  assert.equal(toHex(fs.stroke[0] as number), "#f4a340");
  assert.equal(fs.stroke[2], -1);
  assert.equal(toHex(fs.fill[2] as number), "#ede9e1");
});

test("unknown effect values draw as none", () => {
  const { scene, c } = compiled("handmade", "unknown-kind");
  const i = idx(scene, "s000000000f02");
  assert.equal(at(c, 0).glow[i], 0);
});

test("missing theme: unknown names and bad hex draw Ink; defaults x 800, y 500", () => {
  const { scene, c } = compiled("handmade", "missing-theme");
  const fs = at(c, 0);
  const myst = idx(scene, "s000000000a02");
  assert.equal(toHex(fs.fill[myst] as number), "#ffffff");
  assert.equal(toHex(fs.stroke[myst] as number), "#ffffff"); // "Bad": "red" is malformed
  const lab = idx(scene, "s000000000a03");
  assert.equal(fs.e[lab], 800);
  assert.equal(fs.f[lab], 500);
  assert.equal(toHex(fs.fill[lab] as number), "#ffffff"); // label default Ink
});

test("stress: at least 200 flights are alive at 2000", () => {
  const { scene, c } = compiled("handmade", "stress-50x200");
  const fs = at(c, 2000);
  let flights = 0;
  scene.shapes.forEach((s, i) => {
    if (s.kind === "circle" && fs.visible[i]) flights++;
  });
  assert.ok(flights >= 200, `${flights} flights`);
  // and the cards are all drawn
  let rects = 0;
  scene.shapes.forEach((s, i) => {
    if (s.kind === "rect" && fs.visible[i]) rects++;
  });
  assert.equal(rects, 50);
});

test("the stress fixture is what gen-stress.ts generates", async () => {
  const { generate } = await import("../../scripts/gen-stress.ts");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const file = join(import.meta.dirname, "..", "scenes", "handmade", "stress-50x200.json");
  assert.equal(readFileSync(file, "utf8"), generate());
});

test("cursor hints never change the answer: forward, backward and random time order", () => {
  const { c } = compiled("examples", "raft");
  const times: number[] = [];
  for (let i = 0; i <= 200; i++) times.push((i / 200) * c.duration);
  const fresh = (t: number): FrameState =>
    at(compileScene(loadFile("examples", "raft.json").scene), t);
  const shared = createFrameState(c);
  const order = [
    ...times,
    ...[...times].reverse(),
    ...times.map((_, i) => times[(i * 73) % times.length] as number),
  ];
  for (let k = 0; k < order.length; k += 17) {
    const t = order[k] as number;
    evaluate(c, t, shared);
    const ref = fresh(t);
    for (let i = 0; i < c.n; i++) {
      assert.equal(shared.visible[i], ref.visible[i]);
      if (ref.visible[i]) {
        assert.equal(shared.e[i], ref.e[i]);
        assert.equal(shared.f[i], ref.f[i]);
        assert.equal(shared.opacity[i], ref.opacity[i]);
        assert.equal(shared.fill[i], ref.fill[i]);
        assert.equal(shared.text[i], ref.text[i]);
      }
    }
  }
});

// ---------- agreement with a plain reference evaluator on every scene ----------

interface RefShape {
  visible: boolean;
  e: number;
  f: number;
  opacity: number;
  fill: string | null;
  stroke: string | null;
  text: string;
  glow: boolean;
}

/** Straightforward, allocating evaluator written from the plan, sharing no code with src/eval. */
function reference(scene: Scene, t: number): RefShape[] {
  const byId = new Map(scene.shapes.map((s, i) => [s.id, i]));
  const parent = new Map<number, number>();
  scene.shapes.forEach((s, i) => {
    if (s.kind === "group") for (const m of s.props.items) parent.set(byId.get(m) as number, i);
  });
  const ink = scene.theme.Ink as string;
  const colorOf = (name: string): string | null => {
    if (name === "") return null;
    const hex = scene.theme[name];
    return hex !== undefined && /^#[0-9a-fA-F]{6}$/.test(hex)
      ? hex.toLowerCase()
      : ink.toLowerCase();
  };
  type K = SceneKey;
  const withProp = (s: SceneShape, p: keyof K): K[] => s.keys.filter((k) => k[p] !== undefined);
  const num = (
    s: SceneShape,
    p: "x" | "y" | "scale" | "opacity" | "rotation",
    tt: number,
    def: number,
  ): number => {
    const ks = withProp(s, p);
    const prev = ks.filter((k) => k.at <= tt).at(-1);
    if (!prev) return def;
    const next = ks.find((k) => k.at > tt);
    if (!next || prev.at === tt) return prev[p] as number;
    const u = (tt - prev.at) / (next.at - prev.at);
    const e = u * u * u * (u * (6 * u - 15) + 10);
    return (prev[p] as number) + ((next[p] as number) - (prev[p] as number)) * e;
  };
  const col = (
    s: SceneShape,
    p: "fill" | "stroke",
    tt: number,
    def: string | null,
  ): string | null => {
    const ks = withProp(s, p);
    const prev = ks.filter((k) => k.at <= tt).at(-1);
    if (!prev) return def;
    const a = colorOf(prev[p] as string);
    const next = ks.find((k) => k.at > tt);
    if (!next || prev.at === tt || a === null) return a;
    const b = colorOf(next[p] as string);
    if (b === null || b === a) return a;
    const u = (tt - prev.at) / (next.at - prev.at);
    const e = u * u * u * (u * (6 * u - 15) + 10);
    return plainToHex(mix(plainToLab(a), plainToLab(b), e));
  };
  const str = (s: SceneShape, p: "text" | "effect", tt: number): string => {
    const prev = withProp(s, p)
      .filter((k) => k.at <= tt)
      .at(-1);
    return prev ? (prev[p] as string) : "";
  };
  type M = [number, number, number, number, number, number];
  const mul = (P: M, L: M): M => [
    P[0] * L[0] + P[2] * L[1],
    P[1] * L[0] + P[3] * L[1],
    P[0] * L[2] + P[2] * L[3],
    P[1] * L[2] + P[3] * L[3],
    P[0] * L[4] + P[2] * L[5] + P[4],
    P[1] * L[4] + P[3] * L[5] + P[5],
  ];
  const chainEnd = (i: number): number => {
    let end = scene.shapes[i]?.end ?? Number.POSITIVE_INFINITY;
    for (let p = parent.get(i); p !== undefined; p = parent.get(p)) {
      end = Math.min(end, scene.shapes[p]?.end ?? Number.POSITIVE_INFINITY);
    }
    return end;
  };
  const tOf = (i: number): number => {
    const s = scene.shapes[i] as SceneShape;
    return s.kind === "group" ? Math.max(t, (s.keys[0] as SceneKey).at) : t;
  };
  const world = (i: number): { m: M; op: number; glow: boolean } => {
    const s = scene.shapes[i] as SceneShape;
    const tt = tOf(i);
    const rot = (num(s, "rotation", tt, 0) * Math.PI) / 180;
    const sc = Math.max(0, num(s, "scale", tt, 1));
    const L: M = [
      Math.cos(rot) * sc,
      Math.sin(rot) * sc,
      -Math.sin(rot) * sc,
      Math.cos(rot) * sc,
      num(s, "x", tt, 800),
      num(s, "y", tt, 500),
    ];
    if (rot === 0) {
      L[0] = sc;
      L[1] = 0;
      L[2] = -0;
      L[3] = sc;
    }
    const op = Math.min(1, Math.max(0, num(s, "opacity", tt, 1)));
    const glow = str(s, "effect", tt) === "glow";
    const p = parent.get(i);
    if (p === undefined) return { m: L, op, glow };
    const w = world(p);
    return { m: mul(w.m, L), op: op * w.op, glow: glow || w.glow };
  };
  const out: RefShape[] = [];
  scene.shapes.forEach((s, i) => {
    const alive = (s.keys[0] as SceneKey).at <= t && t < chainEnd(i);
    const w = alive ? world(i) : { m: [0, 0, 0, 0, 0, 0] as M, op: 0, glow: false };
    out.push({
      visible: alive && w.op >= MIN_OPACITY,
      e: w.m[4],
      f: w.m[5],
      opacity: w.op,
      fill:
        s.kind === "group" || s.kind === "line"
          ? null
          : col(s, "fill", t, s.kind === "label" ? ink.toLowerCase() : null),
      stroke:
        s.kind === "label" || s.kind === "group"
          ? null
          : col(s, "stroke", t, s.kind === "line" ? colorOf("Line") : null),
      text: s.kind === "label" ? str(s, "text", t) : "",
      glow: w.glow,
    });
  });
  // a line is drawn only while both ends are
  scene.shapes.forEach((s, i) => {
    if (s.kind !== "line") return;
    const r = out[i] as RefShape;
    const a = out[byId.get(s.props.from) as number] as RefShape;
    const b = out[byId.get(s.props.to) as number] as RefShape;
    r.visible = r.visible && a.visible && b.visible;
    r.e = a.e;
    r.f = a.f;
  });
  return out;
}

function sampleTimes(scene: Scene): number[] {
  const set = new Set<number>([0, scene.duration, scene.duration / 3, scene.duration * 0.77]);
  const ats = new Set<number>();
  for (const s of scene.shapes) {
    for (const k of s.keys) ats.add(k.at);
    if (s.end !== undefined) ats.add(s.end);
  }
  for (const m of scene.markers) ats.add(m.at);
  const sorted = [...ats].sort((a, b) => a - b);
  const step = Math.max(1, Math.floor(sorted.length / 40));
  for (let i = 0; i < sorted.length; i += step) {
    const a = sorted[i] as number;
    const b = sorted[i + 1] ?? a + 10;
    for (const t of [a - 0.5, a, a + 0.5, (a + b) / 2])
      set.add(Math.min(scene.duration, Math.max(0, t)));
  }
  return [...set].sort((a, b) => a - b);
}

/** Whether a scene uses anything the 0.2 reference evaluator does not know. */
function uses03(scene: Scene): boolean {
  if (scene.style.easing !== "smooth" || scene.camera.length > 0) return true;
  return scene.shapes.some(
    (s) =>
      s.kind === "icon" ||
      s.kind === "counter" ||
      s.keys.some(
        (k) =>
          k.curve !== undefined ||
          k.trail !== undefined ||
          k.draw !== undefined ||
          k.halo !== undefined ||
          (k.effect !== undefined && k.effect !== "glow" && k.effect !== "none"),
      ),
  );
}

test("evaluate agrees with a plain reference evaluator on every 0.2 scene", () => {
  for (const [g, f] of allScenes()) {
    const { scene } = loadFile(g, f);
    if (uses03(scene)) continue;
    const c = compileScene(scene);
    const fs = createFrameState(c);
    const times = sampleTimes(scene);
    for (const t of times) {
      evaluate(c, t, fs);
      const ref = reference(scene, fs.at);
      for (let i = 0; i < c.n; i++) {
        const r = ref[i] as RefShape;
        const where = `${f} ${scene.shapes[i]?.id} t=${t}`;
        assert.equal(fs.visible[i] === 1, r.visible, `visible ${where}`);
        if (!r.visible) continue;
        close(fs.e[i] as number, r.e, 1e-6, `e ${where}`);
        close(fs.f[i] as number, r.f, 1e-6, `f ${where}`);
        close(fs.opacity[i] as number, r.opacity, 1e-9, `opacity ${where}`);
        assert.equal(fs.glow[i] === 1, r.glow, `glow ${where}`);
        const kind = scene.shapes[i]?.kind;
        if (kind === "group") continue;
        if (kind !== "line") {
          const got = (fs.fill[i] as number) < 0 ? null : toHex(fs.fill[i] as number);
          sameColor(got, r.fill, `fill ${where}`);
        }
        if (kind !== "label") {
          const got = (fs.stroke[i] as number) < 0 ? null : toHex(fs.stroke[i] as number);
          sameColor(got, r.stroke, `stroke ${where}`);
        }
        if (kind === "label")
          assert.equal(c.strings[fs.text[i] as number], r.text, `text ${where}`);
      }
    }
  }
});

function sameColor(a: string | null, b: string | null, msg: string): void {
  if (a === null || b === null) {
    assert.equal(a, b, msg);
    return;
  }
  for (const i of [1, 3, 5]) {
    const d = Math.abs(
      Number.parseInt(a.slice(i, i + 2), 16) - Number.parseInt(b.slice(i, i + 2), 16),
    );
    assert.ok(d <= 1, `${msg} ${a} vs ${b}`);
  }
}
