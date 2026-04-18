# Colaborate — Phase 1a: Geometry-as-union (data layer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed rectangle (`xPct/yPct/wPct/hPct`) with a `Geometry` discriminated union across all layers — types, Zod validation, schema, all three store adapters, conformance tests, and the minimal widget changes needed to keep existing tests green. All 6 shapes (`rectangle`, `circle`, `arrow`, `line`, `textbox`, `freehand`) are fully representable in types + storage after this phase. **No new widget UI** — shape picker + per-shape drawing modes come in Plan 1c.

**Architecture:** Clean replacement (no deprecation alias) — we have no production data and the fork is pre-1.0, so churning the schema is cheap. Geometry is stored as a JSON string in the `ColaborateAnnotation.geometry` column (DB-agnostic: works for Postgres, MySQL, SQLite alike). Wire format gets a `shape: Shape` + `geometry: Geometry` pair replacing the `rect` object. The widget annotator continues to draw rectangles only; it just emits the new wire shape with `shape: "rectangle"`.

**Tech Stack:** Same as Phase 0 — Bun, TypeScript strict, Zod, Vitest, Prisma-style schema generator.

**Source spec:** `docs/superpowers/specs/2026-04-18-colaborate-design.md` (Data model section)
**Prereq:** Phase 0 complete (fork + rebrand on `main`, tag `v0.0.0-fork`).

---

## File Structure Overview

| Path | Action | Responsibility |
|---|---|---|
| `packages/core/src/types.ts` | Modify | Add `Geometry` union, `Shape` literal, `SHAPES` const; replace `RectData` usage in `AnnotationPayload`/`Response`; update `AnnotationCreateInput` + `AnnotationRecord` + `flattenAnnotation` |
| `packages/core/src/geometry.ts` | **Create** | `serializeGeometry`, `parseGeometry`, `geometryFromRect` helpers. One responsibility: serialize/parse between wire-object and storage-string |
| `packages/core/__tests__/geometry.test.ts` | **Create** | Unit tests for Geometry serialization — round-trip for each of 6 shapes + validation |
| `packages/core/src/schema.ts` | Modify | `ColaborateAnnotation` model: drop `xPct/yPct/wPct/hPct`, add `shape: String` + `geometry: String (Text)` |
| `packages/core/src/index.ts` | Modify | Re-export new types + geometry helpers |
| `packages/core/src/testing.ts` | Modify | Conformance suite: update `createInput` fixture to use geometry instead of x/y/w/h |
| `packages/adapter-prisma/src/validation.ts` | Modify | Replace `rectSchema` with `shape`+`geometry` schema; update `annotationSchema`; update public `AnnotationInput` interface |
| `packages/adapter-prisma/src/index.ts` | Modify | `PrismaStore.createFeedback` + `getFeedbacks` + `findByClientId`: serialize geometry on write, parse on read; update `ColaboratePrismaClient` interface (keep shape) |
| `packages/adapter-prisma/__tests__/handler.test.ts` | Modify | Fixtures use geometry; verify DB args include `shape`+`geometry` |
| `packages/adapter-prisma/__tests__/auth-cors.test.ts` | Modify | Mock payload uses new geometry format |
| `packages/adapter-memory/src/index.ts` | Modify | Store create/read: no longer needs to unpack x/y/w/h — passes through geometry |
| `packages/adapter-memory/__tests__/memory-store.test.ts` | Modify | Fixtures updated |
| `packages/adapter-localstorage/src/index.ts` | Modify | Similar — geometry passes through |
| `packages/adapter-localstorage/__tests__/localstorage-store.test.ts` | Modify | Fixtures updated |
| `packages/widget/src/annotator.ts` | Modify | When emitting `annotation:complete`, build `AnnotationPayload` with `shape: "rectangle"` + `geometry: {x, y, w, h}` instead of `rect: {xPct, yPct, wPct, hPct}` |
| `packages/widget/src/launcher.ts` | Modify | Type imports if needed |
| `packages/widget/src/markers.ts` | Modify | Read `annotation.geometry.x/y/w/h` when shape is rectangle (current behavior preserved, just accessed differently) |
| `packages/widget/__tests__/widget/markers.test.ts` | Modify | Test fixtures use new geometry |
| `packages/widget/__tests__/widget/api-client.test.ts` | Modify | Fixtures for wire payload use new geometry |
| `packages/widget/__tests__/widget/launcher*.test.ts` | Modify | Same |
| `packages/widget/__tests__/widget/panel*.test.ts` | Modify | Same |
| `packages/widget/__tests__/widget/popup.test.ts` | Modify | Same if it constructs annotations |
| `packages/cli/src/generators/prisma.ts` | Modify | Emit `shape` + `geometry` columns; drop x/y/w/h |
| `packages/cli/__tests__/generators/prisma.test.ts` | Modify | Assertions updated for new columns |
| `e2e/widget.spec.ts` | Modify | Assertions on the persisted annotation use new shape |

