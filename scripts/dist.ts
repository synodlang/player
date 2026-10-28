// Copies the built bundles to dist/release/ under release names.
//
//   node scripts/dist.ts --tag v0.2.0   (after npm run build)

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { flag } from "./notes.ts";

const root = join(import.meta.dirname, "..");
const tag = flag(process.argv.slice(2), "tag");
if (!tag) {
  process.stderr.write("usage: node scripts/dist.ts --tag <tag>\n");
  process.exit(2);
}
const out = join(root, "dist", "release");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files: [string, string][] = [
  ["synod-player.js", `synod-player-${tag}.js`],
  ["synod-player.iife.js", `synod-player-${tag}.iife.js`],
  ["synod-player.d.ts", `synod-player-${tag}.d.ts`],
  ["synod-player-fonts.tar.gz", `synod-player-fonts-${tag}.tar.gz`],
];
for (const [from, to] of files) {
  const src = join(root, "dist", from);
  if (!existsSync(src)) {
    process.stderr.write(`dist: missing ${src}; run npm run build first\n`);
    process.exit(1);
  }
  cpSync(src, join(out, to));
  console.log(`dist/release/${to}`);
}
