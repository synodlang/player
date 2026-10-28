// The icon set is normative in dsl (implementation/icons.json); the player ships a copy at
// src/render/icons.json. usage: node scripts/sync-icons.ts <dslDir> [--check]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const check = args.includes("--check");
const dirs = args.filter((a) => !a.startsWith("--"));
if (dirs.length !== 1) {
  process.stderr.write("usage: node scripts/sync-icons.ts <dslDir> [--check]\n");
  process.exit(2);
}
const src = join(resolve(dirs[0] as string), "implementation", "icons.json");
const dest = join(import.meta.dirname, "..", "src", "render", "icons.json");
if (!existsSync(src)) {
  process.stderr.write(`missing ${src}\n`);
  process.exit(2);
}
const want = readFileSync(src, "utf8");
const have = existsSync(dest) ? readFileSync(dest, "utf8") : null;
if (have === want) {
  process.stdout.write("icons.json matches dsl\n");
} else if (check) {
  process.stderr.write("src/render/icons.json differs from dsl implementation/icons.json\n");
  process.exit(1);
} else {
  writeFileSync(dest, want);
  process.stdout.write("wrote src/render/icons.json\n");
}
