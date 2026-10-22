import assert from "node:assert/strict";
import { test } from "node:test";
import { Clock, clampRate } from "../../src/player/clock.ts";

function setup(duration = 1000) {
  let t = 0;
  const clock = new Clock(() => t);
  clock.setDuration(duration);
  return {
    clock,
    wall(ms: number) {
      t = ms;
    },
  };
}

test("clock advances with wall time at rate 1", () => {
  const { clock, wall } = setup();
  clock.start();
  wall(250);
  const s = clock.advance();
  assert.deepEqual(s, { from: 0, to: 250, wrapped: false, ended: false });
  assert.equal(clock.time, 250);
});

test("clock respects rate and re-anchors on rate change", () => {
  const { clock, wall } = setup();
  clock.rate = 2;
  clock.start();
  wall(100);
  clock.advance();
  assert.equal(clock.time, 200);
  clock.setRate(0.5);
  wall(300);
  clock.advance();
  assert.equal(clock.time, 300);
});

test("clampRate keeps 0.25..4 and survives junk", () => {
  assert.equal(clampRate(0), 0.25);
  assert.equal(clampRate(100), 4);
  assert.equal(clampRate(1.5), 1.5);
  assert.equal(clampRate(Number.NaN), 1);
});

test("clock clamps seek and pauses at the end", () => {
  const { clock, wall } = setup(500);
  clock.seek(-5);
  assert.equal(clock.time, 0);
  clock.seek(9999);
  assert.equal(clock.time, 500);
  clock.seek(400);
  clock.start();
  wall(1000);
  const s = clock.advance();
  assert.deepEqual(s, { from: 400, to: 500, wrapped: false, ended: true });
  assert.equal(clock.playing, false);
  assert.equal(clock.advance(), null);
});

test("clock loops and wraps the time", () => {
  const { clock, wall } = setup(1000);
  clock.loop = true;
  clock.seek(900);
  clock.start();
  wall(300);
  const s = clock.advance();
  assert.equal(s?.wrapped, true);
  assert.equal(s?.ended, false);
  assert.equal(clock.time, 200);
  wall(400);
  clock.advance();
  assert.equal(clock.time, 300);
  assert.equal(clock.playing, true);
});

test("a zero-length scene ends at once even with loop", () => {
  const { clock, wall } = setup(0);
  clock.loop = true;
  clock.start();
  wall(10);
  assert.equal(clock.advance()?.ended, true);
});

test("time never goes backwards", () => {
  const { clock, wall } = setup();
  wall(100);
  clock.start();
  wall(50);
  clock.advance();
  assert.equal(clock.time, 0);
});
