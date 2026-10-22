// Browser frame-work gate: the demo's ?bench=1 overlay plays raft for 10 s in WebKit.
// JS frame work p95 must stay within 6 ms (a CI runner has no 120 Hz display; Safari
// numbers on Apple silicon are checked by hand).

import { expect, test } from "@playwright/test";

test("webkit bench: JS frame work p95 <= 6 ms", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("http://127.0.0.1:5173/?bench=1&scene=scenes/raft.json");
  await page.waitForFunction(() => (window as unknown as { __bench?: unknown }).__bench, null, {
    timeout: 40_000,
  });
  const r = (await page.evaluate(() => (window as unknown as { __bench: unknown }).__bench)) as {
    frames: number;
    rafP50: number;
    rafP95: number;
    workP50: number;
    workP95: number;
    workP99: number;
    dropped: number;
  };
  console.log(`bench: ${JSON.stringify(r)}`);
  expect(r.frames).toBeGreaterThan(100);
  expect(r.workP95).toBeLessThanOrEqual(6);
});
