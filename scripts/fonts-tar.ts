// Packs fonts/ (the four woff2 files, their OFL texts and the README) into a deterministic
// tar.gz: ustar headers with mtime 0, names in byte order, gzip level 9, so that two builds
// of the same files give the same bytes.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const enc = new TextEncoder();

function put(block: Uint8Array, at: number, text: string): void {
  block.set(enc.encode(text), at);
}

function header(name: string, size: number): Uint8Array {
  const h = new Uint8Array(512);
  put(h, 0, name);
  put(h, 100, "0000644\0");
  put(h, 108, "0000000\0");
  put(h, 116, "0000000\0");
  put(h, 124, `${size.toString(8).padStart(11, "0")}\0`);
  put(h, 136, "00000000000\0");
  put(h, 148, "        ");
  put(h, 156, "0");
  put(h, 257, "ustar\0");
  put(h, 263, "00");
  let sum = 0;
  for (const b of h) sum += b;
  put(h, 148, `${sum.toString(8).padStart(6, "0")}\0 `);
  return h;
}

/** The files of fonts/ as a tar.gz with a top-level folder `fonts/`. */
export function fontsTarGz(fontsDir: string): Uint8Array {
  const names = readdirSync(fontsDir)
    .filter((f) => f.endsWith(".woff2") || f.startsWith("OFL-") || f === "README.md")
    .sort();
  const parts: Uint8Array[] = [];
  for (const name of names) {
    const data = readFileSync(join(fontsDir, name));
    parts.push(header(`fonts/${name}`, data.length), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(1024));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return gzipSync(all, { level: 9 });
}
