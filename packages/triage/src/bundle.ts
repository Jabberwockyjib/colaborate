import type { Geometry } from "@colaborate/core";

const TEXTBOX_MAX_TEXT = 80;

/**
 * Convert a serialized `Geometry` JSON string into a short English phrase
 * suitable for an LLM prompt. Far cheaper than serializing raw fractions and
 * far easier for the model to reason about.
 *
 * Returns `"unknown geometry"` on any parse failure (fail-soft — geometry hint
 * is decoration, not load-bearing data).
 */
export function geometryHint(geometryJson: string): string {
  let g: Geometry;
  try {
    g = JSON.parse(geometryJson) as Geometry;
  } catch {
    return "unknown geometry";
  }
  switch (g.shape) {
    case "rectangle":
      return `rectangle covering ${pct(g.w)} × ${pct(g.h)} of the anchor`;
    case "circle":
      return `circle (rx=${pct(g.rx)}, ry=${pct(g.ry)})`;
    case "arrow":
      return `arrow from (${pct(g.x1)}, ${pct(g.y1)}) to (${pct(g.x2)}, ${pct(g.y2)})`;
    case "line":
      return `line from (${pct(g.x1)}, ${pct(g.y1)}) to (${pct(g.x2)}, ${pct(g.y2)})`;
    case "textbox": {
      const text = g.text.length > TEXTBOX_MAX_TEXT ? `${g.text.slice(0, TEXTBOX_MAX_TEXT)}…` : g.text;
      return `textbox: "${text}"`;
    }
    case "freehand":
      return `freehand stroke (${g.points.length} points)`;
    default:
      return "unknown geometry";
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
