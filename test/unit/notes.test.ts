// Mirrors compiler/internal/release TestNotes and TestNotesUnreleasedByName.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkVersion } from "../../scripts/check-version.ts";
import { notes } from "../../scripts/notes.ts";

const CHANGELOG = `# Changelog

Intro text.

## Unreleased

### Added

- Something not yet released.

## v0.3.0

Bare heading.

## v0.2.0 — 2026-11-01


First paragraph.

### Fixed

- A bug.


## v0.1.0 — 2026-10-21

The last section.

- Item
## v0.0.1 — 2026-10-01

## v0.0.2 — 2026-10-02

x
`;

const cases: { name: string; tag: string; want?: string; err?: string }[] = [
  { name: "heading suffix", tag: "v0.2.0", want: "First paragraph.\n\n### Fixed\n\n- A bug.\n" },
  {
    name: "middle section ends at next heading",
    tag: "v0.1.0",
    want: "The last section.\n\n- Item\n",
  },
  { name: "last section", tag: "v0.0.2", want: "x\n" },
  { name: "bare heading", tag: "v0.3.0", want: "Bare heading.\n" },
  { name: "missing", tag: "v9.9.9", err: "no section" },
  { name: "empty", tag: "v0.0.1", err: "is empty" },
  { name: "unreleased not matched by version", tag: "Unreleased-x", err: "no section" },
  { name: "prefix of longer tag", tag: "v0.2", err: "no section" },
  { name: "empty tag", tag: "", err: "empty tag" },
];

for (const c of cases) {
  test(`notes: ${c.name}`, () => {
    if (c.err !== undefined) {
      assert.throws(
        () => notes(CHANGELOG, c.tag),
        (e: unknown) => String(e).includes(c.err!),
      );
      return;
    }
    assert.equal(notes(CHANGELOG, c.tag), c.want);
  });
}

test("notes: Unreleased by name", () => {
  assert.equal(notes("## Unreleased\n\nwip\n\n## v1.0.0\n\nfinal\n", "v1.0.0"), "final\n");
  assert.equal(notes("## Unreleased\n\nwip\n\n## v1.0.0\n\nfinal\n", "Unreleased"), "wip\n");
});

test("notes: heading at end of file and CRLF input", () => {
  assert.equal(notes("## v1.0.0\r\n\r\nhello\r\n", "v1.0.0"), "hello\n");
  assert.throws(
    () => notes("## v1.0.0", "v1.0.0"),
    (e: unknown) => String(e).includes("is empty"),
  );
  assert.equal(notes("## v1.0.0  \nbody", "v1.0.0"), "body\n");
});

test("check-version: tag must equal v + version and have a changelog section", () => {
  checkVersion("v0.2.0", "0.2.0", CHANGELOG);
  assert.throws(() => checkVersion("v0.2.1", "0.2.0", CHANGELOG));
  assert.throws(() => checkVersion("0.2.0", "0.2.0", CHANGELOG));
  assert.throws(() => checkVersion("v0.4.0", "0.4.0", CHANGELOG));
  assert.throws(() => checkVersion("v0.0.1", "0.0.1", CHANGELOG));
});
