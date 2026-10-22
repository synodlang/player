import assert from "node:assert/strict";
import { test } from "node:test";
import { mixOklab, oklabToRgb, parseHex, rgbToOklab, toHex } from "../../src/math/oklab.ts";
import { BRAND_THEME } from "../../src/scene/load.ts";
import { plainToHex, plainToLab } from "../helpers/plain-oklab.ts";

test("parseHex and toHex", () => {
  assert.equal(parseHex("#F4A340"), 0xf4a340);
  assert.equal(parseHex("#f4a340"), 0xf4a340);
  for (const bad of ["", "#fff", "F4A340", "#gggggg", "#f4a3400", "red"]) {
    assert.equal(parseHex(bad), -1, bad);
  }
  assert.equal(toHex(0x0a0b0c), "#0a0b0c");
  assert.equal(toHex(0xffffff), "#ffffff");
});

test("OKLab round-trips the eight theme colors exactly", () => {
  const lab = new Float64Array(3);
  for (const [name, hex] of Object.entries(BRAND_THEME)) {
    const rgb = parseHex(hex);
    rgbToOklab(rgb, lab, 0);
    assert.equal(oklabToRgb(lab[0] as number, lab[1] as number, lab[2] as number), rgb, name);
  }
});

test("OKLab round-trips a sweep of sRGB colors exactly", () => {
  const lab = new Float64Array(3);
  for (let r = 0; r < 256; r += 15) {
    for (let g = 0; g < 256; g += 15) {
      for (let b = 0; b < 256; b += 15) {
        const rgb = (r << 16) | (g << 8) | b;
        rgbToOklab(rgb, lab, 0);
        assert.equal(oklabToRgb(lab[0] as number, lab[1] as number, lab[2] as number), rgb);
      }
    }
  }
});

test("white, black and Ottosson's reference values", () => {
  const lab = new Float64Array(3);
  rgbToOklab(0xffffff, lab, 0);
  assert.ok(Math.abs((lab[0] as number) - 1) < 1e-6);
  assert.ok(Math.abs(lab[1] as number) < 1e-4 && Math.abs(lab[2] as number) < 1e-4);
  rgbToOklab(0x000000, lab, 0);
  assert.deepEqual([...lab], [0, 0, 0]);
  rgbToOklab(0xff0000, lab, 0); // reference: L 0.6280, a 0.2249, b 0.1258
  assert.ok(Math.abs((lab[0] as number) - 0.628) < 1e-3);
  assert.ok(Math.abs((lab[1] as number) - 0.2249) < 1e-3);
  assert.ok(Math.abs((lab[2] as number) - 0.1258) < 1e-3);
});

test("Ink to Critical midpoint is #efae9d", () => {
  // #efae9d was computed independently in Python (cube-root OKLab, lerp L, a, b
  // at 0.5, back to sRGB, round). The plain implementation above agrees.
  const a = plainToLab(BRAND_THEME.Ink as string);
  const b = plainToLab(BRAND_THEME.Critical as string);
  const mid = a.map((x, i) => (x + (b[i] as number)) / 2);
  assert.equal(plainToHex(mid), "#efae9d");

  const lab = new Float64Array(6);
  rgbToOklab(parseHex(BRAND_THEME.Ink as string), lab, 0);
  rgbToOklab(parseHex(BRAND_THEME.Critical as string), lab, 3);
  assert.equal(toHex(mixOklab(lab, 0, 3, 0.5)), "#efae9d");
  assert.equal(toHex(mixOklab(lab, 0, 3, 0)), "#ede9e1");
  assert.equal(toHex(mixOklab(lab, 0, 3, 1)), "#e86f5a");
  // other fractions agree with the plain implementation too
  for (const e of [0.1, 0.25, 0.75, 0.9]) {
    const m = a.map((x, i) => x + ((b[i] as number) - x) * e);
    assert.equal(toHex(mixOklab(lab, 0, 3, e)), plainToHex(m), `e=${e}`);
  }
});

test("mixing in OKLab differs from averaging sRGB channels", () => {
  const lab = new Float64Array(6);
  rgbToOklab(0xede9e1, lab, 0);
  rgbToOklab(0xe86f5a, lab, 3);
  const srgbMid = toHex(
    (((0xed + 0xe8) / 2) << 16) |
      (Math.round((0xe9 + 0x6f) / 2) << 8) |
      Math.round((0xe1 + 0x5a) / 2),
  );
  assert.notEqual(toHex(mixOklab(lab, 0, 3, 0.5)), srgbMid);
});
