# Changelog

All notable changes to the Synod player. Every `synodlang` repository shares MAJOR.MINOR with the language version.

## Unreleased

## v0.2.1 — 2026-10-22

Implements Synod 0.2.

### Added

- `player.hitTest(x, y)` and `player.nodeBounds()`, plus `hitTestScene` and `nodeBoundsScene` for any host. A hit is the topmost drawn circle or rect whose own or enclosing group's `node` or `msg` is set, with 4 px slop; labels and lines never hit. Rules: decision 84 and "Hit testing (readers)" in the formats guide.
- The loader keeps the new additive keys `node` and `msg` on shapes and `choices` on pause markers, and drops an invalid one with a warning. Marker events, including those posted by the WebKit bridge, carry `choices`. Older scenes load as before and never hit. Drawing is unchanged: the display-list goldens are byte-identical.

## v0.2.0 — 2026-10-22

Implements Synod 0.2.

### Added

- The player reads `synod-scene/1` files and draws them on a canvas: circles, rounded rectangles, labels, lines and groups, with per-property keyframes, smootherstep easing, OKLab colour blending, group transforms, glow, and fit-and-letterbox on the Paper ground. It follows the reader rules in the Synod formats guide, and the same scene always draws the same frames.
- API: `loadScene`, `compileScene`, `renderToContext` (draw into any 2D context, for example an `OffscreenCanvas` for video export) and `createPlayer`. A player has `play`, `pause`, `toggle`, `seek`, `setRate` (0.25x to 4x), `setLoop`, `setStopAtPause` (Predict mode), `nextFact`, `prevFact`, `factAt`, `timeOfSeq`, `setScene`, `resize`, `renderFrame(at)` and `destroy`, and the events `time`, `marker`, `fact`, `play`, `pause` and `scene`.
- `attachWebKitBridge` posts player events to a `WKWebView` script message handler, and the IIFE build adds `SynodPlayer.mount(selector, options)` for Swift to call.
- Release assets: `synod-player-<tag>.js` (ES module), `synod-player-<tag>.iife.js` (global `SynodPlayer`), `synod-player-<tag>.d.ts` and `SHA256SUMS`. No runtime dependencies and no bundled fonts. Each bundle is at most 48 KB minified and 16 KB gzip (about 21 KB and 9 KB today).
- A demo page that loads a `scene.json` (file, drag and drop, `?scene=<url>` or one of the bundled golden scenes) with transport controls, markers and a `?bench=1` timing overlay.
- Tests: display-list goldens for all 29 golden scenes and the hand-made fixtures, WebKit pixel goldens, a Chromium smoke test and a WebKit frame-time gate in CI.
- Performance, measured by `npm run bench` in Node with a no-op 2D context (so these are evaluate-and-draw call costs, not rasterisation): about 0.02 ms per frame for raft and webapp and 0.09 ms for the 50-node, 200-message stress scene, loading and compiling raft in about 7 ms, and no heap growth over 10,000 frames. Numbers in Safari on Apple silicon at 120 Hz are pending the owner's manual check and will be added here.
