// A separate, deliberately plain implementation: matrices as arrays, Math.pow,
// no shared code with src/math/oklab.ts.
const M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const M2 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const M2INV = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const M1INV = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];
const mul = (m: number[][], v: number[]): number[] =>
  m.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);

export function plainToLab(hex: string): number[] {
  const lin = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return mul(
    M2,
    mul(M1, lin).map((x) => x ** (1 / 3)),
  );
}

export function plainToHex(lab: number[]): string {
  const lin = mul(
    M1INV,
    mul(M2INV, lab).map((x) => x * x * x),
  );
  return `#${lin
    .map((x) => {
      const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.min(255, Math.max(0, Math.round(c * 255)))
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}
