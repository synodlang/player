// The demo page: load a scene, play it, scrub it. All scene text goes in with
// textContent, never innerHTML.

import { createPlayer, type Player, SceneError, type SceneMarker, version } from "../src/index.ts";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const canvas = $<HTMLCanvasElement>("canvas");
const select = $<HTMLSelectElement>("scene-select");
const fileInput = $<HTMLInputElement>("file");
const traceInput = $<HTMLInputElement>("trace-file");
const statusEl = $("status");
const playBtn = $<HTMLButtonElement>("play");
const prevBtn = $<HTMLButtonElement>("prev");
const nextBtn = $<HTMLButtonElement>("next");
const scrub = $<HTMLInputElement>("scrub");
const ticks = $("ticks");
const readout = $("readout");
const factEl = $("fact");
const rateSel = $<HTMLSelectElement>("rate");
const loopBox = $<HTMLInputElement>("loop");
const predictBox = $<HTMLInputElement>("predict");
const markersEl = $("markers");
const warningsEl = $("warnings");
const benchEl = $("bench");

const params = new URLSearchParams(location.search);
const EMPTY = {
  format: "synod-scene/1",
  duration: 0,
  canvas: { w: 1600, h: 1000 },
  shapes: [],
  markers: [],
  trace: [],
};

const player: Player = createPlayer(canvas, EMPTY, {});
let simTimes = new Map<number, number>(); // trace.jsonl: seq -> simulated t
let scrubbing = false;

function setStatus(text: string, error = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", error);
}

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function bind(p: Player): void {
  p.on("time", ({ at }) => {
    if (!scrubbing) scrub.value = String(Math.round(at));
    readout.textContent = `${Math.round(at)} / ${Math.round(p.duration)} ms`;
  });
  p.on("play", () => {
    playBtn.textContent = "Pause";
  });
  p.on("pause", () => {
    playBtn.textContent = "Play";
  });
  p.on("fact", ({ seq }) => showFact(seq));
  p.on("scene", () => refreshScene(p));
}

function showFact(seq: number | null): void {
  if (seq === null) {
    factEl.textContent = "";
    return;
  }
  const t = simTimes.get(seq);
  factEl.textContent = t === undefined ? `fact ${seq}` : `fact ${seq} (t=${t})`;
}

function addItem(list: HTMLElement, text: string, kind?: string, onClick?: () => void): void {
  const li = document.createElement("li");
  if (kind !== undefined) {
    const k = document.createElement("span");
    k.className = `kind ${kind}`;
    k.textContent = kind;
    li.appendChild(k);
  }
  li.appendChild(document.createTextNode(text));
  if (onClick) {
    li.className = "marker";
    li.addEventListener("click", onClick);
  }
  list.appendChild(li);
}

function refreshScene(p: Player): void {
  scrub.max = String(Math.round(p.duration));
  scrub.value = String(Math.round(p.time));
  readout.textContent = `${Math.round(p.time)} / ${Math.round(p.duration)} ms`;
  clear(ticks);
  clear(markersEl);
  clear(warningsEl);
  for (const m of p.markers as readonly SceneMarker[]) {
    const tick = document.createElement("div");
    tick.className = `tick ${m.kind}`;
    tick.style.left = `${p.duration > 0 ? (m.at / p.duration) * 100 : 0}%`;
    tick.title = `${m.kind}: ${m.text}`;
    ticks.appendChild(tick);
    addItem(markersEl, ` ${Math.round(m.at)} ms  ${m.text}`, m.kind, () => {
      p.pause();
      p.seek(m.at);
    });
  }
  if (p.markers.length === 0) addItem(markersEl, "none");
  for (const w of p.warnings) addItem(warningsEl, w);
  if (p.warnings.length === 0) addItem(warningsEl, "none");
  const f = p.factAt(p.time);
  showFact(f ? f.seq : null);
}

function applyControls(): void {
  player.setRate(Number(rateSel.value));
  player.setLoop(loopBox.checked);
  player.setStopAtPause(predictBox.checked);
}

function load(text: string, name: string): void {
  try {
    player.setScene(text, { keepTime: false });
    applyControls();
    setStatus(name);
  } catch (e) {
    setStatus(e instanceof SceneError ? `${e.code}: ${e.message}` : String(e), true);
  }
}

