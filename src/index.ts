// The public API of the Synod player.

import { attachWebKitBridge as attach } from "./player/bridge.ts";
import { createPlayer as create } from "./player/player.ts";
import { renderToContext as render } from "./render/draw.ts";
import { compileScene as compile } from "./scene/compile.ts";
import { loadScene as load } from "./scene/load.ts";
import type {
  CompiledScene,
  Ctx2D,
  LoadResult,
  Player,
  PlayerOptions,
  Scene,
  View,
} from "./types.ts";

export type {
  CircleShape,
  CompiledScene,
  Ctx2D,
  GroupShape,
  LabelShape,
  LineShape,
  LoadResult,
  MarkerKind,
  PauseReason,
  Player,
  PlayerEventMap,
  PlayerEventName,
  PlayerOptions,
  RectShape,
  Scene,
  SceneErrorCode,
  SceneKey,
  SceneMarker,
  SceneShape,
  Theme,
  TraceEntry,
  View,
} from "./types.ts";
export { SceneError } from "./types.ts";

declare const __VERSION__: string;

/** The player's version. */
export const version: string = typeof __VERSION__ === "string" ? __VERSION__ : "0.0.0-dev";
/** The scene format family this player reads. */
export const format = "synod-scene/1";

/** Parse and validate a scene.json (text or parsed object). Throws SceneError. */
export function loadScene(input: string | unknown): LoadResult {
  return load(input);
}

/** Prepare a scene for fast drawing. */
export function compileScene(scene: Scene): CompiledScene {
  return compile(scene);
}

/** Draw the scene at `at` ms into any 2D context. Deterministic and synchronous. */
export function renderToContext(
  ctx: Ctx2D,
  compiled: CompiledScene,
  at: number,
  view: View,
  options?: { sans?: string },
): void {
  render(ctx, compiled, at, view, options);
}

/** Play a scene on a canvas. */
export function createPlayer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  scene: Scene | string | object,
  options?: PlayerOptions,
): Player {
  return create(canvas, scene, options);
}

/** Post player events to window.webkit.messageHandlers[name] when it exists. */
export function attachWebKitBridge(player: Player, name?: string): () => void {
  return attach(player, name);
}
