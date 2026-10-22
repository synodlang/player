// The browser global: window.SynodPlayer.

import { attachWebKitBridge, createPlayer } from "./index.ts";
import type { Player, PlayerOptions } from "./types.ts";

export {
  attachWebKitBridge,
  compileScene,
  createPlayer,
  format,
  loadScene,
  renderToContext,
  SceneError,
  version,
} from "./index.ts";

const EMPTY = {
  format: "synod-scene/1",
  duration: 0,
  canvas: { w: 1600, h: 1000 },
  shapes: [],
  markers: [],
  trace: [],
};

export type MountOptions = PlayerOptions & {
  /** A scene (text or object) to show at once; default is an empty scene. */
  scene?: string | object;
  /** Script message handler name for the WebKit bridge; false disables it. */
  bridge?: string | false;
};

/**
 * Find `selector`; use it when it is a canvas, else put a canvas filling it.
 * Attaches the WebKit bridge when its handler exists. Returns the player.
 */
export function mount(selector: string, opts: MountOptions = {}): Player {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`synod player: no element matches ${selector}`);
  let canvas: HTMLCanvasElement;
  if (el instanceof HTMLCanvasElement) {
    canvas = el;
  } else {
    canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    el.appendChild(canvas);
  }
  const { scene, bridge, ...playerOpts } = opts;
  const player = createPlayer(canvas, scene ?? EMPTY, playerOpts);
  if (bridge !== false) attachWebKitBridge(player, bridge);
  return player;
}
