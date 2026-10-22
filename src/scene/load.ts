// loadScene: parse and validate a synod-scene/1 document into a normalized Scene.
//
// Errors (SceneError): bad-json, unsupported-format, bad-scene.
// Leniency (a warning, never an error): unknown fields anywhere are ignored;
// shapes of an unknown kind are skipped (and lines and groups that refer only
// to skipped shapes); unknown marker kinds are ignored silently; unsorted keys,
// markers and trace entries are stably sorted; a missing theme color takes the
// brand value; a shape listed twice, in two groups, or in a cycle keeps its
// first place.

import { parseHex } from "../math/oklab.ts";
import type {
  LoadResult,
  MarkerKind,
  Scene,
  SceneKey,
  SceneMarker,
  SceneShape,
  Theme,
  TraceEntry,
} from "../types.ts";
import { SceneError } from "../types.ts";

/** The eight std/theme colors, used for names a scene's theme leaves out. */
export const BRAND_THEME: Readonly<Theme> = {
  Paper: "#151A2E",
  Ink: "#EDE9E1",
  Line: "#3A4366",
  Quiet: "#8A90A8",
  Accent: "#F4A340",
  Good: "#5CC8B8",
  Warning: "#E8C35A",
  Critical: "#E86F5A",
};

/** Default corner radius of a rect that does not say (the builder always does). */
const DEFAULT_RADIUS = 12;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function bad(message: string): never {
  throw new SceneError("bad-scene", message);
}

function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) bad(`${what} must be a finite number`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string") bad(`${what} must be a string`);
  return v;
}

const MARKER_KINDS: ReadonlySet<string> = new Set(["pause", "caption", "broken", "failed"]);
const KIND_NAMES: ReadonlySet<string> = new Set(["circle", "rect", "label", "line", "group"]);

function loadKeys(raw: unknown, where: string, warnings: string[]): SceneKey[] {
  if (!Array.isArray(raw)) bad(`${where}: keys must be an array`);
  const keys: SceneKey[] = [];
  let sorted = true;
  for (let i = 0; i < raw.length; i++) {
    const r: unknown = raw[i];
    const w = `${where}: key ${i}`;
    if (!isObj(r)) bad(`${w} must be an object`);
    const k: SceneKey = { at: num(r.at, `${w}: at`) };
    if (r.x !== undefined) k.x = num(r.x, `${w}: x`);
    if (r.y !== undefined) k.y = num(r.y, `${w}: y`);
    if (r.scale !== undefined) k.scale = num(r.scale, `${w}: scale`);
    if (r.opacity !== undefined) k.opacity = num(r.opacity, `${w}: opacity`);
    if (r.rotation !== undefined) k.rotation = num(r.rotation, `${w}: rotation`);
    if (r.fill !== undefined) k.fill = str(r.fill, `${w}: fill`);
    if (r.stroke !== undefined) k.stroke = str(r.stroke, `${w}: stroke`);
    if (r.text !== undefined) k.text = str(r.text, `${w}: text`);
    if (r.effect !== undefined) k.effect = str(r.effect, `${w}: effect`);
    const prev = keys[keys.length - 1];
    if (prev && k.at < prev.at) sorted = false;
    keys.push(k);
  }
  if (!sorted) {
    warnings.push(`${where}: keys are not sorted by at; sorted`);
    keys.sort((a, b) => a.at - b.at); // stable
  }
  return keys;
}

