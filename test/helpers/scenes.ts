// Finding and loading the scenes under test/scenes.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Compiled } from "../../src/scene/compile.ts";
import { compileScene } from "../../src/scene/compile.ts";
import { loadScene } from "../../src/scene/load.ts";
import type { LoadResult, Scene } from "../../src/types.ts";

export const SCENES_DIR = join(import.meta.dirname, "..", "scenes");

export type SceneGroup = "examples" | "builder" | "handmade";

/** Sorted file names (with .json) of one directory of scenes. */
export function sceneFiles(group: SceneGroup): string[] {
  return readdirSync(join(SCENES_DIR, group))
    .filter((f) => f.endsWith(".json"))
    .sort();
}

export function sceneText(group: SceneGroup, file: string): string {
  return readFileSync(join(SCENES_DIR, group, file), "utf8");
}

export function loadFile(group: SceneGroup, file: string): LoadResult {
  return loadScene(sceneText(group, file));
}

/** Load "<group>/<name>" (no extension) and compile it. */
export function compiled(group: SceneGroup, name: string): { scene: Scene; c: Compiled } {
  const { scene } = loadFile(group, `${name}.json`);
  return { scene, c: compileScene(scene) };
}

/** Every vendored and hand-made scene as [group, file]. */
export function allScenes(): [SceneGroup, string][] {
  const out: [SceneGroup, string][] = [];
  for (const g of ["examples", "builder", "handmade"] as const) {
    for (const f of sceneFiles(g)) out.push([g, f]);
  }
  return out;
}
