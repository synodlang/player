// Display-list goldens (M7 Gate 1). Renders every golden scene through the
// recording context and writes test/golden/frames/.
//
// usage: node scripts/update-goldens.ts
//
// test/golden.test.ts imports generateGoldens() and compares.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hitTestScene, nodeBoundsScene } from "../src/eval/hit.ts";
import { renderToContext } from "../src/render/draw.ts";
import type { Compiled } from "../src/scene/compile.ts";
import { compileScene } from "../src/scene/compile.ts";
import { loadScene } from "../src/scene/load.ts";
import type { Scene } from "../src/types.ts";
import { RecordingContext } from "../test/helpers/recording-context.ts";
import { sceneText } from "../test/helpers/scenes.ts";

export const HITS_DIR = join(import.meta.dirname, "..", "test", "golden", "hits");
export const FRAMES_DIR = join(import.meta.dirname, "..", "test", "golden", "frames");

/** Scenes whose goldens are hashes (too large to keep as text). */
export const HASHED = ["cassandra", "gossip", "raft", "webapp"];
export const MAX_BUILDER_FRAMES = 40;
export const LETTERBOX = { scene: "builder/group", width: 1000, height: 1000, pixelRatio: 2 };

/** The hand-made scenes of 0.2 (their own tests cover them); every other hand-made scene is a 0.3 golden. */
const HANDMADE_02 = [
  "color-interpolation",
  "lines",
  "marker-and-key-fields",
  "missing-theme",
  "nested-groups",
  "none-to-color",
  "rotation-scale",
  "stress-50x200",
  "stroke-only-rect",
  "unknown-kind",
];
/** Hand-made scenes whose display list is a hash (too large to keep as text). */
const HANDMADE_HASHED = ["stress-sketch-trails"];

export interface View {
  width: number;
  height: number;
  pixelRatio: number;
}
export const MAIN_VIEW: View = { width: 1600, height: 1000, pixelRatio: 1 };

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Every distinct key time plus the midpoints between neighbours, at most 40 evenly picked. */
export function builderTimes(scene: Scene): number[] {
  const set = new Set<number>();
  for (const s of scene.shapes) for (const k of s.keys) set.add(k.at);
  const keys = [...set].sort((a, b) => a - b);
  const all: number[] = [];
  keys.forEach((t, i) => {
    all.push(t);
    const next = keys[i + 1];
    if (next !== undefined) all.push(round3((t + next) / 2));
  });
  if (all.length <= MAX_BUILDER_FRAMES) return all;
  const out: number[] = [];
  for (let i = 0; i < MAX_BUILDER_FRAMES; i++) {
    out.push(all[Math.round((i * (all.length - 1)) / (MAX_BUILDER_FRAMES - 1))] as number);
  }
  return [...new Set(out)];
}

/** 0, d/4, d/2, 3d/4, d, every marker, and 8 evenly spaced times. */
export function exampleTimes(scene: Scene): number[] {
  const d = scene.duration;
  const set = new Set<number>([0, d / 4, d / 2, (3 * d) / 4, d]);
  for (const m of scene.markers) set.add(m.at);
  for (let i = 1; i <= 8; i++) set.add((i * d) / 9);
  return [...set]
    .map(round3)
    .sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
}

export function frameText(c: Compiled, at: number, view: View): string {
  const ctx = new RecordingContext();
  renderToContext(ctx, c, at, view);
  return ctx.text();
}

export interface Golden {
  /** Path relative to FRAMES_DIR. */
  file: string;
  content: string;
}

function load(
  group: "examples" | "builder" | "handmade",
  name: string,
): { scene: Scene; c: Compiled } {
  const { scene } = loadScene(sceneText(group, `${name}.json`));
  return { scene, c: compileScene(scene) };
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function names(group: "examples" | "builder" | "handmade"): string[] {
  const dir = join(import.meta.dirname, "..", "test", "scenes", group);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => f.slice(0, -5));
}

