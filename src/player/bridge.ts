// Posts player events to a WKWebView script message handler when one exists.

import type { Player, PlayerEventName } from "../types.ts";

interface Handler {
  postMessage(message: unknown): void;
}

const TIME_HZ = 30;

/** Returns a function that detaches the bridge. A no-op when the handler is absent. */
export function attachWebKitBridge(player: Player, name = "synodPlayer"): () => void {
  const wk = (globalThis as unknown as { webkit?: { messageHandlers?: Record<string, Handler> } })
    .webkit;
  const handler = wk?.messageHandlers?.[name];
  if (!handler) return () => {};
  const post = (message: object): void => {
    try {
      handler.postMessage(message);
    } catch {
      // A closed web view must not break playback.
    }
  };
  let lastTime = Number.NEGATIVE_INFINITY;
  const offs: (() => void)[] = [];
  const forward = (event: PlayerEventName, force: boolean) => {
    offs.push(
      player.on(event, (e: unknown) => {
        if (force) post({ event: "time", at: player.time });
        post({ event, ...(e as object) });
      }),
    );
  };
  offs.push(
    player.on("time", (e) => {
      const now = performance.now();
      if (now - lastTime < 1000 / TIME_HZ) return;
      lastTime = now;
      post({ event: "time", at: e.at });
    }),
  );
  forward("marker", false);
  forward("fact", false);
  forward("play", false);
  forward("pause", true);
  forward("scene", true);
  return () => {
    for (const off of offs) off();
    offs.length = 0;
  };
}
