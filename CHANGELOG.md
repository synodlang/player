# Changelog

All notable changes to the Synod player. Every `synodlang` repository shares MAJOR.MINOR with the language version.

## v0.3.0 — 2026-10-29

Implements Synod 0.3 (themes, richer drawing).

### Added

- Scene format 0.3, read by the rules of the formats guide: the top-level `style` and `camera`; the kinds `icon` (the 16-icon set, `src/render/icons.json`, checked against dsl by `scripts/sync-icons.ts`) and `counter` (rolling digits); the key properties `curve`, `trail`, `dash`, `draw`, `halo`, `icon`, `count`, `role` and `face`; the effects `indicate`, `flash`, `circumscribe`, `ripple` and `sweep`. Old 0.2 scenes load unchanged.
- Style: stroke width, glow, drop shadow, vignette (drawn last, in canvas space), type roles and faces with sizes, weights and tracking, spring easing for `x`, `y`, `scale`, `rotation` and the camera, camera keys with idle drift (hit testing inverts letterbox, camera and drift).
- Sketch: every outline wobbles by a seeded value noise (FNV-1a-32 of the shape id, mulberry32, smoothstep), twice at alpha 1 and 0.6; stable in time, cached per shape.
- Trails (8 ghosts), Bezier curves, dashes, partial draw, halo, icon morph.
- Fonts: the closed set Inter, JetBrains Mono, Source Serif 4 and Shantell Sans (SIL OFL 1.1, variable woff2, sources and checksums in `fonts/README.md`), the release asset `synod-player-fonts-<tag>.tar.gz`, `options.fontBase` and `player.fontsReady()`.
- Hit testing also answers icons and counters (like a filled shape).
- Tests: hand-made scenes for every new key, kind, effect and style value, display-list and WebKit pixel goldens for them, the compiler's 0.3 scenes, and a 50-node, 200-message stress scene with sketch 1 and trails (JS frame work p99 under 4 ms).

### Fixed

- Counter: a column of 100s or more rolled by the wrong amount (the whole number 199 drew the hundreds column 0.9 of the way to 2). Column `k` now rolls by `max(0, (|count| mod 10^k) - (10^k - 1))`, as the formats guide says, so a whole number draws crisp.

### Changed

- Example scenes, frame and hit goldens, and the `markers`, `paxos` and `raft` pixel snapshots follow the lesson note in the top band (`y` 40) and `paxos` writing its state to disk.
- The vendored scenes follow the compiler's wider ring (layout centre (520, 315)) and 24-character state rows; the builder scene `state-rows-long` is new, and the goldens and the WebKit snapshots of the scenes that changed are regenerated.
- The default sans is Inter (was the system font). Every display-list golden differs only in its `font = ...` line; the WebKit pixel snapshots are regenerated.
- A counter column rolls only while the column below is on its last digit (an odometer), so a whole number is drawn crisp.
- The bundle budget is 96 KB minified and 32 KB gzip (was 48 KB and 16 KB): the icon set and the new drawing code.
- The player redraws the last drawn time, not the clock, when fonts finish loading.

## v0.2.1 — 2026-10-22

Implements Synod 0.2.

### Added

- `player.hitTest(x, y)` and `player.nodeBounds()`, plus `hitTestScene` and `nodeBoundsScene` for any host. A hit is the topmost drawn circle or rect whose own or enclosing group's `node` or `msg` is set, with 4 px slop; labels and lines never hit. Rules: decision 84 and "Hit testing (readers)" in the formats guide.
- The loader keeps the new additive keys `node` and `msg` on shapes and `choices` on pause markers, and drops an invalid one with a warning. Marker events, including those posted by the WebKit bridge, carry `choices`. Older scenes load as before and never hit. Drawing is unchanged: the display-list goldens are byte-identical.
- The vendored scenes are re-synced from compiler v0.2.5, so they now carry `node`, `msg` and pause `choices`; the hit goldens in `test/golden/hits` are filled in from them.

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