async function loadUrl(url: string, name: string): Promise<void> {
  setStatus(`loading ${name}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    load(await res.text(), name);
    player.seek(0);
  } catch (e) {
    setStatus(String(e instanceof Error ? e.message : e), true);
  }
}

function parseTrace(text: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as { seq?: unknown; t?: unknown };
      if (typeof o.seq === "number" && typeof o.t === "number") out.set(o.seq, o.t);
    } catch {
      // skip lines that are not JSON
    }
  }
  return out;
}

// Controls.
playBtn.addEventListener("click", () => player.toggle());
prevBtn.addEventListener("click", () => player.prevFact());
nextBtn.addEventListener("click", () => player.nextFact());
scrub.addEventListener("pointerdown", () => {
  scrubbing = true;
});
scrub.addEventListener("pointerup", () => {
  scrubbing = false;
});
scrub.addEventListener("input", () => player.seek(Number(scrub.value)));
rateSel.addEventListener("change", applyControls);
loopBox.addEventListener("change", applyControls);
predictBox.addEventListener("change", applyControls);
select.addEventListener("change", () => {
  void loadUrl(`scenes/${select.value}`, select.value);
});
fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (f) load(await f.text(), f.name);
});
traceInput.addEventListener("change", async () => {
  const f = traceInput.files?.[0];
  if (!f) return;
  simTimes = parseTrace(await f.text());
  const cur = player.factAt(player.time);
  showFact(cur ? cur.seq : null);
});
document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "SELECT" || (tag === "INPUT" && (e.target as HTMLInputElement).type === "file"))
    return;
  if (e.code === "Space") {
    e.preventDefault();
    player.toggle();
  } else if (e.code === "ArrowLeft") {
    e.preventDefault();
    player.prevFact();
  } else if (e.code === "ArrowRight") {
    e.preventDefault();
    player.nextFact();
  } else if (e.code === "Home") {
    e.preventDefault();
    player.seek(0);
  } else if (e.code === "End") {
    e.preventDefault();
    player.seek(player.duration);
  }
});
for (const type of ["dragover", "drop"] as const) {
  document.addEventListener(type, async (e) => {
    e.preventDefault();
    if (type !== "drop") return;
    const f = e.dataTransfer?.files[0];
    if (!f) return;
    if (f.name.endsWith(".jsonl")) simTimes = parseTrace(await f.text());
    else load(await f.text(), f.name);
  });
}

// Benchmark overlay: ?bench=1 plays 10 s and reports frame timing.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
}

function runBench(): void {
  benchEl.hidden = false;
  benchEl.textContent = "benchmark running (10 s)...";
  player.pause();
  const dur = player.duration;
  const intervals: number[] = [];
  const work: number[] = [];
  const start = performance.now();
  let last = start;
  const frame = (now: number): void => {
    intervals.push(now - last);
    last = now;
    const at = dur > 0 ? (now - start) % dur : 0;
    const t0 = performance.now();
    player.renderFrame(at);
    work.push(performance.now() - t0);
    if (now - start < 10000) {
      requestAnimationFrame(frame);
      return;
    }
    intervals.shift();
    const ri = intervals.slice().sort((a, b) => a - b);
    const rw = work.slice().sort((a, b) => a - b);
    const median = percentile(ri, 0.5);
    const dropped = ri.filter((v) => v > median * 1.5).length;
    const result = {
      frames: work.length,
      rafP50: percentile(ri, 0.5),
      rafP95: percentile(ri, 0.95),
      workP50: percentile(rw, 0.5),
      workP95: percentile(rw, 0.95),
      workP99: percentile(rw, 0.99),
      dropped,
    };
    benchEl.textContent = [
      `frames ${result.frames}  dropped ${dropped}`,
      `rAF interval p50 ${result.rafP50.toFixed(2)}  p95 ${result.rafP95.toFixed(2)} ms`,
      `JS frame work p50 ${result.workP50.toFixed(3)}  p95 ${result.workP95.toFixed(3)}  p99 ${result.workP99.toFixed(3)} ms`,
    ].join("\n");
    (window as unknown as { __bench?: unknown }).__bench = result;
  };
  requestAnimationFrame(frame);
}

async function init(): Promise<void> {
  bind(player);
  document.title = `Synod player ${version}`;
  let names: string[] = [];
  try {
    const res = await fetch("scenes/index.json");
    names = (await res.json()) as string[];
  } catch {
    // no vendored scenes (served from elsewhere): the file picker still works
  }
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n.replace(/\.json$/, "");
    select.appendChild(o);
  }
  const url = params.get("scene");
  if (url) {
    await loadUrl(url, url);
  } else if (names.length > 0) {
    const first = names.includes("raft.json") ? "raft.json" : (names[0] as string);
    select.value = first;
    await loadUrl(`scenes/${first}`, first);
  }
  refreshScene(player);
  if (params.get("bench") === "1") runBench();
  else if (params.get("autoplay") !== "0") player.play();
}

void init();
