// The house easing curve. The operation order is the builder's
// (compiler/internal/scene/geom.go smootherstep) so results agree bit for bit.

/** smootherstep(u) = u^3 (u (6u - 15) + 10) for u in [0, 1]. */
export function smootherstep(u: number): number {
  const inner = u * (u * 6 - 15) + 10;
  return u * u * (u * inner);
}

/** The back-out overshoot constant of the spring curve. */
export const SPRING_C = 1.70158;

/** spring(u) = 1 + (c + 1)(u - 1)^3 + c (u - 1)^2: a polynomial, so identical in every engine. */
export function spring(u: number): number {
  const v = u - 1;
  return 1 + (SPRING_C + 1) * v * v * v + SPRING_C * v * v;
}
