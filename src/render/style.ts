// Fonts and fixed drawing constants of Synod 0.3 (see "Drawing a scene" in 04-formats).

import type { Style } from "../types.ts";

/** The closed font set (decision 118): family name to the file of the font asset. */
export const FONT_FILES: Readonly<Record<string, string>> = {
  Inter: "Inter.woff2",
  "JetBrains Mono": "JetBrainsMono.woff2",
  "Source Serif 4": "SourceSerif4.woff2",
  "Shantell Sans": "ShantellSans.woff2",
};

/** Weight range of each family's variable file, for the FontFace descriptor. */
export const FONT_WEIGHTS: Readonly<Record<string, string>> = {
  Inter: "100 900",
  "JetBrains Mono": "100 800",
  "Source Serif 4": "200 900",
  "Shantell Sans": "300 800",
};

const FALLBACK: Readonly<Record<string, string>> = {
  Inter: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "JetBrains Mono": 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  "Source Serif 4": 'Georgia, "Times New Roman", serif',
  "Shantell Sans": '"Comic Sans MS", "Chalkboard SE", cursive',
};

/** The CSS family list of a family name of the font set, with system fallbacks. */
export function familyStack(family: string): string {
  return `"${family}", ${FALLBACK[family] ?? "sans-serif"}`;
}

/** Font strings by role * 2 + face (roles label, title, value, caption; faces sans, mono). */
export function fontTable(style: Style, sans?: string, mono?: string): string[] {
  const sansStack = sans ?? familyStack(style.sans);
  const monoStack = mono ?? familyStack(style.mono);
  const size = [style.labelSize, style.titleSize, style.valueSize, style.captionSize];
  const out: string[] = [];
  for (let role = 0; role < 4; role++) {
    const weight = role === 1 ? style.titleWeight : style.labelWeight;
    out.push(`${weight} ${size[role]}px ${sansStack}`, `${weight} ${size[role]}px ${monoStack}`);
  }
  return out;
}

/** Text size of each role (label, title, value, caption). */
export function roleSizes(style: Style): number[] {
  return [style.labelSize, style.titleSize, style.valueSize, style.captionSize];
}

export const TRANSPARENT = "rgba(0, 0, 0, 0)";
export const TWO_PI = Math.PI * 2;