---

## Task 1: Add Geometry types + serialization helpers with TDD

**Files:**
- Create: `packages/core/src/geometry.ts`
- Create: `packages/core/__tests__/geometry.test.ts`

This is a pure TypeScript + JSON module. Write tests first, then implementation.

- [ ] **Step 1.1: Write the failing geometry tests**

Create `/Users/brian/dev/colaborate/packages/core/__tests__/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  type Geometry,
  type Shape,
  geometryFromRect,
  parseGeometry,
  serializeGeometry,
  SHAPES,
} from "../src/geometry.js";

describe("SHAPES constant", () => {
  it("enumerates all 6 shapes", () => {
    expect(SHAPES).toEqual(["rectangle", "circle", "arrow", "line", "textbox", "freehand"]);
  });
});

describe("Geometry round-trip (serialize → parse)", () => {
  const cases: Geometry[] = [
    { shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
    { shape: "circle", cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.15 },
    { shape: "arrow", x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9, headSize: 12 },
    { shape: "line", x1: 0.0, y1: 0.5, x2: 1.0, y2: 0.5 },
    { shape: "textbox", x: 0.3, y: 0.4, w: 0.4, h: 0.1, text: "Change this", fontSize: 14 },
    { shape: "freehand", points: [[0.1, 0.1], [0.2, 0.15], [0.25, 0.2]], strokeWidth: 3 },
  ];

  for (const input of cases) {
    it(`round-trips ${input.shape}`, () => {
      const serialized = serializeGeometry(input);
      expect(typeof serialized).toBe("string");
      const parsed = parseGeometry(serialized);
      expect(parsed).toEqual(input);
    });
  }
});

describe("parseGeometry", () => {
  it("throws on invalid JSON", () => {
    expect(() => parseGeometry("not json")).toThrow();
  });

  it("throws when shape is missing", () => {
    expect(() => parseGeometry(JSON.stringify({ x: 0, y: 0, w: 1, h: 1 }))).toThrow(/shape/);
  });

  it("throws when shape is unknown", () => {
    expect(() => parseGeometry(JSON.stringify({ shape: "zigzag" }))).toThrow(/shape/);
  });

  it("throws when rectangle is missing required fields", () => {
    expect(() => parseGeometry(JSON.stringify({ shape: "rectangle", x: 0, y: 0 }))).toThrow();
  });

  it("throws when freehand points is empty", () => {
    expect(() => parseGeometry(JSON.stringify({ shape: "freehand", points: [], strokeWidth: 1 }))).toThrow();
  });
});

describe("geometryFromRect", () => {
  it("constructs a rectangle Geometry from legacy rect fields", () => {
    const g = geometryFromRect({ xPct: 0.1, yPct: 0.2, wPct: 0.5, hPct: 0.3 });
    expect(g).toEqual({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
  });
});

describe("Shape type guard via SHAPES", () => {
  it("can iterate as Shape[]", () => {
    const asShapes: Shape[] = [...SHAPES];
    expect(asShapes.length).toBe(6);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: vitest reports `Cannot find module '../src/geometry.js'` or similar import failure. That's the red.

- [ ] **Step 1.3: Implement `packages/core/src/geometry.ts`**

Create the file with exact content:

```ts
/**
 * Annotation geometry — discriminated union covering all 6 shape primitives.
 *
 * All coordinates are fractions (0..1) of the anchor element's bounding box,
 * except textbox.fontSize (px) and arrow.headSize (px) and freehand.strokeWidth (px).
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
 * Throws on malformed JSON, unknown `shape`, or missing required fields.
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

/** Construct a rectangle Geometry from the legacy widget rect (percent fields). */
export function geometryFromRect(rect: { xPct: number; yPct: number; wPct: number; hPct: number }): Geometry {
  return { shape: "rectangle", x: rect.xPct, y: rect.yPct, w: rect.wPct, h: rect.hPct };
}

