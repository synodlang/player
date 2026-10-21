# player

The Synod player: a TypeScript canvas library that plays `scene.json` and draws a Synod program as an animation.

[![ci](https://github.com/synodlang/player/actions/workflows/ci.yml/badge.svg)](https://github.com/synodlang/player/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Status: designed, not yet written.** This repository has no code yet. The player is milestone M7 in the [roadmap](https://github.com/synodlang/dsl/blob/main/implementation/10-roadmap.md), and it comes after the scene builder (M5) and the WebAssembly build (M6) in the compiler. What follows describes what the player will do and how, as set out in the design documents.

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
| **player** (this repository) | Canvas library that plays `scene.json` | Planned (M7) |
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

## Planned API

The documents name these entry points. The exact signatures will be fixed when the library is written.

- Load a `scene.json` into a canvas and play, pause, seek and set the pace (0.25x to 4x).
- `renderFrame(at)`: draw the scene at one presentation time. The Mac app uses it to export video at fixed timesteps, offscreen.
- Events and queries for the host: the current time, the markers (`pause`, `caption`, `broken`), and the jump from a trace fact to its time.
- A bridge the Mac app can call from Swift to hand over a scene.

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

There is nothing to build yet. Until the library exists, the most useful contributions are to the contract itself: read [04-formats.md](https://github.com/synodlang/dsl/blob/main/implementation/04-formats.md) and open an issue or a pull request in [dsl](https://github.com/synodlang/dsl) if something is unclear. Changes to the scene format start there. Once the library exists, this repository will have a TypeScript build and tests, and its CI will check them. The CI today checks line endings, trailing spaces and the final newline.

Every `synodlang` repository shares MAJOR.MINOR with the language version, so this one will release as `v0.2.x`.

## Why Synod

Synod is named after the Synod protocol, the core consensus algorithm in Leslie Lamport's paper "The Part-Time Parliament" (ACM Transactions on Computer Systems, 1998; first submitted in 1990). The paper tells it as the story of the parliament of the ancient Greek island of Paxos, whose part-time legislators could agree on decrees although they came and went; today the algorithm is known as Paxos. Lamport later explained it plainly in "Paxos Made Simple" (2001), and in 2013 he received the ACM A.M. Turing Award for fundamental contributions to the theory and practice of distributed and concurrent systems. His "Time, Clocks, and the Ordering of Events in a Distributed System" (1978) and his TLA+ specification language shaped how we reason about such systems. We are grateful for his work, and we hope Synod honours it by making these ideas easier to watch and understand. The player is how you watch such protocols unfold.

Implements the Synod language specification v0.2.1: https://github.com/synodlang/dsl

Licensed under the [Apache License 2.0](LICENSE).
