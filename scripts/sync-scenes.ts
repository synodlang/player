// Vendors the compiler's golden scenes byte for byte:
//   <compiler>/testdata/run/examples/<name>/scene.json        -> test/scenes/examples/<name>.json
//   <compiler>/internal/scene/testdata/scene/<name>/scene.json -> test/scenes/builder/<name>.json
//
// usage: node scripts/sync-scenes.ts <compilerDir> [--check]
// --check writes nothing and exits 1 when a vendored file differs, is missing or is extra.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const check = args.includes("--check");
const dirs = args.filter((a) => !a.startsWith("--"));
if (dirs.length !== 1) {
  process.stderr.write("usage: node scripts/sync-scenes.ts <compilerDir> [--check]\n");
  process.exit(2);
}
const compiler = resolve(dirs[0] as string);
const root = resolve(import.meta.dirname, "..");

const sources: { sub: string; dir: string }[] = [
  { sub: "examples", dir: join(compiler, "testdata", "run", "examples") },
  { sub: "builder", dir: join(compiler, "internal", "scene", "testdata", "scene") },
];

let problems = 0;
let count = 0;
for (const { sub, dir } of sources) {
  if (!existsSync(dir)) {
    process.stderr.write(`missing ${dir}\n`);
    process.exit(2);
  }
  const dest = join(root, "test", "scenes", sub);
  const want = new Set<string>();
  for (const name of readdirSync(dir).sort()) {
    const src = join(dir, name, "scene.json");
    if (!existsSync(src)) continue;
    const text = readFileSync(src, "utf8");
    const file = `${name}.json`;
    want.add(file);
    count++;
    const target = join(dest, file);
    const have = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (have === text) continue;
    if (check) {
      process.stderr.write(
        `${have === null ? "missing" : "differs"}: test/scenes/${sub}/${file}\n`,
      );
      problems++;
    } else {
      mkdirSync(dest, { recursive: true });
      writeFileSync(target, text);
      process.stdout.write(`wrote test/scenes/${sub}/${file}\n`);
    }
  }
  if (existsSync(dest)) {
    for (const file of readdirSync(dest)) {
      if (!want.has(file)) {
        process.stderr.write(
          `${check ? "extra" : "stale (delete by hand)"}: test/scenes/${sub}/${file}\n`,
        );
        if (check) problems++;
      }
    }
  }
}
if (check) {
  if (problems > 0) process.exit(1);
  process.stdout.write(`${count} vendored scenes match ${compiler}\n`);
}
