// Browser tests. Pixel goldens run in WebKit and must be generated inside the pinned
// Playwright container (npm run test:pixel:docker) so they match CI.
//
//   chromium: smoke test of the demo (no console errors; play, seek and end events)
//   webkit:   pixel goldens of the IIFE bundle, and the ?bench=1 frame-work gate

import { defineConfig, devices } from "@playwright/test";

// Local convenience: PW_CHROMIUM_CHANNEL=chrome uses an installed Chrome for the smoke test.
const channel = process.env.PW_CHROMIUM_CHANNEL;

export default defineConfig({
  testDir: "test/pixel",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.1 },
  },
  webServer: {
    command: "node scripts/serve.ts",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "webkit",
      testMatch: ["pixel.spec.ts", "bench.spec.ts"],
      use: { ...devices["Desktop Safari"], viewport: { width: 1600, height: 1000 } },
    },
    {
      name: "chromium",
      testMatch: "smoke.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        ...(channel ? { channel } : {}),
      },
    },
  ],
});
