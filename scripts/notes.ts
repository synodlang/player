// Prints the CHANGELOG.md section of a release, for use as GitHub release notes.
// Mirrors compiler/internal/release Notes.
//
//   node scripts/notes.ts --tag v0.2.0 [--changelog CHANGELOG.md]

import { readFileSync } from "node:fs";

function isHeading(line: string, tag: string): boolean {
  const trimmed = line.replace(/[ \t]+$/, "");
  const prefix = `## ${tag}`;
  if (!trimmed.startsWith(prefix)) return false;
  const rest = trimmed.slice(prefix.length);
  return rest === "" || rest.startsWith(" ") || rest.startsWith("\t");
}

/**
 * The body of the section whose level-2 heading is "## <tag>", optionally followed
 * by whitespace and more text (for example "## v0.2.0 — 2026-10-22"). The body runs
 * to the next "## " heading and is trimmed of leading and trailing blank lines.
 * Throws when the section is missing or has no content.
 */
export function notes(changelog: string, tag: string): string {
  if (tag === "") throw new Error("empty tag");
  const lines = changelog.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((l) => isHeading(l, tag));
  if (start < 0) throw new Error(`no section "## ${tag}" in changelog`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if ((lines[i] as string).startsWith("## ")) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .replace(/^[\n \t]+|[\n \t]+$/g, "");
  if (body === "") throw new Error(`section "## ${tag}" in changelog is empty`);
  return `${body}\n`;
}

/** Value of `--name value` in args, or undefined. */
export function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const tag = flag(args, "tag");
    if (!tag) throw new Error("need --tag");
    const path = flag(args, "changelog") ?? "CHANGELOG.md";
    process.stdout.write(notes(readFileSync(path, "utf8"), tag));
  } catch (e) {
    process.stderr.write(`notes: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
