// Release gate: the tag must equal "v" + the package version, and CHANGELOG.md must
// have a non-empty section for it.
//
//   node scripts/check-version.ts v0.2.0

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notes } from "./notes.ts";

const root = join(import.meta.dirname, "..");

export function checkVersion(tag: string, version: string, changelog: string): void {
  if (tag !== `v${version}`) {
    throw new Error(`tag ${tag} does not match package.json version ${version} (want v${version})`);
  }
  notes(changelog, tag);
}

if (import.meta.main) {
  try {
    const tag = process.argv[2];
    if (!tag) throw new Error("usage: node scripts/check-version.ts <tag>");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    checkVersion(tag, pkg.version, readFileSync(join(root, "CHANGELOG.md"), "utf8"));
    console.log(`ok: ${tag} matches package.json and CHANGELOG.md`);
  } catch (e) {
    process.stderr.write(`check-version: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