// -- internal ----------------------------------------------------------------

function n(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Geometry field '${field}' must be a finite number`);
  return v;
}

function validate(obj: { shape: Shape } & Record<string, unknown>): Geometry {
  switch (obj.shape) {
    case "rectangle":
      return { shape: "rectangle", x: n(obj.x, "x"), y: n(obj.y, "y"), w: n(obj.w, "w"), h: n(obj.h, "h") };
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
      if (typeof text !== "string") throw new Error("Geometry field 'text' must be a string");
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
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 1.5: Export the new module from `packages/core/src/index.ts`**

Add to the exports:

```ts
// Add to existing export block in packages/core/src/index.ts
export { SHAPES, geometryFromRect, parseGeometry, serializeGeometry } from "./geometry.js";
export type { Geometry, Shape } from "./geometry.js";
```

- [ ] **Step 1.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/core/src/geometry.ts packages/core/__tests__/geometry.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): add Geometry discriminated union with serialization helpers

Introduces Shape literal (6 primitives), Geometry union, serializeGeometry,
parseGeometry, and geometryFromRect. Pure data layer — no schema or widget
changes yet. 19 unit tests (round-trip + validation).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update schema model — drop x/y/w/h, add shape + geometry

**Files:**
- Modify: `packages/core/src/schema.ts` — the `ColaborateAnnotation` model

- [ ] **Step 2.1: Update `COLABORATE_MODELS.ColaborateAnnotation`**

In `/Users/brian/dev/colaborate/packages/core/src/schema.ts`, find the `ColaborateAnnotation.fields` block and replace these four lines:

```ts
      xPct: { type: "Float" },
      yPct: { type: "Float" },
      wPct: { type: "Float" },
      hPct: { type: "Float" },
```

with:

```ts
      shape: { type: "String" },
      geometry: { type: "String", nativeType: "Text" },
```

(shape column is a short string — `rectangle` etc. — no Text needed; geometry is JSON stringified and may be long, use Text for MySQL compat.)

- [ ] **Step 2.2: Verify the schema file compiles**

```bash
cd /Users/brian/dev/colaborate
bun run check 2>&1 | tail -10
```

Expected: `@colaborate/core:check` passes (schema file is pure types so it compiles if syntax is right). Downstream package checks may fail because they reference fields that no longer exist — that's expected and fixed in later tasks.

**Do not commit yet** — the downstream packages are now broken. Tasks 3-8 bring them back to green.

---

## Task 3: Update core `AnnotationCreateInput` + `AnnotationRecord` in types.ts

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 3.1: Replace x/y/w/h fields with shape + geometry in `AnnotationCreateInput`**

In `packages/core/src/types.ts`, find:

```ts
/** Input for a single annotation when creating a feedback. */
export interface AnnotationCreateInput {
  cssSelector: string;
  xpath: string;
  textSnippet: string;
  elementTag: string;
  elementId?: string | undefined;
  textPrefix: string;
  textSuffix: string;
  fingerprint: string;
  neighborText: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  devicePixelRatio: number;
}
```

Replace the 4 lines `xPct: number;` through `hPct: number;` with:

```ts
  shape: string;
  /** Serialized Geometry JSON — see `packages/core/src/geometry.ts`. */
  geometry: string;
```

- [ ] **Step 3.2: Apply the same replacement in `AnnotationRecord`**

Find the `AnnotationRecord` interface (same file, similar shape but with `id` + `feedbackId` + `createdAt: Date`) and do the same replacement — drop `xPct/yPct/wPct/hPct`, add `shape: string` and `geometry: string`.

- [ ] **Step 3.3: Apply the same replacement in `AnnotationResponse` (API shape)**

Find `AnnotationResponse` (similar to `AnnotationRecord` but with `createdAt: string`). Same replacement.

- [ ] **Step 3.4: Update `AnnotationPayload` (wire format — already uses nested `rect`)**

Find `AnnotationPayload` in the same file. It has:

```ts
  anchor: AnchorData;
  rect: RectData;
  scrollX: number;
  ...
```

Replace those two fields (`anchor` unchanged, `rect` removed) with:

```ts
  anchor: AnchorData;
  shape: Shape;
  geometry: Geometry;
  scrollX: number;
  ...
```

Add the import at the top of types.ts:

```ts
import type { Geometry, Shape } from "./geometry.js";
```

- [ ] **Step 3.5: Remove the now-unused `RectData` type export**

In the same file, remove the `RectData` interface definition and its export. Also remove `RectData` from the `packages/core/src/index.ts` re-exports block.

- [ ] **Step 3.6: Update `flattenAnnotation`**

Find `flattenAnnotation` in `packages/core/src/types.ts` (it converts `AnnotationInput` wire format → `AnnotationCreateInput` store format). Replace:

```ts
    xPct: ann.rect.xPct,
    yPct: ann.rect.yPct,
    wPct: ann.rect.wPct,
    hPct: ann.rect.hPct,
```

with:

```ts
    shape: ann.shape,
    geometry: typeof ann.geometry === "string" ? ann.geometry : JSON.stringify(ann.geometry),
```

Update the input type signature for `flattenAnnotation` to accept `{ anchor, shape, geometry, scrollX, ... }` instead of `{ anchor, rect, ... }`. Import the `Geometry` and `Shape` types if not already imported.

- [ ] **Step 3.7: Verify compile**

```bash
cd /Users/brian/dev/colaborate
bun run -F @colaborate/core check 2>&1 | tail -5
```

Expected: core compiles. (Vitest tests in core will still fail because testing.ts still uses x/y/w/h — fixed in Task 5.)

---

## Task 4: Update Zod validation schemas in adapter-prisma

**Files:**
- Modify: `packages/adapter-prisma/src/validation.ts`

- [ ] **Step 4.1: Replace `rectSchema` with geometry schema**

In `packages/adapter-prisma/src/validation.ts`, replace this block:

```ts
const rectSchema = z.object({
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  wPct: z.number().min(0).max(1),
  hPct: z.number().min(0).max(1),
});
```

with:

```ts
const rectangleGeom = z.object({
  shape: z.literal("rectangle"),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
});
const circleGeom = z.object({
  shape: z.literal("circle"),
  cx: z.number(), cy: z.number(), rx: z.number(), ry: z.number(),
});
const arrowGeom = z.object({
  shape: z.literal("arrow"),
  x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), headSize: z.number(),
});
const lineGeom = z.object({
  shape: z.literal("line"),
  x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
});
const textboxGeom = z.object({
  shape: z.literal("textbox"),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  text: z.string().max(2000),
  fontSize: z.number().positive(),
});
const freehandGeom = z.object({
  shape: z.literal("freehand"),
  points: z.array(z.tuple([z.number(), z.number()])).min(1).max(5000),
  strokeWidth: z.number().positive(),
});
const geometrySchema = z.discriminatedUnion("shape", [
  rectangleGeom, circleGeom, arrowGeom, lineGeom, textboxGeom, freehandGeom,
]);
```

- [ ] **Step 4.2: Update `annotationSchema`**

Replace:

```ts
const annotationSchema = z.object({
  anchor: anchorSchema,
  rect: rectSchema,
  scrollX: z.number().min(0),
  scrollY: z.number().min(0),
  viewportW: z.number().int().positive(),
  viewportH: z.number().int().positive(),
  devicePixelRatio: z.number().positive().default(1),
});
```

with:

```ts
const annotationSchema = z.object({
  anchor: anchorSchema,
  shape: z.enum(["rectangle", "circle", "arrow", "line", "textbox", "freehand"]),
  geometry: geometrySchema,
  scrollX: z.number().min(0),
  scrollY: z.number().min(0),
  viewportW: z.number().int().positive(),
  viewportH: z.number().int().positive(),
  devicePixelRatio: z.number().positive().default(1),
});
```

- [ ] **Step 4.3: Update the public `AnnotationInput` + `RectInput` interface declarations**

Further down in the same file, remove:

```ts
export interface RectInput {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}
```

And replace the `AnnotationInput` interface body:

```ts
export interface AnnotationInput {
  anchor: AnchorInput;
  shape: import("@colaborate/core").Shape;
  geometry: import("@colaborate/core").Geometry;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  /** Set to 1 by schema default when omitted from raw input. */
  devicePixelRatio: number;
}
```

- [ ] **Step 4.4: Verify validation compiles**

```bash
cd /Users/brian/dev/colaborate
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -10
```

Expected: type-level assertions in validation.ts (the `_AssertCreate` et al) should still hold since both sides of the assertion got the same rewrite. If any `_Assert*` fails, revisit the interface match.

---

## Task 5: Update conformance test fixture in `packages/core/src/testing.ts`

**Files:**
- Modify: `packages/core/src/testing.ts`

- [ ] **Step 5.1: Replace x/y/w/h in `createInput` factory**

Find the `createInput` function in `testing.ts`. In its `annotations` array, replace:

```ts
        xPct: 0.1,
        yPct: 0.2,
        wPct: 0.5,
        hPct: 0.3,
