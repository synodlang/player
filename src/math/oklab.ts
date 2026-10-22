// sRGB <-> OKLab (Bjorn Ottosson's matrices) on packed 0xRRGGBB integers.
// Nothing here allocates.

/** Parse "#rrggbb" into a packed 0xRRGGBB integer, or -1 when malformed. */
export function parseHex(hex: string): number {
  if (hex.length !== 7 || hex.charCodeAt(0) !== 35) return -1;
  let v = 0;
  for (let i = 1; i < 7; i++) {
    const c = hex.charCodeAt(i);
    let d: number;
    if (c >= 48 && c <= 57) d = c - 48;
    else if (c >= 97 && c <= 102) d = c - 87;
    else if (c >= 65 && c <= 70) d = c - 55;
    else return -1;
    v = v * 16 + d;
  }
  return v;
}

const HEX = "0123456789abcdef";

/** "#rrggbb" (lowercase) of a packed color. */
export function toHex(rgb: number): string {
  let s = "#";
  for (let sh = 20; sh >= 0; sh -= 4) s += HEX[(rgb >> sh) & 15];
  return s;
}

function toLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(x: number): number {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  const v = Math.round(c * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Writes L, a, b of the packed sRGB color into out[o], out[o + 1], out[o + 2]. */
export function rgbToOklab(rgb: number, out: Float64Array, o: number): void {
  const r = toLinear((rgb >> 16) & 255);
  const g = toLinear((rgb >> 8) & 255);
  const b = toLinear(rgb & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/** Packed sRGB of an OKLab color, clamped to the gamut and rounded to 8 bits. */
export function oklabToRgb(L: number, a: number, b: number): number {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return (r << 16) | (g << 8) | bl;
}

/**
 * The color at eased fraction e between two OKLab colors stored at lab[i..i+2]
 * and lab[j..j+2]: lerp each of L, a, b, convert back, clamp, round.
 */
export function mixOklab(lab: Float64Array, i: number, j: number, e: number): number {
  const L0 = lab[i] as number;
  const a0 = lab[i + 1] as number;
  const b0 = lab[i + 2] as number;
  return oklabToRgb(
    L0 + ((lab[j] as number) - L0) * e,
    a0 + ((lab[j + 1] as number) - a0) * e,
    b0 + ((lab[j + 2] as number) - b0) * e,
  );
}
