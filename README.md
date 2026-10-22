# player

The Synod player: a TypeScript canvas library that plays `scene.json` and draws a Synod program as an animation.

[![ci](https://github.com/synodlang/player/actions/workflows/ci.yml/badge.svg)](https://github.com/synodlang/player/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Status: v0.2.0, implements Synod 0.2.** The player is milestone M7 in the [roadmap](https://github.com/synodlang/dsl/blob/main/implementation/10-roadmap.md). It reads `scene.json` from the scene builder (M5) and draws it on a canvas, in a browser, in a `WKWebView` or offscreen. It is a TypeScript library with no runtime dependencies, released as GitHub release assets (npm later). Numbers for Safari on Apple silicon at 120 Hz are still to be measured by hand.

## Where it fits

Synod programs are simulated by the compiler, which writes a trace. The scene builder turns the trace and the program's looks into `scene.json`. The player draws that file. Neither the app nor the site interprets Synod; both draw with the player.

```
.synod --> synod (compiler) --> trace.jsonl --> scene builder --> scene.json --> player
```

| Repository | What it is | Status |
| --- | --- | --- |
| [dsl](https://github.com/synodlang/dsl) | The language specification and implementation guides | Spec v0.2 |
| [compiler](https://github.com/synodlang/compiler) | The `synod` command: `fmt`, `check`, `run` | v0.2.2 released |
| [std](https://github.com/synodlang/std) | The standard library packages | In use by the compiler |
| [examples](https://github.com/synodlang/examples) | Sample programs and acceptance tests | Available |
| **player** (this repository) | Canvas library that plays `scene.json` | v0.2.0 |
| [mac-app](https://github.com/synodlang/mac-app) | The Mac app | Planned (M8, M9, M10) |
| [agent-skills](https://github.com/synodlang/agent-skills) | Skills for coding agents | Planned (M10) |
| [synodlang.github.io](https://github.com/synodlang/synodlang.github.io) | The website and documentation | Install page live; rest planned (M11) |
| [homebrew-tap](https://github.com/synodlang/homebrew-tap) | Homebrew formula for `synod` | Updated by compiler releases |
| [scoop-bucket](https://github.com/synodlang/scoop-bucket) | Scoop manifest for `synod` | Updated by compiler releases |
| [.github](https://github.com/synodlang/.github) | Organization profile and shared workflows | Available |

See [00-architecture.md](https://github.com/synodlang/dsl/blob/main/implementation/00-architecture.md) for the full data flow.

## The scene.json contract

The player reads `synod-scene/1` files. The format is defined in [04-formats.md](https://github.com/synodlang/dsl/blob/main/implementation/04-formats.md) and versioned in `dsl`. In short:

- The file has `duration` (milliseconds of presentation time), a `canvas` size, a `theme` of named colors, a list of `shapes`, a list of `markers` and a `trace` map.
- A shape has an `id`, a `kind` (`circle`, `rect`, `label`, `line` or `group`) and `props`. A `line` points at two shape ids with `from` and `to`.
- A shape has `keys`: keyframes with an `at` time. Each keyframe sets only the properties that change.
- Colors are theme names such as `Accent` or `Critical`. They are never raw hex values.
- `trace` maps each trace `seq` to its slot in presentation time, so the player can show simulated time and jump to a fact.
- Readers reject unknown major versions and ignore keys they do not know. Within a major version, keys are only added.

## Use it

Download the release assets from the [releases page](https://github.com/synodlang/player/releases). Check them with `SHA256SUMS`.

| Asset | Use |
| --- | --- |
| `synod-player-<tag>.js` | ES module (`import { createPlayer } from "./synod-player-v0.2.0.js"`) |
| `synod-player-<tag>.iife.js` | Classic script that defines `window.SynodPlayer` |
| `synod-player-<tag>.d.ts` | TypeScript declarations for the module |
| `SHA256SUMS` | Checksums of the three files above |

```html
<canvas id="stage" style="width: 100%; height: 100%"></canvas>
<script type="module">
  import { createPlayer } from "./synod-player-v0.2.0.js";
  const scene = await (await fetch("scene.json")).text();
  const player = createPlayer(document.getElementById("stage"), scene, { autoplay: true });
  player.on("marker", ({ marker }) => console.log(marker.kind, marker.at));
</script>
```

## API

- `loadScene(input)` parses and checks a `scene.json` (text or object) and returns `{ scene, warnings }`. It throws a `SceneError` with a `code` (`bad-json`, `unsupported-format`, `bad-scene`). Unknown fields are ignored, as the format requires.
- `compileScene(scene)` and `renderToContext(ctx, compiled, at, { width, height, pixelRatio })` draw one frame into any 2D context, such as an `OffscreenCanvas` for video export. They allocate nothing per frame.
- `createPlayer(canvas, scene, options)` returns a player. Options: `autoplay`, `loop`, `rate`, `stopAtPause` (Predict mode), `autoResize`, `pixelRatio`, `fonts`, `timeEventHz`.
- A player has `duration`, `time`, `playing`, `rate`, `markers`, `trace` and `warnings`, and the methods `play`, `pause`, `toggle`, `seek`, `setRate` (0.25 to 4), `setLoop`, `setStopAtPause`, `nextFact`, `prevFact`, `factAt`, `timeOfSeq`, `setScene`, `resize`, `renderFrame(at)`, `on(event, callback)` and `destroy`.
- `player.hitTest(x, y)` takes CSS pixels of the canvas and returns `{ id, kind, node, msg }` for the topmost drawn circle or rect that has a `node` or `msg`, or `null`. `player.nodeBounds()` returns `{ node, x, y, w, h }` per node. Both answer for the frame last drawn and follow the hit-testing rules of the formats guide (4 px slop, labels and lines never hit). The same rules are exported as `hitTestScene(compiled, at, view, x, y)` and `nodeBoundsScene(compiled, at, view)`. Scenes without `node` or `msg` (older compilers) never hit.
- Events: `time`, `marker` (fired when playback crosses a marker, never on seek; a pause marker carries `choices` when the question has them), `fact`, `play`, `pause` (with a reason of `user`, `marker` or `end`) and `scene`.
- `attachWebKitBridge(player)` posts these events to `window.webkit.messageHandlers.synodPlayer`. In the IIFE build, `SynodPlayer.mount("#stage", options)` creates a player and attaches the bridge; Swift then calls `player.setScene(jsonString)`.

The player bundles no fonts. Labels use the system sans font at 16 px, weight 500.

## Build, test and demo

Node 22.18 or newer is required.

```
npm ci
npm run check        # lint, typecheck, tests (including display-list goldens), build
npm run bench        # frame cost in Node with a no-op context (CI gates it)
npm run demo         # build and serve the demo at http://127.0.0.1:5173/
npm run test:pixel   # Playwright: WebKit pixel goldens, Chromium smoke, WebKit bench
```

`npm run build` writes `dist/synod-player.js`, `dist/synod-player.iife.js`, `dist/synod-player.d.ts` and `dist/demo/`, and fails when a bundle is over its size budget. Demo: open `?scene=<url>` to load a scene, `?bench=1` to measure frame timing.

The golden scenes in `test/scenes` are copied byte for byte from the compiler; `node scripts/sync-scenes.ts ../compiler --check` verifies them. Pixel goldens depend on the exact Playwright container, so they are generated only there (`npm run test:pixel:docker -- --update-snapshots`, or the `update` input of the ci workflow).

A release is made by pushing a tag `vX.Y.Z` that equals the version in `package.json` and has a matching section in `CHANGELOG.md`.

## Rendering rules

- **Interpolation.** Between two keyframes the player uses the smootherstep curve for every property.
- **Color.** Colors interpolate in OKLab, not in RGB.
- **Style.** Shapes have rounded corners and no soft shadows. The ground is a dark, 3Blue1Brown-style background taken from the theme.
- **Markers.** A `pause` marker comes from `lesson.Ask` and stops playback so the viewer can predict. A `caption` marker comes from `lesson.Note`. A `broken` marker shows an invariant that failed, at the moment it broke.
- **Determinism.** The same scene always draws the same frames.

## Who uses it

- The [Mac app](https://github.com/synodlang/mac-app) hosts the player in a `WKWebView`, offline, and renders frames from it for video export.
- The [site](https://github.com/synodlang/synodlang.github.io) runs `synod.wasm` in the page and plays the result with the player, so every example is editable and re-runnable.

## Targets

From the roadmap: every golden scene plays at 120fps in Safari and `WKWebView` on Apple silicon, with 50 nodes and 200 messages in flight, and frame-render golden images match.

## Contributing

Changes to the scene format start in [dsl](https://github.com/synodlang/dsl). Changes to the player go through pull requests here; run `npm run check` first. CI checks line endings, lint, types, tests, the bench, vendored scenes and the browser tests.

Every `synodlang` repository shares MAJOR.MINOR with the language version, so this one releases as `v0.2.x`.

## Why Synod

Synod is named after the Synod protocol, the core consensus algorithm in Leslie Lamport's paper "The Part-Time Parliament" (ACM Transactions on Computer Systems, 1998; first submitted in 1990). The paper tells it as the story of the parliament of the ancient Greek island of Paxos, whose part-time legislators could agree on decrees although they came and went; today the algorithm is known as Paxos. Lamport later explained it plainly in "Paxos Made Simple" (2001), and in 2013 he received the ACM A.M. Turing Award for fundamental contributions to the theory and practice of distributed and concurrent systems. His "Time, Clocks, and the Ordering of Events in a Distributed System" (1978) and his TLA+ specification language shaped how we reason about such systems. We are grateful for his work, and we hope Synod honours it by making these ideas easier to watch and understand. The player is how you watch such protocols unfold.

Implements Synod 0.2 (specification: https://github.com/synodlang/dsl).

Licensed under the [Apache License 2.0](LICENSE).