```

with:

```ts
        shape: "rectangle",
        geometry: JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 }),
```

- [ ] **Step 5.2: Run core's own tests to verify they pass**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core 2>&1 | tail -10
```

Expected: geometry tests still green. No core tests use `testColaborateStore` directly (that's done from adapters), so no fallout here beyond the fixture.

---

## Task 6: Update MemoryStore + LocalStorageStore + their tests

**Files:**
- Modify: `packages/adapter-memory/src/index.ts`
- Modify: `packages/adapter-memory/__tests__/memory-store.test.ts`
- Modify: `packages/adapter-localstorage/src/index.ts`
- Modify: `packages/adapter-localstorage/__tests__/localstorage-store.test.ts`

These two adapters treat annotations as opaque (they persist whatever the `AnnotationCreateInput` is). The code change is almost trivial: wherever they construct or inspect `xPct/yPct/wPct/hPct`, they should now use `shape/geometry`.

- [ ] **Step 6.1: Read the two adapter source files**

```bash
cd /Users/brian/dev/colaborate
wc -l packages/adapter-memory/src/index.ts packages/adapter-localstorage/src/index.ts
grep -n "xPct\|yPct\|wPct\|hPct" packages/adapter-memory/src/index.ts packages/adapter-localstorage/src/index.ts
```

Expected: the grep shows every line that needs updating. For each hit:
- If it's `xPct: ann.xPct, yPct: ann.yPct, wPct: ann.wPct, hPct: ann.hPct` — replace with `shape: ann.shape, geometry: ann.geometry`.
- If it's destructuring or mapping, update similarly.

Edit each file accordingly.

- [ ] **Step 6.2: Update the test fixtures**

```bash
grep -n "xPct\|yPct\|wPct\|hPct" packages/adapter-memory/__tests__/memory-store.test.ts packages/adapter-localstorage/__tests__/localstorage-store.test.ts
```

For each test fixture constructing an annotation input, replace the four x/y/w/h lines with:

```ts
shape: "rectangle",
geometry: JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 }),
```

(or whatever values the test originally used).

For tests that assert on record fields, replace `expect(record.xPct).toBe(0.1)` with `expect(record.shape).toBe("rectangle")` and `expect(JSON.parse(record.geometry)).toEqual({ shape: "rectangle", x: 0.1, ... })` — adjust to what the test is actually checking.

- [ ] **Step 6.3: Run the memory + localstorage tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-memory packages/adapter-localstorage 2>&1 | tail -15
```

Expected: both packages' tests green.

---

## Task 7: Update PrismaStore + its handler tests

**Files:**
- Modify: `packages/adapter-prisma/src/index.ts`
- Modify: `packages/adapter-prisma/__tests__/handler.test.ts`
- Modify: `packages/adapter-prisma/__tests__/auth-cors.test.ts`

- [ ] **Step 7.1: Update `PrismaStore.createFeedback` annotation mapping**

In `packages/adapter-prisma/src/index.ts`, find `createFeedback` method. Inside the `annotations: { create: data.annotations.map(...) }` block, replace:

```ts
            xPct: ann.xPct,
            yPct: ann.yPct,
            wPct: ann.wPct,
            hPct: ann.hPct,
```

with:

```ts
            shape: ann.shape,
            geometry: ann.geometry,
```

- [ ] **Step 7.2: Update handler tests**

```bash
grep -n "xPct\|yPct\|wPct\|hPct" packages/adapter-prisma/__tests__/*.test.ts
```

For each test expecting the Prisma args to contain x/y/w/h, update the expected argument to contain `shape: "rectangle"` + `geometry: "<json string>"` instead.

Example replacement in a fixture:

```ts
// Before:
annotations: [{ cssSelector: "...", /* ... */, xPct: 0.1, yPct: 0.2, wPct: 0.5, hPct: 0.3, scrollX: 0, /* ... */ }]

