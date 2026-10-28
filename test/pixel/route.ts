// Serves test/pixel/page.html and the IIFE bundle from a fake origin, so the pixel and
// smoke tests need no static server.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const root = join(import.meta.dirname, "..", "..");
export const ORIGIN = "http://pixel.test";

export async function servePage(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/page.html") {
      return route.fulfill({
        contentType: "text/html",
        body: readFileSync(join(root, "test", "pixel", "page.html"), "utf8"),
      });
    }
    if (path === "/synod-player.iife.js") {
      return route.fulfill({
        contentType: "text/javascript",
        body: readFileSync(join(root, "dist", "synod-player.iife.js"), "utf8"),
      });
    }
    if (path.startsWith("/fonts/") && /^\/fonts\/[A-Za-z0-9-]+\.woff2$/.test(path)) {
      return route.fulfill({
        contentType: "font/woff2",
        body: readFileSync(join(root, "fonts", path.slice("/fonts/".length))),
      });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
  await page.goto(`${ORIGIN}/page.html`);
}
