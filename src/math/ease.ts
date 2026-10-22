// The house easing curve. The operation order is the builder's
// (compiler/internal/scene/geom.go smootherstep) so results agree bit for bit.

/** smootherstep(u) = u^3 (u (6u - 15) + 10) for u in [0, 1]. */
export function smootherstep(u: number): number {
  const inner = u * (u * 6 - 15) + 10;
  return u * u * (u * inner);
}