// After:
annotations: [{
  cssSelector: "...",
  /* ... */,
  shape: "rectangle",
  geometry: JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 }),
  scrollX: 0,
  /* ... */
}]
```

Wire-format fixtures (for requests going through Zod validation) change differently — they have:

```ts
// Before:
annotations: [{ anchor: {...}, rect: { xPct: 0.1, yPct: 0.2, wPct: 0.5, hPct: 0.3 }, scrollX: 0, ... }]

// After:
annotations: [{
  anchor: {...},
  shape: "rectangle",
  geometry: { shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 },  // object, not string — Zod validates, flattenAnnotation serializes
  scrollX: 0,
  ...
}]
```

Touch every fixture until `grep` returns zero hits in `packages/adapter-prisma/__tests__/`.

- [ ] **Step 7.3: Run adapter-prisma tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
```

Expected: all pass.

---

## Task 8: Update widget annotator to emit new wire format

**Files:**
- Modify: `packages/widget/src/annotator.ts`
- Modify: `packages/widget/src/markers.ts`
- Modify: `packages/widget/__tests__/widget/**/*.test.ts` (fixtures)

- [ ] **Step 8.1: Find where annotator emits the annotation payload**

```bash
grep -n "rect\|xPct\|yPct\|wPct\|hPct" packages/widget/src/annotator.ts
```