/** Parse and validate; throws SceneError. `input` is JSON text or a parsed object. */
export function loadScene(input: string | unknown): LoadResult {
  let doc: unknown = input;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch (e) {
      throw new SceneError("bad-json", `not valid JSON: ${(e as Error).message}`);
    }
  }
  if (!isObj(doc)) throw new SceneError("bad-json", "the scene is not a JSON object");
  const warnings: string[] = [];

  const m = typeof doc.format === "string" ? /^synod-scene\/(\d+)$/.exec(doc.format) : null;
  if (!m || Number(m[1]) !== 1) {
    throw new SceneError(
      "unsupported-format",
      `unsupported scene format ${JSON.stringify(doc.format)}; this player reads synod-scene/1`,
    );
  }
  const format = doc.format as string;

  const duration = num(doc.duration, "duration");
  if (duration < 0) bad("duration must not be negative");
  if (!isObj(doc.canvas)) bad("canvas must be an object");
  const cw = num(doc.canvas.w, "canvas.w");
  const ch = num(doc.canvas.h, "canvas.h");
  if (cw <= 0 || ch <= 0) bad("canvas.w and canvas.h must be positive");

  const theme: Theme = {};
  if (doc.theme !== undefined) {
    if (!isObj(doc.theme)) bad("theme must be an object");
    for (const name of Object.keys(doc.theme)) {
      const hex: unknown = doc.theme[name];
      if (typeof hex !== "string") {
        warnings.push(`theme color ${name} is not a string; ignored`);
        continue;
      }
      if (parseHex(hex) < 0) warnings.push(`theme color ${name} is not #rrggbb; drawn as Ink`);
      theme[name] = hex;
    }
  }
  for (const name of Object.keys(BRAND_THEME)) {
    if (theme[name] === undefined) {
      theme[name] = BRAND_THEME[name] as string;
      warnings.push(`theme has no ${name}; using ${BRAND_THEME[name]}`);
    }
  }

  // Shapes.
  if (!Array.isArray(doc.shapes)) bad("shapes must be an array");
  const byId = new Map<string, SceneShape>();
  const order: SceneShape[] = [];
  for (let i = 0; i < doc.shapes.length; i++) {
    const r: unknown = doc.shapes[i];
    if (!isObj(r)) bad(`shape ${i} must be an object`);
    const id = str(r.id, `shape ${i}: id`);
    if (id === "") bad(`shape ${i}: id must not be empty`);
    const kind = str(r.kind, `shape ${id}: kind`);
    const where = `shape ${id}`;
    if (!KIND_NAMES.has(kind)) {
      warnings.push(`${where}: unknown kind ${JSON.stringify(kind)}; skipped`);
      continue;
    }
    if (byId.has(id)) {
      warnings.push(`${where}: duplicate id; skipped`);
      continue;
    }
    const props: Obj =
      r.props === undefined ? {} : isObj(r.props) ? r.props : bad(`${where}: props`);
    const keys = loadKeys(r.keys, where, warnings);
    if (keys.length === 0) {
      warnings.push(`${where}: no keys; skipped`);
      continue;
    }
    const base: { id: string; keys: SceneKey[]; end?: number } = { id, keys };
    if (r.end !== undefined) base.end = num(r.end, `${where}: end`);
    let shape: SceneShape;
    switch (kind) {
      case "circle": {
        const radius = num(props.r, `${where}: props.r`);
        shape = { ...base, kind: "circle", props: { r: radius } };
        break;
      }
      case "rect":
        shape = {
          ...base,
          kind: "rect",
          props: {
            w: num(props.w, `${where}: props.w`),
            h: num(props.h, `${where}: props.h`),
            radius:
              props.radius === undefined
                ? DEFAULT_RADIUS
                : num(props.radius, `${where}: props.radius`),
          },
        };
        break;
      case "label":
        shape = { ...base, kind: "label", props: {} };
        break;
      case "line":
        shape = {
          ...base,
          kind: "line",
          props: {
            from: str(props.from, `${where}: props.from`),
            to: str(props.to, `${where}: props.to`),
          },
        };
        break;
      default: {
        if (!Array.isArray(props.items)) bad(`${where}: props.items must be an array`);
        const items = props.items.map((v, j) => str(v, `${where}: items[${j}]`));
        shape = { ...base, kind: "group", props: { items } };
      }
    }
    byId.set(id, shape);
    order.push(shape);
  }

  // Drop shapes that refer only to dropped shapes, until nothing changes.
  const dropped = new Set<SceneShape>();
  const originalItems = new Map<SceneShape, number>();
  for (const s of order) if (s.kind === "group") originalItems.set(s, s.props.items.length);
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of order) {
      if (dropped.has(s)) continue;
      if (s.kind === "line") {
        const a = byId.get(s.props.from);
        const b = byId.get(s.props.to);
        if (!a || !b || dropped.has(a) || dropped.has(b)) {
          dropped.add(s);
          changed = true;
          warnings.push(`shape ${s.id}: line ends at a missing shape; skipped`);
        }
      } else if (s.kind === "group") {
        const kept = s.props.items.filter((id) => {
          const t = byId.get(id);
          return t !== undefined && !dropped.has(t);
        });
        if (kept.length !== s.props.items.length) {
          s.props.items = kept;
          changed = true;
          if (kept.length === 0 && (originalItems.get(s) ?? 0) > 0) {
            dropped.add(s);
            warnings.push(`shape ${s.id}: group has only missing members; skipped`);
          } else {
            warnings.push(`shape ${s.id}: group lists a missing shape; ignored`);
          }
        }
      }
    }
  }
  const shapes = order.filter((s) => !dropped.has(s));

  // Membership is a forest: one group per shape, no cycles.
  const parent = new Map<string, string>();
  for (const g of shapes) {
    if (g.kind !== "group") continue;
    const items: string[] = [];
    for (const id of g.props.items) {
      let cycle = id === g.id;
      for (let p = parent.get(g.id); !cycle && p !== undefined; p = parent.get(p)) cycle = p === id;
      if (cycle) {
        warnings.push(`shape ${g.id}: member ${id} would make a cycle; ignored`);
      } else if (parent.has(id)) {
        warnings.push(`shape ${id}: already in group ${parent.get(id)}; ignored in ${g.id}`);
      } else {
        parent.set(id, g.id);
        items.push(id);
      }
    }
    g.props.items = items;
  }

  // Markers.
  if (doc.markers !== undefined && !Array.isArray(doc.markers)) bad("markers must be an array");
  if (doc.markers === undefined) warnings.push("no markers array; none");
  const markers: SceneMarker[] = [];
  let markersSorted = true;
  for (const [i, r] of ((doc.markers as unknown[] | undefined) ?? []).entries()) {
    if (!isObj(r)) bad(`marker ${i} must be an object`);
    const at = num(r.at, `marker ${i}: at`);
    const kind = str(r.kind, `marker ${i}: kind`);
    if (!MARKER_KINDS.has(kind)) continue; // readers ignore marker kinds they do not know
    const text = r.text === undefined ? "" : str(r.text, `marker ${i}: text`);
    const prev = markers[markers.length - 1];
    if (prev && at < prev.at) markersSorted = false;
    markers.push({ at, kind: kind as MarkerKind, text });
  }
  if (!markersSorted) {
    warnings.push("markers are not sorted by at; sorted");
    markers.sort((a, b) => a.at - b.at);
  }

  // Trace.
  if (doc.trace !== undefined && !Array.isArray(doc.trace)) bad("trace must be an array");
  if (doc.trace === undefined) warnings.push("no trace array; none");
  const trace: TraceEntry[] = [];
  let traceSorted = true;
  for (const [i, r] of ((doc.trace as unknown[] | undefined) ?? []).entries()) {
    if (!isObj(r)) bad(`trace entry ${i} must be an object`);
    const e = { seq: num(r.seq, `trace entry ${i}: seq`), at: num(r.at, `trace entry ${i}: at`) };
    const prev = trace[trace.length - 1];
    if (prev && e.at < prev.at) traceSorted = false;
    trace.push(e);
  }
  if (!traceSorted) {
    warnings.push("trace is not sorted by at; sorted");
    trace.sort((a, b) => a.at - b.at);
  }

  const scene: Scene = {
    format,
    duration,
    canvas: { w: cw, h: ch },
    theme,
    shapes,
    markers,
    trace,
  };
  return { scene, warnings };
}
