// Build dist/synod-player.d.ts: tsc emits declarations into dist/types/, then
// types.d.ts and index.d.ts are concatenated into one self-contained file with
// the relative imports and re-exports removed.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");

/** Drop `import ... from "./x"` and `export ... from "./x"` statements (also multi-line). */
export function stripRelative(text: string): string {
  return text
    .replace(/^(?:import|export)\s[^;]*?\sfrom\s+["']\.[^"']*["'];?[ \t]*\n?/gm, "")
    .replace(/^export \{\};?[ \t]*\n?/gm, "");
}

export function buildDts(): void {
  rmSync(join(dist, "types"), { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const cfg = join(dist, "tsconfig.dts.json");
  writeFileSync(
    cfg,
    JSON.stringify({
      extends: "../tsconfig.json",
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: "types",
        rootDir: "../src",
      },
      include: ["../types", "../src"],
      exclude: [],
    }),
  );
  execFileSync(join(root, "node_modules", ".bin", "tsc"), ["-p", cfg], { stdio: "inherit" });
  const types = stripRelative(readFileSync(join(dist, "types", "types.d.ts"), "utf8"));
  const index = stripRelative(readFileSync(join(dist, "types", "index.d.ts"), "utf8"));
  const banner = "// Type declarations of @synodlang/player (generated; do not edit).\n\n";
  writeFileSync(
    join(dist, "synod-player.d.ts"),
    `${banner}${types.trimEnd()}\n\n${index.trimEnd()}\n`,
  );
  rmSync(join(dist, "types"), { recursive: true, force: true });
  rmSync(cfg, { force: true });
}

if (process.argv[1]?.endsWith("dts.ts")) buildDts();