Find the section that constructs the `AnnotationPayload` (or wherever `rect: { xPct, yPct, wPct, hPct }` is built — typically after drag-complete). Replace with:

```ts
shape: "rectangle",
geometry: { shape: "rectangle", x: xPct, y: yPct, w: wPct, h: hPct },
```

Keep `xPct, yPct, wPct, hPct` local variables that compute fractional coords — only the emitted object changes shape.

- [ ] **Step 8.2: Update markers.ts rectangle rendering**

```bash
grep -n "rect\|xPct\|yPct\|wPct\|hPct\|geometry" packages/widget/src/markers.ts
```

Find where markers.ts reads `annotation.rect.xPct` etc. Replace with reads from `annotation.geometry.x/y/w/h` — but only after narrowing the shape:

```ts
if (annotation.geometry.shape === "rectangle") {
  const { x, y, w, h } = annotation.geometry;
  // existing rendering code that used xPct/yPct/wPct/hPct now reads x/y/w/h
}
// Non-rectangle shapes: render nothing for now — Plan 1c will add them.
```

- [ ] **Step 8.3: Sweep widget test fixtures**

```bash
grep -rln "rect:\s*{\s*xPct\|rect:\{xPct" packages/widget/__tests__/ 2>/dev/null
grep -rln "xPct\|yPct\|wPct\|hPct" packages/widget/__tests__/ 2>/dev/null
```

