import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

export interface ResolvedPosition {
  source: string;
  line: number;
  column: number;
}

/**
 * Resolve a bundled (line, column) position to its original source location.
 *
 * Pure function — takes the source-map JSON + the query and returns the
 * mapping (or `null` when the position is unmapped or the map is invalid).
 *
 * Fails closed: any parse error, any missing mapping, any null source ⇒ null.
 * Callers should treat `null` as "no source info available" and omit the fields.
 *
 * Lines are 1-indexed to match browser / DevTools conventions; `trace-mapping`
 * natively uses 1-indexed lines + 0-indexed columns.
 */
export function resolveSource(mapContent: string, line: number, column: number): ResolvedPosition | null {
  let map: TraceMap;
  try {
    map = new TraceMap(mapContent);
  } catch {
    return null;
  }
  const pos = originalPositionFor(map, { line, column });
  if (pos.source === null || pos.line === null || pos.column === null) return null;
  return { source: pos.source, line: pos.line, column: pos.column };
}
