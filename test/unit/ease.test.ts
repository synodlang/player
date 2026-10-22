import assert from "node:assert/strict";
import { test } from "node:test";
import { smootherstep } from "../../src/math/ease.ts";

// compiler/internal/scene/geom.go, operation for operation (every product
// wrapped, no fused multiply-add):
//   inner := float64(u*float64(float64(u*6)-15)) + 10
//   return float64(float64(u*u) * float64(u*inner))
function goSmootherstep(u: number): number {
  const inner = u * (u * 6 - 15) + 10;
  return u * u * (u * inner);
}

test("smootherstep endpoints and midpoint", () => {
  assert.equal(smootherstep(0), 0);
  assert.equal(smootherstep(0.5), 0.5);
  assert.equal(smootherstep(1), 1);
});

test("smootherstep equals the Go formula on 11 points, bit for bit", () => {
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    assert.equal(smootherstep(u), goSmootherstep(u), `u=${u}`);
  }
});

test("smootherstep is the polynomial 6u^5 - 15u^4 + 10u^3 and monotonic", () => {
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const v = smootherstep(u);
    assert.ok(Math.abs(v - (6 * u ** 5 - 15 * u ** 4 + 10 * u ** 3)) < 1e-12);
    assert.ok(v >= prev);
    prev = v;
  }
  // symmetric: S(1 - u) = 1 - S(u)
  assert.ok(Math.abs(smootherstep(0.3) + smootherstep(0.7) - 1) < 1e-12);
});
