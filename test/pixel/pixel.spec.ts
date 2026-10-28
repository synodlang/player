// Pixel goldens (secondary check; display-list goldens are the primary gate).
// Each frame is rendered by the IIFE bundle into a 1600x1000 canvas at DPR 1.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { servePage } from "./route.ts";

const root = join(import.meta.dirname, "..", "..");
type Group = "examples" | "builder" | "handmade";
const frames: { group: Group; name: string; at: number[] }[] = [
  { group: "builder", name: "group", at: [0.35, 0.8] },
  { group: "builder", name: "markers", at: [0.45, 0.7] },
  { group: "builder", name: "flight-drop", at: [0.3, 0.7] },
  { group: "builder", name: "reactive-morph", at: [0.4, 0.8] },
  { group: "builder", name: "color-naming", at: [0.4, 0.8] },
  { group: "builder", name: "travel", at: [0.35, 0.7] },
  { group: "builder", name: "replacement", at: [0.35, 0.75] },
  { group: "examples", name: "paxos", at: [0.25, 0.5, 0.75] },
  { group: "examples", name: "raft", at: [0.3, 0.7] },
  { group: "handmade", name: "lines", at: [0.5] },
  { group: "handmade", name: "rotation-scale", at: [0.5] },
  // Synod 0.3
  { group: "handmade", name: "old-format-0.2", at: [0.5] },
  { group: "handmade", name: "draw", at: [0.5] },
  { group: "handmade", name: "halo", at: [0.5] },
  { group: "handmade", name: "icon-morph", at: [0.4] },
  { group: "handmade", name: "counter", at: [0.6] },
  { group: "handmade", name: "curve", at: [0.5] },
  { group: "handmade", name: "trail", at: [0.55] },
  { group: "handmade", name: "dash", at: [0.4] },
  { group: "handmade", name: "role-face", at: [0.8] },
  { group: "handmade", name: "effect-indicate", at: [0.4] },
  { group: "handmade", name: "effect-flash", at: [0.4] },
  { group: "handmade", name: "effect-circumscribe", at: [0.4] },
  { group: "handmade", name: "effect-ripple", at: [0.4] },
  { group: "handmade", name: "effect-sweep", at: [0.4] },
  { group: "handmade", name: "effect-glow", at: [0.4] },
  { group: "handmade", name: "effect-group", at: [0.4] },
  { group: "handmade", name: "style-sketch", at: [0.5] },
  { group: "handmade", name: "style-sketch-half", at: [0.5] },
  { group: "handmade", name: "style-shadow", at: [0.5] },
  { group: "handmade", name: "style-vignette", at: [0.5] },
  { group: "handmade", name: "style-glow", at: [0.5] },
  { group: "handmade", name: "style-stroke", at: [0.5] },
  { group: "handmade", name: "style-type", at: [0.5] },
  { group: "handmade", name: "style-spring", at: [0.4] },
  { group: "handmade", name: "camera-zoom", at: [0.55] },
  { group: "handmade", name: "style-drift", at: [0.5] },
  { group: "builder", name: "theme-sketch", at: [0.8] },
  { group: "builder", name: "reveal-halo", at: [0.4] },
  { group: "builder", name: "icons-counter", at: [0.5] },
  { group: "builder", name: "effects", at: [0.5] },
];

test.beforeEach(async ({ page }) => {
  await servePage(page);
});

for (const f of frames) {
  for (const frac of f.at) {
    const label = `${f.name}-${Math.round(frac * 100)}`;
    test(`pixels: ${label}`, async ({ page }) => {
      const text = readFileSync(join(root, "test", "scenes", f.group, `${f.name}.json`), "utf8");
      await page.evaluate(
        ([t, x]) =>
          (window as unknown as { draw(a: string, b: number): Promise<number> }).draw(t, x),
        [text, frac] as const,
      );
      await expect(page.locator("#c")).toHaveScreenshot(`${label}.png`);
    });
  }
}
