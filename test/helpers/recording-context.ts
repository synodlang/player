// A Ctx2D that logs every call and every property set as one line.
//   arc 800.00 500.00 10.00 0.00 6.28
//   fillStyle = #5cc8b8
// Numbers are written with toFixed(2), -0 as 0.

import type { Ctx2D } from "../../src/types.ts";

function num(v: number): string {
  const s = v.toFixed(2);
  return s === "-0.00" ? "0.00" : s;
}

export class RecordingContext implements Ctx2D {
  lines: string[] = [];
  #fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  #strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  #globalAlpha = 1;
  #lineWidth = 1;
  #lineCap: CanvasLineCap = "butt";
  #font = "10px sans-serif";
  #textAlign: CanvasTextAlign = "start";
  #textBaseline: CanvasTextBaseline = "alphabetic";
  #shadowBlur = 0;
  #shadowColor = "rgba(0, 0, 0, 0)";

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.#fillStyle;
  }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) {
    this.#fillStyle = v;
    this.lines.push(`fillStyle = ${String(v)}`);
  }
  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this.#strokeStyle;
  }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) {
    this.#strokeStyle = v;
    this.lines.push(`strokeStyle = ${String(v)}`);
  }
  get globalAlpha(): number {
    return this.#globalAlpha;
  }
  set globalAlpha(v: number) {
    this.#globalAlpha = v;
    this.lines.push(`globalAlpha = ${num(v)}`);
  }
  get lineWidth(): number {
    return this.#lineWidth;
  }
  set lineWidth(v: number) {
    this.#lineWidth = v;
    this.lines.push(`lineWidth = ${num(v)}`);
  }
  get lineCap(): CanvasLineCap {
    return this.#lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.#lineCap = v;
    this.lines.push(`lineCap = ${v}`);
  }
  get font(): string {
    return this.#font;
  }
  set font(v: string) {
    this.#font = v;
    this.lines.push(`font = ${v}`);
  }
  get textAlign(): CanvasTextAlign {
    return this.#textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.#textAlign = v;
    this.lines.push(`textAlign = ${v}`);
  }
  get textBaseline(): CanvasTextBaseline {
    return this.#textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.#textBaseline = v;
    this.lines.push(`textBaseline = ${v}`);
  }
  get shadowBlur(): number {
    return this.#shadowBlur;
  }
  set shadowBlur(v: number) {
    this.#shadowBlur = v;
    this.lines.push(`shadowBlur = ${num(v)}`);
  }
  get shadowColor(): string {
    return this.#shadowColor;
  }
  set shadowColor(v: string) {
    this.#shadowColor = v;
    this.lines.push(`shadowColor = ${v}`);
  }

  #op(name: string, ...args: number[]): void {
    this.lines.push(args.length ? `${name} ${args.map(num).join(" ")}` : name);
  }
  save(): void {
    this.#op("save");
  }
  restore(): void {
    this.#op("restore");
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.#op("setTransform", a, b, c, d, e, f);
  }
  beginPath(): void {
    this.#op("beginPath");
  }
  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.#op("arc", x, y, r, start, end);
  }
  moveTo(x: number, y: number): void {
    this.#op("moveTo", x, y);
  }
  lineTo(x: number, y: number): void {
    this.#op("lineTo", x, y);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    this.#op("arcTo", x1, y1, x2, y2, r);
  }
  closePath(): void {
    this.#op("closePath");
  }
  fill(): void {
    this.#op("fill");
  }
  stroke(): void {
    this.#op("stroke");
  }
  fillText(text: string, x: number, y: number): void {
    this.lines.push(`fillText ${JSON.stringify(text)} ${num(x)} ${num(y)}`);
  }
  clip(): void {
    this.#op("clip");
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.#op("rect", x, y, w, h);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.#op("fillRect", x, y, w, h);
  }

  text(): string {
    return this.lines.join("\n");
  }
}
