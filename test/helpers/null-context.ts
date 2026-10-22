// A Ctx2D that draws nothing, for benchmarks and allocation tests.

import type { Ctx2D } from "../../src/types.ts";

export class NullContext implements Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  globalAlpha = 1;
  lineWidth = 1;
  lineCap: CanvasLineCap = "butt";
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  shadowBlur = 0;
  shadowColor = "rgba(0, 0, 0, 0)";
  calls = 0;
  save(): void {
    this.calls++;
  }
  restore(): void {
    this.calls++;
  }
  setTransform(): void {
    this.calls++;
  }
  beginPath(): void {
    this.calls++;
  }
  arc(): void {
    this.calls++;
  }
  moveTo(): void {
    this.calls++;
  }
  lineTo(): void {
    this.calls++;
  }
  arcTo(): void {
    this.calls++;
  }
  closePath(): void {
    this.calls++;
  }
  fill(): void {
    this.calls++;
  }
  stroke(): void {
    this.calls++;
  }
  fillText(): void {
    this.calls++;
  }
  clip(): void {
    this.calls++;
  }
  rect(): void {
    this.calls++;
  }
  fillRect(): void {
    this.calls++;
  }
}