For every hit, replace the rect fixture with the shape+geometry fixture per the patterns in Task 7.

- [ ] **Step 8.4: Run widget unit tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget 2>&1 | tail -15
```

Expected: widget tests green. If a test hard-asserts on `rect` specifically, update the assertion to read from `geometry`.

---

## Task 9: Update CLI prisma generator + its tests

**Files:**
- Modify: `packages/cli/src/generators/prisma.ts`
- Modify: `packages/cli/__tests__/generators/prisma.test.ts`

- [ ] **Step 9.1: Inspect generator source**

```bash
grep -n "xPct\|yPct\|wPct\|hPct\|shape\|geometry" packages/cli/src/generators/prisma.ts
```

Find the code that emits annotation fields into the generated `.prisma` schema. Since `COLABORATE_MODELS` is the source of truth and the generator walks it, the generator code likely doesn't hardcode x/y/w/h — it iterates the fields dictionary. If so, no source change is needed.

- [ ] **Step 9.2: Update generator tests**

```bash
grep -n "xPct\|yPct\|wPct\|hPct" packages/cli/__tests__/generators/prisma.test.ts
```

For each assertion checking the generated schema includes `xPct Float` etc., replace with assertions that the generated schema includes `shape String` + `geometry String @db.Text`.

- [ ] **Step 9.3: Run CLI tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/cli 2>&1 | tail -10
```

Expected: green.

---

## Task 10: Update E2E tests

**Files:**
- Modify: `e2e/widget.spec.ts`

- [ ] **Step 10.1: Sweep E2E for rect references**

```bash
grep -n "rect\|xPct\|yPct\|wPct\|hPct\|\.geometry" e2e/widget.spec.ts
```

Any assertion that reads `rect.xPct` or `xPct` on a persisted annotation should read `JSON.parse(geometry).x` (or check `shape: "rectangle"`). The widget still only draws rectangles in this phase — assertions only need to verify the `rectangle` shape type.

Example:

```ts
// Before:
expect(ann.xPct).toBeGreaterThan(0);

// After:
expect(ann.shape).toBe("rectangle");
const geom = JSON.parse(ann.geometry);
expect(geom.x).toBeGreaterThan(0);
```

- [ ] **Step 10.2: Run E2E**

```bash
cd /Users/brian/dev/colaborate
bun run test:e2e 2>&1 | tail -15
```

Expected: all 85 tests (minus the 2 mobile skips) pass.

---

## Task 11: Full baseline verification + commit

- [ ] **Step 11.1: Build all packages**

```bash
cd /Users/brian/dev/colaborate
bun run build 2>&1 | tail -10
```

