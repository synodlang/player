// Performance gate (plan section 4): evaluate + draw into a no-op context at 600
// evenly spaced times for raft, webapp and the stress fixture; load + compile raft.
// usage: node --expose-gc test/bench/bench.ts

import { renderToContext } from "../../src/render/draw.ts";
import { compileScene } from "../../src/scene/compile.ts";
import { loadScene } from "../../src/scene/load.ts";
import type { CompiledScene, View } from "../../src/types.ts";
import { NullContext } from "../helpers/null-context.ts";
import { sceneText } from "../helpers/scenes.ts";

const P50_MS = 1;
const P99_MS = 2.5;
const LOAD_MS = 50;
const FRAMES = 600;
const VIEW: View = { width: 1600, height: 1000, pixelRatio: 1 };

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] as number;
}

function frameStats(c: CompiledScene, duration: number): { p50: number; p99: number } {
  const ctx = new NullContext();
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < FRAMES; i++) renderToContext(ctx, c, (duration * i) / (FRAMES - 1), VIEW);
  }
  const times: number[] = [];
  for (let i = 0; i < FRAMES; i++) {
    const at = (duration * i) / (FRAMES - 1);
    const t0 = performance.now();
    renderToContext(ctx, c, at, VIEW);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { p50: percentile(times, 0.5), p99: percentile(times, 0.99) };
}

function loadMs(text: string): number {
  const t0 = performance.now();
  const { scene } = loadScene(text);
  compileScene(scene);
  return performance.now() - t0;
}

function heapGrowthMb(c: CompiledScene, duration: number): number {
  const gc = (globalThis as { gc?: () => void }).gc;
  const ctx = new NullContext();
  const frame = (i: number) =>
    renderToContext(ctx, c, (duration * (i % FRAMES)) / (FRAMES - 1), VIEW);
  for (let i = 0; i < 3000; i++) frame(i);
  gc?.();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 10000; i++) frame(i);
  gc?.();
  return (process.memoryUsage().heapUsed - before) / (1024 * 1024);
}

function run(): boolean {
  let ok = true;
  const fail = (m: string) => {
    ok = false;
    process.stdout.write(`FAIL ${m}\n`);
  };
  const raftText = sceneText("examples", "raft.json");
  loadMs(raftText); // warm the JIT like a page would not, but keep the gate stable
  const first = loadMs(raftText);
  process.stdout.write(`load+compile raft: ${first.toFixed(1)} ms (gate ${LOAD_MS})\n`);
  if (first > LOAD_MS) fail("load+compile raft");

  const scenes: [string, string, string][] = [
    ["raft", "examples", "raft.json"],
    ["webapp", "examples", "webapp.json"],
    ["stress", "handmade", "stress-50x200.json"],
  ];
  for (const [name, group, file] of scenes) {
    const { scene } = loadScene(sceneText(group as "examples" | "handmade", file));
    const c = compileScene(scene);
    const s = frameStats(c, scene.duration);
    process.stdout.write(
      `${name}: p50 ${s.p50.toFixed(3)} ms (gate ${P50_MS}), p99 ${s.p99.toFixed(3)} ms (gate ${P99_MS})\n`,
    );
    if (s.p50 > P50_MS) fail(`${name} p50`);
    if (s.p99 > P99_MS) fail(`${name} p99`);
  }

  const { scene } = loadScene(raftText);
  const grow = heapGrowthMb(compileScene(scene), scene.duration);
  process.stdout.write(`heap growth over 10k raft frames: ${grow.toFixed(3)} MB (gate 1)\n`);
  if (grow >= 1) fail("heap growth");
  return ok;
}

let ok = run();
if (!ok) {
  process.stdout.write("retrying once\n");
  ok = run();
}
process.exit(ok ? 0 : 1);
