// Fixed drawing constants of Synod 0.2 (see the rendering rules in 04-formats).

export const DEFAULT_SANS =
  '-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DEFAULT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Every label is weight 500, 16 px, in the sans stack. */
export function labelFont(sans: string = DEFAULT_SANS): string {
  return `500 16px ${sans}`;
}

/** Stroke width in scene units (shapes and lines). */
export const STROKE_WIDTH = 2;
/** Glow blur radius in scene units. */
export const GLOW_BLUR = 24;
export const TRANSPARENT = "rgba(0, 0, 0, 0)";
export const TWO_PI = Math.PI * 2;
