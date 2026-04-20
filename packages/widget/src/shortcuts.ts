import type { Shape } from "@colaborate/core";

/**
 * Keyboard shortcuts for switching drawing mode while the annotator is active.
 * Single-letter lowercase keys. Case-insensitive at the call site.
 */
export const SHAPE_SHORTCUTS: Record<string, Shape> = {
  r: "rectangle",
  c: "circle",
  a: "arrow",
  l: "line",
  t: "textbox",
  f: "freehand",
};

/**
 * Map a raw `KeyboardEvent.key` to a `Shape`. Returns `null` for:
 *  - unmapped keys
 *  - multi-char keys (so `"ArrowRight"` does not collide with the `a` shortcut)
 *  - empty string
 */
export function getShapeFromKey(key: string): Shape | null {
  if (key.length !== 1) return null;
  return SHAPE_SHORTCUTS[key.toLowerCase()] ?? null;
}