/** All golden files, deterministic. */
export function generateGoldens(): Golden[] {
  const out: Golden[] = [];
  const header = (v: View) => `# view ${v.width}x${v.height} dpr ${v.pixelRatio}\n`;
  const hashLines: string[] = [];

  for (const name of names("builder")) {
    const { scene, c } = load("builder", name);
    let content = header(MAIN_VIEW);
    for (const at of builderTimes(scene)) {
      content += `== at=${at}\n${frameText(c, at, MAIN_VIEW)}\n`;
    }
    out.push({ file: `${name}.txt`, content });
  }
  for (const name of names("examples")) {
    const { scene, c } = load("examples", name);
    const times = exampleTimes(scene);
    if (HASHED.includes(name)) {
      for (const at of times) {
        hashLines.push(`${name} at=${at} ${sha(frameText(c, at, MAIN_VIEW))}`);
      }
    } else {
      let content = header(MAIN_VIEW);
      for (const at of times) content += `== at=${at}\n${frameText(c, at, MAIN_VIEW)}\n`;
      out.push({ file: `${name}.txt`, content });
    }
  }
  for (const name of names("handmade")) {
    if (HANDMADE_02.includes(name)) continue;
    const { scene, c } = load("handmade", name);
    if (HANDMADE_HASHED.includes(name)) {
      for (const at of exampleTimes(scene)) {
        hashLines.push(`${name} at=${at} ${sha(frameText(c, at, MAIN_VIEW))}`);
      }
      continue;
    }
    let content = header(MAIN_VIEW);
    for (const at of builderTimes(scene)) {
      content += `== at=${at}\n${frameText(c, at, MAIN_VIEW)}\n`;
    }
    out.push({ file: `handmade-${name}.txt`, content });
  }
  out.push({
    file: "hashes.txt",
    content: `# sha256 of each frame's display list at ${MAIN_VIEW.width}x${MAIN_VIEW.height} dpr 1\n${hashLines.join("\n")}\n`,
  });

  const [group, name] = LETTERBOX.scene.split("/") as ["builder", string];
  const { scene, c } = load(group, name);
  const lv: View = {
    width: LETTERBOX.width,
    height: LETTERBOX.height,
    pixelRatio: LETTERBOX.pixelRatio,
  };
  let content = header(lv);
  for (const at of [0, scene.duration / 4, scene.duration / 2, scene.duration]) {
    content += `== at=${round3(at)}\n${frameText(c, round3(at), lv)}\n`;
  }
  out.push({ file: `letterbox-${name}.txt`, content });
  return out;
}

/**
 * Hit goldens: for each example scene and the hand-made fixture, at 10 evenly spaced
 * times, nodeBounds and the hitTest answer at each box centre (null when nothing hits).
 */
export function generateHitGoldens(): Golden[] {
  const out: Golden[] = [];
  const sources: [string, string][] = [];
  for (const name of names("examples")) sources.push([name, sceneText("examples", `${name}.json`)]);
  const fixtures = join(HITS_DIR, "scenes");
  for (const f of readdirSync(fixtures)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    sources.push([f.slice(0, -5), readFileSync(join(fixtures, f), "utf8")]);
  }
  for (const [name, text] of sources) {
    const { scene } = loadScene(text);
    const c = compileScene(scene);
    const frames = [];
    for (let i = 0; i < 10; i++) {
      const at = round3((i * scene.duration) / 9);
      const boxes = nodeBoundsScene(c, at, MAIN_VIEW).map((b) => ({
        node: b.node,
        x: round3(b.x),
        y: round3(b.y),
        w: round3(b.w),
        h: round3(b.h),
        hit: hitTestScene(c, at, MAIN_VIEW, b.x + b.w / 2, b.y + b.h / 2),
      }));
      frames.push({ at, boxes });
    }
    out.push({
      file: `${name}.json`,
      content: `${JSON.stringify({ view: MAIN_VIEW, frames }, null, 1)}\n`,
    });
  }
  return out;
}

if (import.meta.main) {
  mkdirSync(FRAMES_DIR, { recursive: true });
  // drop stale goldens so a removed scene does not linger
  for (const f of readdirSync(FRAMES_DIR)) if (f.endsWith(".txt")) rmSync(join(FRAMES_DIR, f));
  const goldens = generateGoldens();
  for (const g of goldens) writeFileSync(join(FRAMES_DIR, g.file), g.content);
  mkdirSync(HITS_DIR, { recursive: true });
  for (const f of readdirSync(HITS_DIR)) if (f.endsWith(".json")) rmSync(join(HITS_DIR, f));
  const hits = generateHitGoldens();
  for (const g of hits) writeFileSync(join(HITS_DIR, g.file), g.content);
  process.stdout.write(`wrote ${hits.length} hit goldens to ${HITS_DIR}\n`);
  process.stdout.write(`wrote ${goldens.length} golden files to ${FRAMES_DIR}\n`);
}
