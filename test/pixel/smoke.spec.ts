// Chromium smoke test of the demo: no console errors; play, seek and end events fire.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { servePage } from "./route.ts";

const root = join(import.meta.dirname, "..", "..");

test("demo loads, plays, seeks and ends without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    // The demo server has no favicon; that 404 is not a player error.
    if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://127.0.0.1:5173/?autoplay=0&scene=scenes/markers.json");
  const readout = page.locator("#readout");
  await expect(readout).toHaveText(/^0 \/ \d+ ms$/);
  const duration = Number(((await readout.textContent()) ?? "").split("/")[1]?.replace(/\D/g, ""));
  expect(duration).toBeGreaterThan(0);

  // Seek: the scrubber moves time.
  await page.locator("#scrub").fill("500");
  await expect(readout).toHaveText(new RegExp(`^500 / ${duration} ms$`));

  // Play at 4x with loop off: the button flips to Pause and then, at the end, back to Play.
  await page.locator("#rate").selectOption("4");
  await page.locator("#scrub").fill(String(Math.max(0, duration - 400)));
  await page.locator("#play").click();
  await expect(page.locator("#play")).toHaveText(/Pause/);
  await expect(readout).toHaveText(new RegExp(`^${duration} / ${duration} ms$`), {
    timeout: 10_000,
  });
  await expect(page.locator("#play")).toHaveText(/Play/);

  const canvas = page.locator("#canvas");
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test("IIFE bundle plays: play, time, marker, pause(end) events fire; seek fires no marker", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await servePage(page);
  const scene = readFileSync(join(root, "test", "scenes", "builder", "markers.json"), "utf8");
  const log = await page.evaluate(async (text) => {
    // biome-ignore lint/suspicious/noExplicitAny: the IIFE global is untyped here
    const SP = (window as any).SynodPlayer;
    const canvas = document.getElementById("c") as HTMLCanvasElement;
    const player = SP.createPlayer(canvas, text, { autoResize: false, pixelRatio: 1, rate: 4 });
    player.resize(1600, 1000, 1);
    const events: string[] = [];
    player.on("play", () => events.push("play"));
    player.on("marker", () => events.push("marker"));
    player.on("pause", (e: { reason: string }) => events.push(`pause:${e.reason}`));
    player.seek(player.duration / 2);
    const afterSeek = events.slice();
    player.seek(0);
    const ended = new Promise<void>((resolve) => {
      player.on("pause", (e: { reason: string }) => e.reason === "end" && resolve());
    });
    player.play();
    await ended;
    const out = { afterSeek, events, time: player.time, duration: player.duration };
    player.destroy();
    return out;
  }, scene);
  expect(log.afterSeek).toEqual([]);
  expect(log.events[0]).toBe("play");
  expect(log.events).toContain("marker");
  expect(log.events.at(-1)).toBe("pause:end");
  expect(log.time).toBe(log.duration);
  expect(errors).toEqual([]);
});
