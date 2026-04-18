/**
 * Annotation geometry — discriminated union covering all 6 shape primitives.
 *
 * All positional coordinates are fractions (0..1) of the anchor element's
 * bounding box. Pixel-valued fields: `textbox.fontSize`, `arrow.headSize`,
 * `freehand.strokeWidth`.
 *
 * Geometry is persisted as a JSON string on the `ColaborateAnnotation.geometry`
 * column — stringified here, parsed on read.
 */

export const SHAPES = ["rectangle", "circle", "arrow", "line", "textbox", "freehand"] as const;
export type Shape = (typeof SHAPES)[number];

export type Geometry =
  | { shape: "rectangle"; x: number; y: number; w: number; h: number }
  | { shape: "circle"; cx: number; cy: number; rx: number; ry: number }
  | { shape: "arrow"; x1: number; y1: number; x2: number; y2: number; headSize: number }
  | { shape: "line"; x1: number; y1: number; x2: number; y2: number }
  | { shape: "textbox"; x: number; y: number; w: number; h: number; text: string; fontSize: number }
  | { shape: "freehand"; points: Array<[number, number]>; strokeWidth: number };

/** Serialize to a compact JSON string for DB storage. */
export function serializeGeometry(g: Geometry): string {
  return JSON.stringify(g);
}

/**
 * Parse a geometry JSON string into a typed `Geometry`.
 * Throws on malformed JSON, unknown `shape`, or missing/invalid fields.
 */
export function parseGeometry(raw: string): Geometry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid geometry JSON: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Geometry must be an object");
  }
  const obj = parsed as Record<string, unknown>;
  const shape = obj.shape;
  if (typeof shape !== "string" || !(SHAPES as readonly string[]).includes(shape)) {
    throw new Error(`Invalid shape: ${String(shape)}`);
  }
  return validate(obj as { shape: Shape } & Record<string, unknown>);
}

/** Construct a rectangle Geometry from legacy widget rect fields (percent). */
export function geometryFromRect(rect: { xPct: number; yPct: number; wPct: number; hPct: number }): Geometry {
  return { shape: "rectangle", x: rect.xPct, y: rect.yPct, w: rect.wPct, h: rect.hPct };
}

// -- internal ----------------------------------------------------------------

function n(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Geometry field '${field}' must be a finite number`);
  }
  return v;
}

function validate(obj: { shape: Shape } & Record<string, unknown>): Geometry {
  switch (obj.shape) {
    case "rectangle":
      return {
        shape: "rectangle",
        x: n(obj.x, "x"),
        y: n(obj.y, "y"),
        w: n(obj.w, "w"),
        h: n(obj.h, "h"),
      };
    case "circle":
      return {
        shape: "circle",
        cx: n(obj.cx, "cx"),
        cy: n(obj.cy, "cy"),
        rx: n(obj.rx, "rx"),
        ry: n(obj.ry, "ry"),
      };
    case "arrow":
      return {
        shape: "arrow",
        x1: n(obj.x1, "x1"),
        y1: n(obj.y1, "y1"),
        x2: n(obj.x2, "x2"),
        y2: n(obj.y2, "y2"),
        headSize: n(obj.headSize, "headSize"),
      };
    case "line":
      return {
        shape: "line",
        x1: n(obj.x1, "x1"),
        y1: n(obj.y1, "y1"),
        x2: n(obj.x2, "x2"),
        y2: n(obj.y2, "y2"),
      };
    case "textbox": {
      const text = obj.text;
      if (typeof text !== "string") {
        throw new Error("Geometry field 'text' must be a string");
      }
      return {
        shape: "textbox",
        x: n(obj.x, "x"),
        y: n(obj.y, "y"),
        w: n(obj.w, "w"),
        h: n(obj.h, "h"),
        text,
        fontSize: n(obj.fontSize, "fontSize"),
      };
    }
    case "freehand": {
      const points = obj.points;
      if (!Array.isArray(points) || points.length === 0) {
        throw new Error("Geometry field 'points' must be a non-empty array");
      }
      for (const [i, p] of points.entries()) {
        if (!Array.isArray(p) || p.length !== 2) {
          throw new Error(`Geometry points[${i}] must be [x, y]`);
        }
        n(p[0], `points[${i}][0]`);
        n(p[1], `points[${i}][1]`);
      }
      return {
        shape: "freehand",
        points: points as Array<[number, number]>,
        strokeWidth: n(obj.strokeWidth, "strokeWidth"),
      };
    }
  }
}