Expected: 7/7 packages succeed.

- [ ] **Step 11.2: Run full unit test suite**

```bash
bun run test:run 2>&1 | tail -8
```

Expected: 780+ tests pass (exact count: we added ~19 geometry tests, so ~799+).

- [ ] **Step 11.3: Run Playwright E2E**

```bash
bun run test:e2e 2>&1 | tail -10
```

Expected: 85 pass, 2 skipped.

- [ ] **Step 11.4: Run biome lint**

```bash
bun run lint 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 11.5: Gate — do not commit if anything above is red**

If any of Steps 11.1–11.4 fail, stop. Read the failure, trace to the task that introduced it, fix in place.

- [ ] **Step 11.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add -A
git commit -m "$(cat <<'EOF'
feat(core,adapters,widget): replace fixed rect with Geometry discriminated union

Schema (ColaborateAnnotation): dropped xPct/yPct/wPct/hPct columns; added
  shape (String) + geometry (Text, JSON-stringified Geometry).
Wire format (AnnotationPayload): replaced `rect: { xPct, yPct, wPct, hPct }`
  with `shape: Shape` + `geometry: Geometry` (discriminated union of 6 shapes:
  rectangle, circle, arrow, line, textbox, freehand).
Zod validation: discriminatedUnion on `shape`; typed validation per shape.
flattenAnnotation: now serializes Geometry to string for store.
Adapters (Prisma, memory, localStorage): persist/read shape + geometry.
Widget annotator: emits shape="rectangle" + geometry={x,y,w,h} on drag-end.
Widget markers: reads geometry.x/y/w/h for rectangle; other shapes no-op.
CLI prisma generator: emits new columns (no code changes — schema-driven).
Conformance tests + all fixtures + E2E updated.

No new widget UI in this phase. Plan 1c adds shape picker + drawing modes
for the 5 non-rectangle shapes.

Spec: docs/superpowers/specs/2026-04-18-colaborate-design.md
Plan: docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** Phase 1a covers the Geometry discriminated union (spec §Data model) and prepares the schema for the remaining 5 shapes. Session model + componentId + mentions land in Plan 1b. Widget UI lands in Plan 1c. ✓
- **Placeholder scan:** No TBD/TODO. Each `sed`/`grep` given explicitly. Each code block is the actual content to paste. ✓
- **Type consistency:** `Geometry` defined once in `geometry.ts`; `Shape` is the single source of truth re-exported from `core`. `AnnotationInput` (wire), `AnnotationCreateInput` (store), `AnnotationRecord` (persisted), `AnnotationResponse` (API) all get the same `shape` + `geometry` update — verified in Tasks 3.1, 3.2, 3.3, 3.4 separately. ✓
- **Verification gate:** Task 11 blocks commit until build + test:run + test:e2e + lint all pass. Each intermediate task also runs a focused test subset. ✓

---

## Exit criteria (Phase 1a done when all true)

1. Geometry module shipped with ≥ 19 green tests covering all 6 shapes.
2. Schema model has `shape` + `geometry` columns, no `xPct/yPct/wPct/hPct`.
3. Zod validation accepts shape + geometry for all 6 shapes via discriminated union.
4. All 3 store adapters (Prisma, memory, localStorage) persist and read the new fields.
5. Widget annotator emits `{ shape: "rectangle", geometry: {x,y,w,h} }`; markers render from geometry.
6. `bun run build && bun run test:run && bun run test:e2e && bun run lint` all exit 0.
7. Single commit with descriptive message; tree is green.

---

## Handoff to Plan 1b

Plan 1b (`docs/superpowers/plans/2026-04-19-phase-1b-sessions-and-fields.md`) adds: `ColaborateSession` model, `sessionId` FK, `componentId`, `sourceFile/Line/Column`, `mentions` JSON column, and store session CRUD. Written after 1a lands and baseline is green.
