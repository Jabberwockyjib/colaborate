export interface DebugSource {
  file: string;
  line: number;
  column: number;
}

interface FiberLike {
  _debugSource?: { fileName?: string | null; lineNumber?: number | null; columnNumber?: number | null } | null;
  return?: FiberLike | null;
}

/**
 * Read React's `_debugSource` metadata from a DOM element if available.
 *
 * React attaches the fiber to DOM nodes via a property whose name starts
 * with `__reactFiber$`. Development builds populate `fiber._debugSource`
 * with `{fileName, lineNumber, columnNumber}` pointing at the jsx source.
 *
 * Production builds strip `_debugSource`, so this walker returns `null` and
 * the widget omits the source fields from the feedback payload. This is the
 * Phase 4a capture strategy — the sourcemap uploader/resolver endpoints
 * exist for a future prod capture path (e.g. stack frames from event
 * handlers) but are not wired to the widget in Phase 4a.
 *
 * Safe on non-React pages: missing property ⇒ null; unexpected shapes ⇒ null.
 */
export function readDebugSource(element: Element): DebugSource | null {
  const fiber = findFiber(element);
  if (!fiber) return null;

  let current: FiberLike | null | undefined = fiber;
  while (current) {
    const ds = current._debugSource;
    if (
      ds &&
      typeof ds.fileName === "string" &&
      typeof ds.lineNumber === "number" &&
      typeof ds.columnNumber === "number"
    ) {
      return { file: ds.fileName, line: ds.lineNumber, column: ds.columnNumber };
    }
    current = current.return ?? null;
  }
  return null;
}

function findFiber(element: Element): FiberLike | null {
  for (const key in element) {
    if (key.startsWith("__reactFiber$")) {
      const candidate = (element as unknown as Record<string, unknown>)[key];
      if (candidate && typeof candidate === "object") return candidate as FiberLike;
    }
  }
  return null;
}
