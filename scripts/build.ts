// npm run build: dist/synod-player.js (ESM), dist/synod-player.iife.js,
// dist/synod-player.d.ts and dist/demo/. Fails when a bundle is over budget.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { buildDts } from "./dts.ts";
import { fontsTarGz } from "./fonts-tar.ts";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const MAX_BYTES = 96 * 1024;
const MAX_GZIP = 32 * 1024;

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const define = { __VERSION__: JSON.stringify(pkg.version) };
const common = {
  bundle: true,
  minify: true,
  target: "es2022",
  define,
  legalComments: "none",
  logLevel: "warning",
} as const;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  ...common,
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(dist, "synod-player.js"),
  format: "esm",
});
await build({
  ...common,
  entryPoints: [join(root, "src", "iife.ts")],
  outfile: join(dist, "synod-player.iife.js"),
  format: "iife",
  globalName: "SynodPlayer",
});
buildDts();

// Demo: bundled script, page, styles and the golden scenes.
const demo = join(dist, "demo");
await build({
  ...common,
  entryPoints: [join(root, "demo", "demo.ts")],
  outfile: join(demo, "demo.js"),
  format: "esm",
});
cpSync(join(root, "demo", "index.html"), join(demo, "index.html"));
cpSync(join(root, "demo", "demo.css"), join(demo, "demo.css"));
cpSync(join(root, "fonts"), join(demo, "fonts"), { recursive: true });
// The fonts asset: unpacked, its fonts/ folder is what options.fontBase points at.
writeFileSync(join(dist, "synod-player-fonts.tar.gz"), fontsTarGz(join(root, "fonts")));
const scenes = join(demo, "scenes");
mkdirSync(scenes, { recursive: true });
const names: string[] = [];
for (const group of ["examples", "builder", "handmade"]) {
  for (const f of readdirSync(join(root, "test", "scenes", group)).sort()) {
    if (!f.endsWith(".json")) continue;
    if (names.includes(f)) throw new Error(`scene name ${f} exists in two groups`);
    names.push(f);
    cpSync(join(root, "test", "scenes", group, f), join(scenes, f));
  }
}
// Examples first (they are the interesting ones), then builder scenes.
const examples = new Set(readdirSync(join(root, "test", "scenes", "examples")));
const ordered = [...names.filter((n) => examples.has(n)), ...names.filter((n) => !examples.has(n))];
writeFileSync(join(scenes, "index.json"), `${JSON.stringify(ordered)}\n`);

// The public declarations must typecheck for a consumer that sees only dist.
execFileSync(
  join(root, "node_modules", ".bin", "tsc"),
  ["-p", join(root, "test", "consumer", "tsconfig.json")],
  { stdio: "inherit" },
);

let failed = false;
for (const file of ["synod-player.js", "synod-player.iife.js"]) {
  const data = readFileSync(join(dist, file));
  const gz = gzipSync(data).length;
  const ok = data.length <= MAX_BYTES && gz <= MAX_GZIP;
  console.log(`${file}: ${data.length} bytes, ${gz} gzip${ok ? "" : "  OVER BUDGET"}`);
  if (!ok) failed = true;
}
if (failed) {
  console.error(`size budget: at most ${MAX_BYTES} bytes minified and ${MAX_GZIP} bytes gzip`);
  process.exit(1);
}
