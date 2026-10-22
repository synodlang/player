// Typechecked against dist/synod-player.d.ts only (see tsconfig.json): proves the
// public declarations are self-contained and usable as documented.

import {
  attachWebKitBridge,
  type Ctx2D,
  compileScene,
  createPlayer,
  format,
  loadScene,
  type Player,
  type PlayerEventMap,
  renderToContext,
  SceneError,
  version,
} from "@synodlang/player";

declare const canvas: HTMLCanvasElement;
declare const ctx: CanvasRenderingContext2D;

try {
  const { scene, warnings } = loadScene("{}");
  const compiled = compileScene(scene);
  renderToContext(ctx satisfies Ctx2D, compiled, 0, { width: 800, height: 500, pixelRatio: 2 });
  renderToContext(ctx, compiled, 0, { width: 800, height: 500 }, { sans: "Inter" });
  const n: number = warnings.length;
  const player: Player = createPlayer(canvas, scene, { loop: true, rate: 2, fonts: { sans: "x" } });
  const off: () => void = player.on("marker", (e: PlayerEventMap["marker"]) => e.marker.text);
  player.on("pause", (e) => e.reason satisfies "user" | "marker" | "end");
  player.setScene("{}", { keepTime: false });
  const fact = player.nextFact();
  if (fact) console.log(fact.seq + fact.at + n);
  attachWebKitBridge(player);
  attachWebKitBridge(player, "other")();
  off();
  console.log(version, format, player.time, player.duration);
} catch (e) {
  if (e instanceof SceneError) console.log(e.code);
}
