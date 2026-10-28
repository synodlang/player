// Generates test/scenes/handmade/stress-50x200.json deterministically:
// 50 cards (group + rect + label + 3 state labels each) on a 10 x 5 grid and 200
// flights (group + circle + label each), all in the air together around 2000 ms.
//
// usage: node scripts/gen-stress.ts [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const THEME =
  '{"Paper":"#151A2E","Ink":"#EDE9E1","Line":"#3A4366","Quiet":"#8A90A8","Accent":"#F4A340","Good":"#5CC8B8","Warning":"#E8C35A","Critical":"#E86F5A"}';

let counter = 0;
function id(): string {
  counter++;
  return `s${(0xa00000000000 + counter * 0x1f3d5b).toString(16).padStart(12, "0")}`;
}

function cardPos(n: number): [number, number] {
  return [80 + (n % 10) * 160, 100 + Math.floor(n / 10) * 200];
}

/** `rich` is the 0.3 variant: sketch 1, outlined cards, trails on every flight, a halo on some cards. */
export function generate(rich = false): string {
  counter = 0;
  const shapes: string[] = [];
  const j = JSON.stringify;
  for (let n = 0; n < 50; n++) {
    const [x, y] = cardPos(n);
    const rect = id();
    const label = id();
    shapes.push(
      `{"id":"${rect}","kind":"rect","props":{"w":96,"h":56,"radius":12},"keys":[{"at":0,"x":0,"y":0,"opacity":1,"fill":"Ink"${rich ? ',"stroke":"Accent"' : ""}}]}`,
      `{"id":"${label}","kind":"label","props":{},"keys":[{"at":0,"x":0,"y":0,"opacity":1,"fill":"Paper","text":"n${n}"}]}`,
      `{"id":"${id()}","kind":"group","props":{"items":[${j(rect)},${j(label)}]},"keys":[{"at":0,"x":${x},"y":${y},"opacity":1${rich && n % 5 === 0 ? ',"halo":0.5' : ""}}]}`,
    );
    for (let r = 0; r < 3; r++) {
      const t0 = 600 + ((n * 37 + r * 211) % 1500);
      const t1 = t0 + 900 + ((n * 53 + r * 97) % 600);
      shapes.push(
        `{"id":"${id()}","kind":"label","props":{},"keys":[{"at":0,"x":${x},"y":${y + 45 + r * 26},"opacity":1,"fill":"Ink","text":"r${r}=0"},{"at":${t0 - 1},"text":"r${r}=0"},{"at":${t0},"text":"r${r}=1"},{"at":${t1 - 1},"text":"r${r}=1"},{"at":${t1},"text":"r${r}=2"}]}`,
      );
    }
  }
  let seed = 12345;
  const rnd = (m: number): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed % m;
  };
  for (let k = 0; k < 200; k++) {
    const from = cardPos(rnd(50));
    const to = cardPos(rnd(50));
    const born = k * 5; // 0..995
    const land = 3000 + rnd(500);
    const circle = id();
    const label = id();
    shapes.push(
      `{"id":"${circle}","kind":"circle","props":{"r":6},"keys":[{"at":${born},"x":0,"y":0,"opacity":1,"fill":"Accent"${rich ? ',"stroke":"Ink"' : ""}}],"end":${land + 300}}`,
      `{"id":"${label}","kind":"label","props":{},"keys":[{"at":${born},"x":0,"y":-23,"opacity":1,"fill":"Ink","text":"m${k}"}],"end":${land + 300}}`,
      `{"id":"${id()}","kind":"group","props":{"items":[${j(circle)},${j(label)}]},"keys":[{"at":${born},"x":${from[0]},"y":${from[1]},"opacity":1${rich ? ',"curve":0.2,"trail":400' : ""}},{"at":${land},"x":${to[0]},"y":${to[1]}},{"at":${land + 300},"opacity":0}],"end":${land + 300}}`,
    );
  }
  const duration = 4000;
  const style = rich ? ',"style":{"sketch":1,"stroke":3,"shadow":0.2,"vignette":0.3}' : "";
  return `{"format":"synod-scene/1","duration":${duration},"canvas":{"w":1600,"h":1000},"theme":${THEME}${style},"shapes":[\n${shapes.join(",\n")}\n],"markers":[],"trace":[\n{"seq":1,"at":0},\n{"seq":2,"at":2000}\n]}\n`;
}

const dir = join(import.meta.dirname, "..", "test", "scenes", "handmade");
const targets: [string, boolean][] = [
  [join(dir, "stress-50x200.json"), false],
  [join(dir, "stress-sketch-trails.json"), true],
];
if (import.meta.main) {
  for (const [out, rich] of targets) {
    const text = generate(rich);
    if (process.argv.includes("--check")) {
      if (readFileSync(out, "utf8") !== text) {
        process.stderr.write(`${out} is out of date; run node scripts/gen-stress.ts\n`);
        process.exit(1);
      }
    } else {
      writeFileSync(out, text);
    }
  }
}
