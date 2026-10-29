// Gate 1: the display lists of all golden scenes match test/golden/frames exactly.
// A mismatch writes the actual output to test-results/golden/ for diffing.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { FRAMES_DIR, generateGoldens } from "../scripts/update-goldens.ts";

const ACTUAL_DIR = join(import.meta.dirname, "..", "test-results", "golden");
const goldens = generateGoldens();

test("golden set covers 38 scenes and the letterbox case", () => {
  const files = goldens.map((g) => g.file);
  // 29 builder, 27 hand-made 0.3 scenes + paxos, ring, tcp, twopc, wal as text; hashes.txt; one letterbox file
  assert.equal(files.length, 29 + 5 + 27 + 1 + 1);
  assert.ok(files.includes("hashes.txt"));
  const hashes = goldens.find((g) => g.file === "hashes.txt")?.content ?? "";
  for (const n of ["cassandra", "gossip", "raft", "webapp"]) assert.ok(hashes.includes(`${n} at=`));
  const lb = goldens.find((g) => g.file.startsWith("letterbox-"))?.content ?? "";
  assert.ok(lb.includes("# view 1000x1000 dpr 2"));
  assert.ok(lb.includes("setTransform 1.92 0.00 0.00 1.92 0.00 375.00"));
});

for (const g of goldens) {
  test(`golden ${g.file}`, () => {
    let expected: string;
    try {
      expected = readFileSync(join(FRAMES_DIR, g.file), "utf8");
    } catch {
      expected = "";
    }
    if (expected !== g.content) {
      const out = join(ACTUAL_DIR, g.file);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, g.content);
      assert.fail(`${g.file} differs from the golden; actual written to ${out}`);
    }
  });
}
