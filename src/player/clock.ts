// The playback clock: pure arithmetic over an injected now(). It never
// schedules anything; the player calls advance() once per frame.

export const MIN_RATE = 0.25;
export const MAX_RATE = 4;

export interface ClockStep {
  /** Time before this step. */
  from: number;
  /** Time after this step (already wrapped or clamped). */
  to: number;
  /** Playback went past the end and looped back to the start. */
  wrapped: boolean;
  /** Playback reached the end and stopped (no loop). */
  ended: boolean;
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

export class Clock {
  time = 0;
  rate = 1;
  duration = 0;
  loop = false;
  playing = false;
  private anchorAt = 0;
  private anchorWall = 0;
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  private anchor(): void {
    this.anchorAt = this.time;
    this.anchorWall = this.now();
  }

  /** Jump to `at` (clamped to [0, duration]) without moving the playing state. */
  seek(at: number): void {
    const t = Number.isFinite(at) ? at : 0;
    this.time = Math.min(this.duration, Math.max(0, t));
    this.anchor();
  }

  start(): void {
    this.playing = true;
    this.anchor();
  }

  /** Stop at the current `time` (the value of the last advance or seek). */
  stop(): void {
    this.playing = false;
  }

  setRate(rate: number): void {
    // Re-anchor at the last known time so only future frames use the new rate.
    // (The player advances before calling this.)
    this.anchor();
    this.rate = clampRate(rate);
  }

  setDuration(duration: number): void {
    this.duration = duration;
    if (this.time > duration) this.time = duration;
    this.anchor();
  }

  /** Move time to now. Returns null when not playing. */
  advance(): ClockStep | null {
    if (!this.playing) return null;
    const from = this.time;
    const raw = Math.max(from, this.anchorAt + (this.now() - this.anchorWall) * this.rate);
    if (raw < this.duration) {
      this.time = raw;
      return { from, to: raw, wrapped: false, ended: false };
    }
    if (this.loop && this.duration > 0) {
      if (raw === this.duration) {
        this.time = raw;
        return { from, to: raw, wrapped: false, ended: false };
      }
      this.time = raw % this.duration;
      this.anchor();
      return { from, to: this.time, wrapped: true, ended: false };
    }
    this.time = this.duration;
    this.playing = false;
    return { from, to: this.duration, wrapped: false, ended: true };
  }
}
