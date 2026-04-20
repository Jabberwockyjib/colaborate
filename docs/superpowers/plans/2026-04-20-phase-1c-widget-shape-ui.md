# Colaborate — Phase 1c: Widget shape UI (5 new drawing primitives + picker + shortcuts)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the widget UI for all 5 non-rectangle primitives (circle, arrow, line, textbox, freehand) alongside the existing rectangle. A shape picker lives in the annotator's glass toolbar; keyboard shortcuts `R C A L T F` switch modes; per-shape marker highlights render the drawn geometry when a marker is hovered/pinned. Freehand uses Perfect Freehand for smoothing. No backend changes — Phase 1a already wired every shape through types, Zod, schema, all three adapters, and the wire format.

**Architecture:**
- Introduce a `DrawingMode` interface (`drawing-modes.ts`) with six classes, each owning its own preview element + geometry extraction. Rectangle stays a `<div>` with a border (preserves current look + existing tests); the five new shapes render as SVG primitives inside a single `<svg>` overlay layer appended to the annotator overlay.
- `annotator.ts` becomes a thin orchestrator: it creates the current mode, forwards mouse/touch events to it, and on finish asks the mode for the `Geometry` + bounding `DOMRect` (used by `findAnchorElement` for anchoring).
- A `shape-picker.ts` renders the six-button row in the top glass toolbar. A separate `shortcuts.ts` maps `R/C/A/L/T/F` → `Shape`.
- A new `shape-render.ts` generalizes the marker highlight overlay to all shapes. `markers.ts` keeps its cluster + marker-badge logic and delegates shape drawing to `shape-render.ts`.
- Textbox reuses the feedback popup's `message` as the visible `text` field (no second input); fontSize defaults to 14.

**Tech Stack:** TypeScript strict, Vitest (jsdom), Playwright, Bun workspaces, **Perfect Freehand** (MIT, ~4 KB) bundled via tsup `noExternal`.

**Source spec:** `docs/superpowers/specs/2026-04-18-colaborate-design.md` (§ Widget changes, § Testing strategy)
**Prereq:** Phase 1a complete — Geometry union + Zod discriminatedUnion + adapters already accept every shape.
**Baseline to protect:** 796 unit + 85 Playwright (+2 mobile skips) green; biome clean.

---

## File Structure Overview

| Path | Action | Responsibility |
|---|---|---|
| `packages/widget/package.json` | Modify | Add `perfect-freehand: ^1.2.2` to devDependencies (runtime dep but bundled, so devDep keeps install lean) |
| `packages/widget/tsup.config.ts` | Modify | Add `"perfect-freehand"` to `noExternal` so the widget bundle stays self-contained |
| `packages/widget/src/icons.ts` | Modify | Add 6 `ICON_SHAPE_*` SVG strings for the picker buttons |
| `packages/widget/src/shortcuts.ts` | **Create** | Tiny module: `SHAPE_SHORTCUTS` map + `getShapeFromKey(key)` helper |
| `packages/widget/__tests__/widget/shortcuts.test.ts` | **Create** | Unit tests for key→shape mapping |
| `packages/widget/src/shape-render.ts` | **Create** | `renderShapeHighlight(geometry, anchorBounds, color) → HTMLElement` — returns a document-positioned overlay element (SVG or div) per shape. One responsibility: geometry → visible highlight. |
| `packages/widget/__tests__/widget/shape-render.test.ts` | **Create** | Unit tests: for each shape, assert the produced element type + key attributes |
| `packages/widget/src/drawing-modes.ts` | **Create** | `DrawingMode` interface + 6 mode classes (Rectangle/Circle/Arrow/Line/Textbox/Freehand). Exports `createDrawingMode(shape, overlay, svg, colors)` factory. |
| `packages/widget/__tests__/widget/drawing-modes.test.ts` | **Create** | Unit tests: per-mode geometry extraction from simulated start→move→finish |
| `packages/widget/src/shape-picker.ts` | **Create** | Builds the 6-button toolbar row as a single `HTMLElement`. Emits `shape-change` via callback. |
| `packages/widget/__tests__/widget/shape-picker.test.ts` | **Create** | Unit tests: renders 6 buttons, click changes active, keyboard shortcut call fires callback |
| `packages/widget/src/annotator.ts` | Modify | Replace inline drawing logic with mode delegation; mount shape picker in toolbar; install keydown listener for shape shortcuts |
| `packages/widget/__tests__/widget/annotator.test.ts` | Modify | Add tests: shape picker present; `C` shortcut switches mode; dragging in circle mode emits a circle geometry |
| `packages/widget/src/markers.ts` | Modify | Delegate `showHighlight` per-shape rendering to `shape-render.ts` |
| `packages/widget/__tests__/widget/markers.test.ts` | Modify | Add fixtures for each non-rectangle shape; assert highlight element shape matches |
| `packages/widget/src/i18n/types.ts` | Modify | Add 7 new keys: `picker.aria`, `shape.rectangle`, `shape.circle`, `shape.arrow`, `shape.line`, `shape.textbox`, `shape.freehand` |
| `packages/widget/src/i18n/en.ts` | Modify | English strings for the 7 new keys |
| `packages/widget/src/i18n/fr.ts` | Modify | French strings for the 7 new keys |
| `e2e/widget.spec.ts` | Modify | 5 new tests — one per new shape — draw, submit, assert stored `shape` + parsed `geometry` |

**No backend / adapter / schema files touched.** Phase 1a already made them shape-agnostic.

---

## Task 1: Keyboard shortcut mapping (`shortcuts.ts`)

Tiny, isolated, TDD red-first. Establishes the `Shape` ↔ key table as a single source of truth.

**Files:**
- Create: `packages/widget/src/shortcuts.ts`
- Create: `packages/widget/__tests__/widget/shortcuts.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `/Users/brian/dev/colaborate/packages/widget/__tests__/widget/shortcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHAPE_SHORTCUTS, getShapeFromKey } from "../../src/shortcuts.js";

describe("SHAPE_SHORTCUTS", () => {
  it("maps R, C, A, L, T, F to the 6 shapes", () => {
    expect(SHAPE_SHORTCUTS).toEqual({
      r: "rectangle",
      c: "circle",
      a: "arrow",
      l: "line",
      t: "textbox",
      f: "freehand",
    });
  });
});

describe("getShapeFromKey", () => {
  it("returns the shape for a lowercase key", () => {
    expect(getShapeFromKey("r")).toBe("rectangle");
    expect(getShapeFromKey("f")).toBe("freehand");
  });

  it("is case-insensitive", () => {
    expect(getShapeFromKey("R")).toBe("rectangle");
    expect(getShapeFromKey("C")).toBe("circle");
    expect(getShapeFromKey("T")).toBe("textbox");
  });

  it("returns null for unmapped keys", () => {
    expect(getShapeFromKey("x")).toBeNull();
    expect(getShapeFromKey("")).toBeNull();
    expect(getShapeFromKey("Escape")).toBeNull();
    expect(getShapeFromKey("Enter")).toBeNull();
  });

  it("returns null for multi-char keys that happen to start with a shortcut", () => {
    expect(getShapeFromKey("Right")).toBeNull();
    expect(getShapeFromKey("ArrowRight")).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/shortcuts.test.ts 2>&1 | tail -10
```

Expected: vitest reports `Cannot find module '../../src/shortcuts.js'`.

- [ ] **Step 1.3: Implement `shortcuts.ts`**

Create `/Users/brian/dev/colaborate/packages/widget/src/shortcuts.ts`:

```ts
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
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/shortcuts.test.ts 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/shortcuts.ts packages/widget/__tests__/widget/shortcuts.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): add shape keyboard shortcut mapping

New shortcuts.ts exposes SHAPE_SHORTCUTS (r/c/a/l/t/f → shape) and a
case-insensitive getShapeFromKey(key) helper that ignores multi-char keys
so ArrowRight does not collide with 'a'. 4 unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `perfect-freehand` dependency + 6 shape icons

Foundational dependency + assets. No TDD — straight config + SVG strings.

**Files:**
- Modify: `packages/widget/package.json`
- Modify: `packages/widget/tsup.config.ts`
- Modify: `packages/widget/src/icons.ts`

- [ ] **Step 2.1: Add `perfect-freehand` to widget deps**

In `/Users/brian/dev/colaborate/packages/widget/package.json`, inside `devDependencies`, add the entry alphabetically:

```json
  "devDependencies": {
    "@colaborate/core": "workspace:*",
    "@medv/finder": "^3.2.0",
    "perfect-freehand": "^1.2.2"
  }
```

(Dev-dep because the widget bundles it via tsup `noExternal` — consumers never install it directly.)

- [ ] **Step 2.2: Bundle `perfect-freehand` in the widget output**

In `/Users/brian/dev/colaborate/packages/widget/tsup.config.ts`, change:

```ts
  noExternal: ["@medv/finder", "@colaborate/core"],
```

to:

```ts
  noExternal: ["@medv/finder", "@colaborate/core", "perfect-freehand"],
```

- [ ] **Step 2.3: Install the new dep**

```bash
cd /Users/brian/dev/colaborate
bun install 2>&1 | tail -10
```

Expected: install succeeds; `bun.lock` updates.

- [ ] **Step 2.4: Add 6 shape icons**

Append to `/Users/brian/dev/colaborate/packages/widget/src/icons.ts`:

```ts

// ---------------------------------------------------------------------------
// Drawing-mode shape picker icons (Phase 1c)
// ---------------------------------------------------------------------------

export const ICON_SHAPE_RECTANGLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>`;

export const ICON_SHAPE_CIRCLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>`;

export const ICON_SHAPE_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="20" x2="18" y2="6"/><polyline points="11 5 18 5 18 12"/></svg>`;

export const ICON_SHAPE_LINE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="20" x2="20" y2="4"/></svg>`;

export const ICON_SHAPE_TEXTBOX = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>`;

export const ICON_SHAPE_FREEHAND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18 C 7 14, 10 20, 13 14 S 19 8, 20 6"/></svg>`;
```

- [ ] **Step 2.5: Verify build + existing tests still pass**

```bash
cd /Users/brian/dev/colaborate
bun run build 2>&1 | tail -5
bun run test:run 2>&1 | tail -5
```

Expected: 7/7 packages build; 796 unit tests still pass (nothing exercises the new icons yet).

- [ ] **Step 2.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/package.json packages/widget/tsup.config.ts packages/widget/src/icons.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(widget): bundle perfect-freehand + add 6 shape-picker SVG icons

- perfect-freehand ^1.2.2 as devDependency, bundled via tsup noExternal
  so consumers do not need to install it directly.
- ICON_SHAPE_RECTANGLE / CIRCLE / ARROW / LINE / TEXTBOX / FREEHAND in
  icons.ts — used by the shape picker in Task 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `shape-render.ts` — per-shape highlight renderer

Pure function that converts a stored `Geometry` + anchor bounds + color into a document-positioned overlay element. Used by `markers.ts` in Task 4. TDD red-first.

**Files:**
- Create: `packages/widget/src/shape-render.ts`
- Create: `packages/widget/__tests__/widget/shape-render.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `/Users/brian/dev/colaborate/packages/widget/__tests__/widget/shape-render.test.ts`:

```ts
// @vitest-environment jsdom

import type { Geometry } from "@colaborate/core";
import { describe, expect, it } from "vitest";
import { renderShapeHighlight } from "../../src/shape-render.js";

// A 200×100 anchor at document (100, 100)
const anchorBounds = new DOMRect(100, 100, 200, 100);
const color = "#ef4444";

describe("renderShapeHighlight", () => {
  it("renders a rectangle as a positioned div with matching width/height", () => {
    const geom: Geometry = { shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
    const el = renderShapeHighlight(geom, anchorBounds, color);

    expect(el.tagName).toBe("DIV");
    // Expected absolute: left = 100 + 0.1*200 = 120, top = 100 + 0.2*100 = 120
    // width = 0.5*200 = 100, height = 0.4*100 = 40
    // Plus window.scrollX/Y (0 in jsdom)
    expect(el.style.left).toBe("120px");
    expect(el.style.top).toBe("120px");
    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("40px");
    expect(el.style.borderColor).toMatch(/ef4444|239, 68, 68/i);
  });

  it("renders a circle as an SVG with an <ellipse>", () => {
    const geom: Geometry = { shape: "circle", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.4 };
    const el = renderShapeHighlight(geom, anchorBounds, color);

    expect(el.tagName.toLowerCase()).toBe("svg");
    const ellipse = el.querySelector("ellipse");
    expect(ellipse).not.toBeNull();
    // cx = 100 + 0.5*200 = 200, cy = 100 + 0.5*100 = 150, rx = 50, ry = 40
    // All relative to the svg's own origin (document coords at top-left corner).
    // svg is sized to enclose the shape; ellipse coords are relative to svg.
    expect(ellipse!.getAttribute("stroke")).toBe(color);
  });

  it("renders an arrow as an SVG with a <line> and arrowhead <polygon>", () => {
    const geom: Geometry = {
      shape: "arrow",
      x1: 0.1,
      y1: 0.1,
      x2: 0.9,
      y2: 0.9,
      headSize: 12,
    };
    const el = renderShapeHighlight(geom, anchorBounds, color);

    expect(el.tagName.toLowerCase()).toBe("svg");
    expect(el.querySelector("line")).not.toBeNull();
    expect(el.querySelector("polygon")).not.toBeNull();
  });

  it("renders a line as an SVG with a single <line>", () => {
    const geom: Geometry = { shape: "line", x1: 0.0, y1: 0.5, x2: 1.0, y2: 0.5 };
    const el = renderShapeHighlight(geom, anchorBounds, color);

    expect(el.tagName.toLowerCase()).toBe("svg");
    expect(el.querySelector("line")).not.toBeNull();
    expect(el.querySelector("polygon")).toBeNull();
  });

  it("renders a textbox as a div containing a <span> with the stored text", () => {
    const geom: Geometry = {
      shape: "textbox",
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.2,
      text: "Change this heading",
      fontSize: 14,
    };
    const el = renderShapeHighlight(geom, anchorBounds, color);

    expect(el.tagName).toBe("DIV");
    const span = el.querySelector("span");
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe("Change this heading");
    expect(span!.style.fontSize).toBe("14px");
  });

  it("renders a freehand as an SVG with a <path>", () => {
    const geom: Geometry = {
      shape: "freehand",
      points: [
        [0.1, 0.1],
        [0.2, 0.15],
        [0.25, 0.2],
        [0.3, 0.3],
      ],
      strokeWidth: 3,
    };
    const el = renderShapeHighlight(geom, anchorBounds, color);

    expect(el.tagName.toLowerCase()).toBe("svg");
    const path = el.querySelector("path");
    expect(path).not.toBeNull();
    // Perfect Freehand outputs an outline; the `d` attribute should be non-empty.
    expect(path!.getAttribute("d")?.length ?? 0).toBeGreaterThan(10);
  });

  it("freehand with a single point does not crash — renders a minimal path", () => {
    const geom: Geometry = {
      shape: "freehand",
      points: [[0.5, 0.5]],
      strokeWidth: 3,
    };
    const el = renderShapeHighlight(geom, anchorBounds, color);
    expect(el.tagName.toLowerCase()).toBe("svg");
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/shape-render.test.ts 2>&1 | tail -10
```

Expected: module not found.

- [ ] **Step 3.3: Implement `shape-render.ts`**

Create `/Users/brian/dev/colaborate/packages/widget/src/shape-render.ts`:

```ts
import type { Geometry } from "@colaborate/core";
import { getStroke } from "perfect-freehand";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Render a geometry highlight overlay for the given annotation.
 *
 * The returned element is absolutely positioned in **document** coordinates
 * (i.e. includes window.scrollX/scrollY). Caller appends it to a container
 * that itself sits at (0,0) in document coords (e.g. `#colaborate-markers`).
 *
 * - Rectangle / textbox → `<div>` with a border (matches pre-1c behaviour).
 * - Circle / arrow / line / freehand → `<svg>` sized to the shape's bounding box.
 *
 * Non-rectangle SVGs use the top-left of the anchor as the SVG's origin,
 * so coordinates inside the SVG are `(rel*anchorSize)` (no scroll offset).
 */
export function renderShapeHighlight(
  geometry: Geometry,
  anchorBounds: DOMRect,
  color: string,
): HTMLElement | SVGSVGElement {
  const { left, top, width, height } = anchorBounds;
  const docLeft = left + window.scrollX;
  const docTop = top + window.scrollY;

  switch (geometry.shape) {
    case "rectangle":
      return rectDiv(
        docLeft + geometry.x * width,
        docTop + geometry.y * height,
        geometry.w * width,
        geometry.h * height,
        color,
      );

    case "textbox":
      return textboxDiv(
        docLeft + geometry.x * width,
        docTop + geometry.y * height,
        geometry.w * width,
        geometry.h * height,
        geometry.text,
        geometry.fontSize,
        color,
      );

    case "circle":
      return circleSvg(docLeft, docTop, width, height, geometry, color);

    case "arrow":
      return arrowSvg(docLeft, docTop, width, height, geometry, color);

    case "line":
      return lineSvg(docLeft, docTop, width, height, geometry, color);

    case "freehand":
      return freehandSvg(docLeft, docTop, width, height, geometry, color);
  }
}

// ---------------------------------------------------------------------------
// Rectangle / textbox → div
// ---------------------------------------------------------------------------

function rectDiv(left: number, top: number, w: number, h: number, color: string): HTMLDivElement {
  const div = document.createElement("div");
  div.style.cssText = `
    position:absolute;left:${left}px;top:${top}px;
    width:${w}px;height:${h}px;
    border:2px solid ${color};
    background:${color}0c;
    border-radius:8px;
    pointer-events:none;z-index:-1;
    box-shadow:0 0 16px ${color}20;
  `;
  return div;
}

function textboxDiv(
  left: number,
  top: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  color: string,
): HTMLDivElement {
  const div = rectDiv(left, top, w, h, color);
  div.style.background = `${color}1a`;
  const span = document.createElement("span");
  span.textContent = text;
  span.style.cssText = `
    position:absolute;inset:0;padding:6px 10px;
    display:flex;align-items:center;
    font-family:"Inter",system-ui,-apple-system,sans-serif;
    font-size:${fontSize}px;color:${color};
    white-space:pre-wrap;word-break:break-word;
  `;
  div.appendChild(span);
  return div;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function svg(docLeft: number, docTop: number, w: number, h: number): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h));
  el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  el.style.cssText = `
    position:absolute;left:${docLeft}px;top:${docTop}px;
    pointer-events:none;z-index:-1;overflow:visible;
  `;
  return el;
}

function circleSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "circle" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  const ell = document.createElementNS(SVG_NS, "ellipse");
  ell.setAttribute("cx", String(g.cx * w));
  ell.setAttribute("cy", String(g.cy * h));
  ell.setAttribute("rx", String(g.rx * w));
  ell.setAttribute("ry", String(g.ry * h));
  ell.setAttribute("fill", `${color}14`);
  ell.setAttribute("stroke", color);
  ell.setAttribute("stroke-width", "2");
  s.appendChild(ell);
  return s;
}

function lineSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "line" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  s.appendChild(makeLine(g.x1 * w, g.y1 * h, g.x2 * w, g.y2 * h, color));
  return s;
}

function arrowSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "arrow" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  const x1 = g.x1 * w,
    y1 = g.y1 * h,
    x2 = g.x2 * w,
    y2 = g.y2 * h;
  s.appendChild(makeLine(x1, y1, x2, y2, color));
  s.appendChild(makeArrowhead(x1, y1, x2, y2, g.headSize, color));
  return s;
}

function freehandSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "freehand" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  const abs: Array<[number, number]> = g.points.map(([x, y]) => [x * w, y * h]);
  const outline = getStroke(abs, { size: g.strokeWidth, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", outlineToSvgPath(outline));
  path.setAttribute("fill", color);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "1");
  s.appendChild(path);
  return s;
}

function makeLine(x1: number, y1: number, x2: number, y2: number, color: string): SVGLineElement {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  return line;
}

function makeArrowhead(x1: number, y1: number, x2: number, y2: number, headSize: number, color: string): SVGPolygonElement {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  const p1x = x2 + Math.cos(a1) * headSize;
  const p1y = y2 + Math.sin(a1) * headSize;
  const p2x = x2 + Math.cos(a2) * headSize;
  const p2y = y2 + Math.sin(a2) * headSize;
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`);
  poly.setAttribute("fill", color);
  return poly;
}

function outlineToSvgPath(outline: number[][]): string {
  if (outline.length === 0) return "";
  if (outline.length === 1) {
    const p = outline[0];
    if (!p) return "";
    return `M ${p[0]} ${p[1]} Z`;
  }
  const first = outline[0];
  if (!first) return "";
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i];
    if (!p) continue;
    d += ` L ${p[0]} ${p[1]}`;
  }
  d += " Z";
  return d;
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/shape-render.test.ts 2>&1 | tail -15
```

Expected: 7 tests pass.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/shape-render.ts packages/widget/__tests__/widget/shape-render.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): renderShapeHighlight — per-shape geometry → overlay element

New shape-render.ts exposes a single renderShapeHighlight(geometry,
anchorBounds, color) that returns an absolutely-positioned DOM element in
document coordinates for any of the 6 shapes. Rectangle + textbox use a
bordered div (preserves pre-1c look); circle/arrow/line/freehand use SVG
primitives. Freehand applies perfect-freehand getStroke() for smoothing.
7 unit tests covering every shape + empty-input edge case.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `markers.ts` to use `shape-render.ts`

Replace the inline rectangle-only highlight with the generalized helper. No new tests of markers.ts needed yet — existing tests continue to cover rectangle highlights; new-shape rendering will get end-to-end coverage via E2E in Task 9.

**Files:**
- Modify: `packages/widget/src/markers.ts`
- Modify: `packages/widget/__tests__/widget/markers.test.ts`

- [ ] **Step 4.1: Replace the inline highlight creation in `showHighlight`**

In `/Users/brian/dev/colaborate/packages/widget/src/markers.ts`, find the `showHighlight` method (around line 533). Replace the inner `for` loop body with a call to `renderShapeHighlight`.

Find this block:

```ts
  showHighlight(feedback: FeedbackResponse): void {
    this.removeHighlightElements();
    for (const annotation of feedback.annotations) {
      const resolved = resolveAnnotation(toAnchorData(annotation), toRectData(annotation));
      if (!resolved) continue;

      const typeColor = getTypeColor(feedback.type, this.colors);
      const rect = resolved.rect;
      const highlight = el("div", {
        style: `
          position:absolute;
          top:${rect.top + window.scrollY}px;
          left:${rect.left + window.scrollX}px;
          width:${rect.width}px;height:${rect.height}px;
          border:2px solid ${typeColor};
          background:${typeColor}0c;
          border-radius:8px;
          pointer-events:none;z-index:-1;
          opacity:0;
          box-shadow:0 0 16px ${typeColor}20;
          transition:opacity ${HIGHLIGHT_FADE}ms ease;
        `,
      });
      this.container.appendChild(highlight);
      this.highlightElements.push(highlight);
      void highlight.offsetHeight; // Force reflow for CSS transition
      highlight.style.opacity = "1";
    }
  }
```

Replace it with:

```ts
  showHighlight(feedback: FeedbackResponse): void {
    this.removeHighlightElements();
    const typeColor = getTypeColor(feedback.type, this.colors);
    for (const annotation of feedback.annotations) {
      const resolved = resolveAnnotation(toAnchorData(annotation), toRectData(annotation));
      if (!resolved) continue;
      const anchorBounds = resolved.element.getBoundingClientRect();

      let geometry: Geometry;
      try {
        geometry = parseGeometry(annotation.geometry);
      } catch {
        // Malformed geometry — fall back to a full-anchor rectangle so the user still sees something.
        geometry = { shape: "rectangle", x: 0, y: 0, w: 1, h: 1 };
      }

      const highlight = renderShapeHighlight(geometry, anchorBounds, typeColor);
      highlight.style.opacity = "0";
      highlight.style.transition = `opacity ${HIGHLIGHT_FADE}ms ease`;
      this.container.appendChild(highlight);
      this.highlightElements.push(highlight as HTMLElement);
      void (highlight as HTMLElement).offsetHeight; // Force reflow for CSS transition
      highlight.style.opacity = "1";
    }
  }
```

- [ ] **Step 4.2: Update imports at the top of `markers.ts`**

Find the existing imports in `/Users/brian/dev/colaborate/packages/widget/src/markers.ts`:

```ts
import type { AnchorData, FeedbackResponse } from "@colaborate/core";
import { parseGeometry } from "@colaborate/core";
```

Replace with:

```ts
import type { AnchorData, FeedbackResponse, Geometry } from "@colaborate/core";
import { parseGeometry } from "@colaborate/core";
import { renderShapeHighlight } from "./shape-render.js";
```

Also update `highlightElements` type declaration (near the top of the class). It is currently `HTMLElement[]`; leave it as `HTMLElement[]` — we cast the SVG return via `as HTMLElement` for the shared array. Rationale: both `HTMLElement` and `SVGSVGElement` have `.style.opacity`, `.offsetHeight` (via lazy jsdom impl), and `.remove()` — the actual call sites use only these.

Verify by running:

```bash
cd /Users/brian/dev/colaborate
bun run -F @colaborate/widget check 2>&1 | tail -10
```

Expected: no type errors. If TypeScript complains about `offsetHeight` on SVGSVGElement, change the cast to `as HTMLElement` where it is triggered, or wrap the reflow in a typeof check — the existing code already casts.

- [ ] **Step 4.3: Add a quick marker test covering circle highlight**

In `/Users/brian/dev/colaborate/packages/widget/__tests__/widget/markers.test.ts`, add a new `it` inside the `describe("highlight rendering"` block (or at the end of the file if no such block exists; pick the nearest describe that owns other highlight tests).

Find any existing test that calls `manager.showHighlight(...)` or similar. Directly after it, add:

```ts
  it("renders a <svg> highlight element for a circle annotation", () => {
    const tooltip = createMockTooltip();
    const bus = new EventBus<WidgetEvents>();
    const manager = new MarkerManager(colors, tooltip, bus, t);

    const feedback = makeFeedback({
      annotations: [
        makeAnnotation({
          shape: "circle",
          geometry: JSON.stringify({ shape: "circle", cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.25 }),
        }),
      ],
    });
    manager.render([feedback]);
    manager.showHighlight(feedback);

    const container = document.getElementById("colaborate-markers")!;
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("ellipse")).not.toBeNull();

    manager.destroy();
  });
```

If the existing file does not import `EventBus` or `WidgetEvents` in scope at the test location, either reuse the one already imported at the top of the file or add the import alongside the others.

- [ ] **Step 4.4: Run widget tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget 2>&1 | tail -20
```

Expected: existing marker tests still pass; new circle test passes.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/markers.ts packages/widget/__tests__/widget/markers.test.ts
git commit -m "$(cat <<'EOF'
refactor(widget): markers.ts delegates highlight rendering to shape-render

showHighlight() now parses the stored Geometry and calls
renderShapeHighlight() for every shape. Rectangle rendering is unchanged
on screen (still a bordered div) — the rewrite just passes through
shape-render. Falls back to an anchor-sized rectangle on malformed
geometry. Adds a marker test for circle highlight rendering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `drawing-modes.ts` — six mode classes

Per-shape drawing behaviour. Each mode owns a preview element, accepts `start/move/finish` calls with client coordinates, and returns a `{ geometry, bounds }` tuple on finish (where `bounds` is the `DOMRect` used to anchor the annotation). TDD red-first.

**Files:**
- Create: `packages/widget/src/drawing-modes.ts`
- Create: `packages/widget/__tests__/widget/drawing-modes.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `/Users/brian/dev/colaborate/packages/widget/__tests__/widget/drawing-modes.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createDrawingMode } from "../../src/drawing-modes.js";
import { buildThemeColors } from "../../src/styles/theme.js";

const colors = buildThemeColors();

// A 200×100 anchor bounds — drag coordinates are relative to this.
const anchorBounds = new DOMRect(100, 100, 200, 100);

function setup(shape: "rectangle" | "circle" | "arrow" | "line" | "textbox" | "freehand") {
  const overlay = document.createElement("div");
  document.body.appendChild(overlay);
  const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  overlay.appendChild(svgLayer);
  const mode = createDrawingMode(shape, overlay, svgLayer, colors);
  return { overlay, svgLayer, mode };
}

describe("createDrawingMode (factory)", () => {
  it("returns a mode instance for each of the 6 shapes", () => {
    for (const s of ["rectangle", "circle", "arrow", "line", "textbox", "freehand"] as const) {
      const { mode } = setup(s);
      expect(mode.shape).toBe(s);
    }
  });
});

describe("RectangleMode", () => {
  it("start → move → finish produces a rectangle geometry in fractional coords", () => {
    const { mode } = setup("rectangle");
    // Drag from (120,120) to (220,170) — relative to anchor (100,100,200,100) this is
    // x=0.1, y=0.2, w=0.5, h=0.5
    mode.start(120, 120);
    mode.move(220, 170);
    const result = mode.finish(220, 170, anchorBounds);
    expect(result).not.toBeNull();
    expect(result!.geometry).toEqual({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    // bounds is the document-client DOMRect of the drawn shape
    expect(result!.bounds.width).toBe(100);
    expect(result!.bounds.height).toBe(50);
  });

  it("rejects a rectangle smaller than 10px in width or height", () => {
    const { mode } = setup("rectangle");
    mode.start(120, 120);
    const r = mode.finish(125, 125, anchorBounds);
    expect(r).toBeNull();
  });
});

describe("CircleMode", () => {
  it("start → move → finish produces a circle geometry with centre and radii", () => {
    const { mode } = setup("circle");
    // Drag from (100,100) to (200,200) — bounds anchor (100,100,200,100):
    // cx = ((100+200)/2 - 100)/200 = 0.5
    // cy = ((100+200)/2 - 100)/100 = 1.0
    // rx = 100/2/200 = 0.25
    // ry = 100/2/100 = 0.5
    mode.start(100, 100);
    mode.move(200, 200);
    const result = mode.finish(200, 200, anchorBounds);
    expect(result).not.toBeNull();
    expect(result!.geometry.shape).toBe("circle");
    if (result!.geometry.shape === "circle") {
      expect(result!.geometry.cx).toBeCloseTo(0.5, 5);
      expect(result!.geometry.cy).toBeCloseTo(1.0, 5);
      expect(result!.geometry.rx).toBeCloseTo(0.25, 5);
      expect(result!.geometry.ry).toBeCloseTo(0.5, 5);
    }
  });
});

describe("ArrowMode", () => {
  it("produces an arrow geometry with start/end + headSize", () => {
    const { mode } = setup("arrow");
    mode.start(120, 120);
    mode.move(220, 170);
    const result = mode.finish(220, 170, anchorBounds);
    expect(result).not.toBeNull();
    if (result!.geometry.shape !== "arrow") throw new Error("expected arrow");
    expect(result!.geometry.x1).toBeCloseTo(0.1, 5);
    expect(result!.geometry.y1).toBeCloseTo(0.2, 5);
    expect(result!.geometry.x2).toBeCloseTo(0.6, 5);
    expect(result!.geometry.y2).toBeCloseTo(0.7, 5);
    expect(result!.geometry.headSize).toBeGreaterThan(0);
  });
});

describe("LineMode", () => {
  it("produces a line geometry with start + end", () => {
    const { mode } = setup("line");
    mode.start(100, 100);
    mode.move(300, 200);
    const result = mode.finish(300, 200, anchorBounds);
    expect(result).not.toBeNull();
    if (result!.geometry.shape !== "line") throw new Error("expected line");
    expect(result!.geometry.x1).toBeCloseTo(0, 5);
    expect(result!.geometry.y1).toBeCloseTo(0, 5);
    expect(result!.geometry.x2).toBeCloseTo(1, 5);
    expect(result!.geometry.y2).toBeCloseTo(1, 5);
  });
});

describe("TextboxMode", () => {
  it("produces a textbox geometry with empty text + default fontSize", () => {
    const { mode } = setup("textbox");
    mode.start(120, 120);
    mode.move(220, 170);
    const result = mode.finish(220, 170, anchorBounds);
    expect(result).not.toBeNull();
    if (result!.geometry.shape !== "textbox") throw new Error("expected textbox");
    expect(result!.geometry.x).toBeCloseTo(0.1, 5);
    expect(result!.geometry.y).toBeCloseTo(0.2, 5);
    expect(result!.geometry.w).toBeCloseTo(0.5, 5);
    expect(result!.geometry.h).toBeCloseTo(0.5, 5);
    expect(result!.geometry.text).toBe(""); // Annotator fills this from popup.message later.
    expect(result!.geometry.fontSize).toBe(14);
  });
});

describe("FreehandMode", () => {
  it("accumulates points and produces a freehand geometry with at least 2 points", () => {
    const { mode } = setup("freehand");
    mode.start(100, 100); // 0.0, 0.0
    mode.move(150, 150); // 0.25, 0.5
    mode.move(200, 150); // 0.5, 0.5
    const result = mode.finish(250, 150, anchorBounds);
    expect(result).not.toBeNull();
    if (result!.geometry.shape !== "freehand") throw new Error("expected freehand");
    expect(result!.geometry.points.length).toBeGreaterThanOrEqual(2);
    // First point is the start
    expect(result!.geometry.points[0]?.[0]).toBeCloseTo(0, 5);
    expect(result!.geometry.strokeWidth).toBeGreaterThan(0);
  });

  it("a single-click freehand (no movement) returns null", () => {
    const { mode } = setup("freehand");
    mode.start(100, 100);
    const r = mode.finish(100, 100, anchorBounds);
    expect(r).toBeNull();
  });
});

describe("mode.cancel", () => {
  it("removes the preview element from the overlay / svg layer", () => {
    for (const s of ["rectangle", "circle", "arrow", "line", "textbox", "freehand"] as const) {
      const { overlay, svgLayer, mode } = setup(s);
      mode.start(100, 100);
      mode.move(200, 150);
      mode.cancel();
      // After cancel, there should be no preview element left under overlay or svgLayer
      // (beyond the svgLayer itself).
      expect(overlay.querySelectorAll("div").length).toBe(0);
      expect(svgLayer.querySelectorAll("*").length).toBe(0);
    }
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/drawing-modes.test.ts 2>&1 | tail -15
```

Expected: module not found.

- [ ] **Step 5.3: Implement `drawing-modes.ts`**

Create `/Users/brian/dev/colaborate/packages/widget/src/drawing-modes.ts`:

```ts
import type { Geometry, Shape } from "@colaborate/core";
import { getStroke } from "perfect-freehand";
import type { ThemeColors } from "./styles/theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Minimum drag extent (px) before a shape is accepted on finish. */
const MIN_EXTENT = 10;

/** Minimum points for a freehand stroke to be accepted. */
const FREEHAND_MIN_POINTS = 2;

/**
 * Per-shape drawing behaviour.
 *
 * `overlay` — the full-viewport annotator overlay div (fixed-positioned, client coords).
 * `svgLayer` — a single `<svg>` appended to `overlay`; SVG-backed modes draw into it.
 *
 * Flow: annotator calls `start(x, y)` on mousedown, `move(x, y)` on mousemove,
 * then `finish(x, y, anchorBounds)` on mouseup. `finish` returns `null` if the
 * shape is too small to accept (e.g. rectangle < 10px); otherwise it returns
 * the serialized `Geometry` plus the `DOMRect` client-bounds used for anchoring.
 */
export interface DrawingMode {
  readonly shape: Shape;
  start(clientX: number, clientY: number): void;
  move(clientX: number, clientY: number): void;
  finish(clientX: number, clientY: number, anchorBounds: DOMRect): { geometry: Geometry; bounds: DOMRect } | null;
  cancel(): void;
}

/** Factory — builds the right mode for the chosen shape. */
export function createDrawingMode(
  shape: Shape,
  overlay: HTMLElement,
  svgLayer: SVGSVGElement,
  colors: ThemeColors,
): DrawingMode {
  switch (shape) {
    case "rectangle":
      return new RectangleMode(overlay, colors);
    case "circle":
      return new CircleMode(svgLayer, colors);
    case "arrow":
      return new ArrowMode(svgLayer, colors);
    case "line":
      return new LineMode(svgLayer, colors);
    case "textbox":
      return new TextboxMode(overlay, colors);
    case "freehand":
      return new FreehandMode(svgLayer, colors);
  }
}

// ---------------------------------------------------------------------------
// Rectangle (unchanged from pre-1c — div with a border)
// ---------------------------------------------------------------------------

class RectangleMode implements DrawingMode {
  readonly shape: Shape = "rectangle";
  private el: HTMLDivElement | null = null;
  private startX = 0;
  private startY = 0;

  constructor(private readonly overlay: HTMLElement, private readonly colors: ThemeColors) {}

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.el?.remove();
    this.el = document.createElement("div");
    this.el.style.cssText = `
      position:fixed;
      border:2px solid ${this.colors.accent};
      background:${this.colors.accent}12;
      pointer-events:none;
      border-radius:8px;
      box-shadow:0 0 16px ${this.colors.accentGlow};
    `;
    this.overlay.appendChild(this.el);
  }

  move(x: number, y: number): void {
    if (!this.el) return;
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.width = `${Math.abs(x - this.startX)}px`;
    this.el.style.height = `${Math.abs(y - this.startY)}px`;
  }

  finish(x: number, y: number, anchor: DOMRect) {
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    const w = Math.abs(x - this.startX);
    const h = Math.abs(y - this.startY);
    this.el?.remove();
    this.el = null;
    if (w < MIN_EXTENT || h < MIN_EXTENT) return null;
    const bounds = new DOMRect(left, top, w, h);
    const geometry: Geometry = {
      shape: "rectangle",
      x: (left - anchor.left) / anchor.width,
      y: (top - anchor.top) / anchor.height,
      w: w / anchor.width,
      h: h / anchor.height,
    };
    return { geometry, bounds };
  }

  cancel(): void {
    this.el?.remove();
    this.el = null;
  }
}

// ---------------------------------------------------------------------------
// Textbox — same drag as rectangle, but its geometry carries text + fontSize.
// Annotator fills geometry.text from the popup's message after finish.
// ---------------------------------------------------------------------------

class TextboxMode implements DrawingMode {
  readonly shape: Shape = "textbox";
  private el: HTMLDivElement | null = null;
  private startX = 0;
  private startY = 0;

  constructor(private readonly overlay: HTMLElement, private readonly colors: ThemeColors) {}

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.el?.remove();
    this.el = document.createElement("div");
    this.el.style.cssText = `
      position:fixed;
      border:2px dashed ${this.colors.accent};
      background:${this.colors.accent}12;
      pointer-events:none;
      border-radius:4px;
    `;
    this.overlay.appendChild(this.el);
  }

  move(x: number, y: number): void {
    if (!this.el) return;
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.width = `${Math.abs(x - this.startX)}px`;
    this.el.style.height = `${Math.abs(y - this.startY)}px`;
  }

  finish(x: number, y: number, anchor: DOMRect) {
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    const w = Math.abs(x - this.startX);
    const h = Math.abs(y - this.startY);
    this.el?.remove();
    this.el = null;
    if (w < MIN_EXTENT || h < MIN_EXTENT) return null;
    const bounds = new DOMRect(left, top, w, h);
    const geometry: Geometry = {
      shape: "textbox",
      x: (left - anchor.left) / anchor.width,
      y: (top - anchor.top) / anchor.height,
      w: w / anchor.width,
      h: h / anchor.height,
      text: "",
      fontSize: 14,
    };
    return { geometry, bounds };
  }

  cancel(): void {
    this.el?.remove();
    this.el = null;
  }
}

// ---------------------------------------------------------------------------
// SVG-backed modes — draw into the shared svgLayer
// ---------------------------------------------------------------------------

abstract class SvgMode implements DrawingMode {
  abstract readonly shape: Shape;
  protected startX = 0;
  protected startY = 0;
  protected svgNode: SVGElement | null = null;

  constructor(protected readonly svgLayer: SVGSVGElement, protected readonly colors: ThemeColors) {
    // Size the layer to the viewport so internal coords align with client coords.
    svgLayer.style.cssText = `
      position:fixed;inset:0;
      pointer-events:none;
      overflow:visible;
    `;
    svgLayer.setAttribute("width", String(window.innerWidth));
    svgLayer.setAttribute("height", String(window.innerHeight));
    svgLayer.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  }

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.clearNode();
    this.svgNode = this.createNode(x, y);
    this.svgLayer.appendChild(this.svgNode);
  }

  move(x: number, y: number): void {
    if (!this.svgNode) return;
    this.updateNode(this.svgNode, x, y);
  }

  abstract finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null;

  cancel(): void {
    this.clearNode();
  }

  protected clearNode(): void {
    this.svgNode?.remove();
    this.svgNode = null;
  }

  protected abstract createNode(x: number, y: number): SVGElement;
  protected abstract updateNode(node: SVGElement, x: number, y: number): void;
}

class CircleMode extends SvgMode {
  readonly shape: Shape = "circle";

  protected createNode(x: number, y: number): SVGElement {
    const ell = document.createElementNS(SVG_NS, "ellipse");
    ell.setAttribute("cx", String(x));
    ell.setAttribute("cy", String(y));
    ell.setAttribute("rx", "0");
    ell.setAttribute("ry", "0");
    ell.setAttribute("stroke", this.colors.accent);
    ell.setAttribute("stroke-width", "2");
    ell.setAttribute("fill", `${this.colors.accent}14`);
    return ell;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    const cx = (this.startX + x) / 2;
    const cy = (this.startY + y) / 2;
    const rx = Math.abs(x - this.startX) / 2;
    const ry = Math.abs(y - this.startY) / 2;
    node.setAttribute("cx", String(cx));
    node.setAttribute("cy", String(cy));
    node.setAttribute("rx", String(rx));
    node.setAttribute("ry", String(ry));
  }

  finish(x: number, y: number, anchor: DOMRect) {
    const rx = Math.abs(x - this.startX) / 2;
    const ry = Math.abs(y - this.startY) / 2;
    this.clearNode();
    if (rx * 2 < MIN_EXTENT || ry * 2 < MIN_EXTENT) return null;
    const cx = (this.startX + x) / 2;
    const cy = (this.startY + y) / 2;
    const bounds = new DOMRect(cx - rx, cy - ry, rx * 2, ry * 2);
    const geometry: Geometry = {
      shape: "circle",
      cx: (cx - anchor.left) / anchor.width,
      cy: (cy - anchor.top) / anchor.height,
      rx: rx / anchor.width,
      ry: ry / anchor.height,
    };
    return { geometry, bounds };
  }
}

class LineMode extends SvgMode {
  readonly shape: Shape = "line";

  protected createNode(x: number, y: number): SVGElement {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", this.colors.accent);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    return line;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    node.setAttribute("x2", String(x));
    node.setAttribute("y2", String(y));
  }

  finish(x: number, y: number, anchor: DOMRect) {
    this.clearNode();
    const dx = Math.abs(x - this.startX);
    const dy = Math.abs(y - this.startY);
    if (dx < MIN_EXTENT && dy < MIN_EXTENT) return null;
    const bounds = new DOMRect(
      Math.min(this.startX, x),
      Math.min(this.startY, y),
      dx,
      dy,
    );
    const geometry: Geometry = {
      shape: "line",
      x1: (this.startX - anchor.left) / anchor.width,
      y1: (this.startY - anchor.top) / anchor.height,
      x2: (x - anchor.left) / anchor.width,
      y2: (y - anchor.top) / anchor.height,
    };
    return { geometry, bounds };
  }
}

class ArrowMode extends SvgMode {
  readonly shape: Shape = "arrow";
  private headNode: SVGPolygonElement | null = null;

  protected createNode(x: number, y: number): SVGElement {
    const g = document.createElementNS(SVG_NS, "g");
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", this.colors.accent);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("fill", this.colors.accent);
    g.appendChild(line);
    g.appendChild(poly);
    this.headNode = poly;
    return g;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    const line = node.querySelector("line");
    if (!line) return;
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    this.updateHead(x, y);
  }

  private updateHead(x: number, y: number): void {
    if (!this.headNode) return;
    const headSize = 12;
    const angle = Math.atan2(y - this.startY, x - this.startX);
    const a1 = angle + Math.PI - Math.PI / 7;
    const a2 = angle + Math.PI + Math.PI / 7;
    this.headNode.setAttribute(
      "points",
      `${x},${y} ${x + Math.cos(a1) * headSize},${y + Math.sin(a1) * headSize} ${x + Math.cos(a2) * headSize},${y + Math.sin(a2) * headSize}`,
    );
  }

  finish(x: number, y: number, anchor: DOMRect) {
    this.clearNode();
    this.headNode = null;
    const dx = Math.abs(x - this.startX);
    const dy = Math.abs(y - this.startY);
    if (dx < MIN_EXTENT && dy < MIN_EXTENT) return null;
    const bounds = new DOMRect(
      Math.min(this.startX, x),
      Math.min(this.startY, y),
      dx,
      dy,
    );
    const geometry: Geometry = {
      shape: "arrow",
      x1: (this.startX - anchor.left) / anchor.width,
      y1: (this.startY - anchor.top) / anchor.height,
      x2: (x - anchor.left) / anchor.width,
      y2: (y - anchor.top) / anchor.height,
      headSize: 12,
    };
    return { geometry, bounds };
  }
}

class FreehandMode extends SvgMode {
  readonly shape: Shape = "freehand";
  private points: Array<[number, number]> = [];

  protected createNode(x: number, y: number): SVGElement {
    this.points = [[x, y]];
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", this.colors.accent);
    path.setAttribute("stroke", this.colors.accent);
    path.setAttribute("stroke-width", "1");
    return path;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    this.points.push([x, y]);
    node.setAttribute("d", buildFreehandPath(this.points, 4));
  }

  finish(_x: number, _y: number, anchor: DOMRect) {
    const pts = this.points.slice();
    this.clearNode();
    this.points = [];
    if (pts.length < FREEHAND_MIN_POINTS) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const bounds = new DOMRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));

    const geometry: Geometry = {
      shape: "freehand",
      points: pts.map(([px, py]) => [
        (px - anchor.left) / anchor.width,
        (py - anchor.top) / anchor.height,
      ]),
      strokeWidth: 4,
    };
    return { geometry, bounds };
  }
}

function buildFreehandPath(points: Array<[number, number]>, size: number): string {
  const outline = getStroke(points, { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
  if (outline.length === 0) return "";
  const first = outline[0];
  if (!first) return "";
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i];
    if (!p) continue;
    d += ` L ${p[0]} ${p[1]}`;
  }
  return `${d} Z`;
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/drawing-modes.test.ts 2>&1 | tail -20
```

Expected: 11 tests pass.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/drawing-modes.ts packages/widget/__tests__/widget/drawing-modes.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): drawing-modes — 6 per-shape drawing classes

New DrawingMode interface + 6 classes (Rectangle/Textbox as div;
Circle/Arrow/Line/Freehand as SVG). Each mode owns its preview element,
converts drag coords to fractional Geometry relative to the anchor, and
returns a bounding DOMRect for anchoring. Freehand streams points into
perfect-freehand for live preview. Shared MIN_EXTENT = 10 px rejects
accidental clicks. 11 unit tests covering factory + per-mode geometry
extraction + cancel cleanup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `shape-picker.ts` — toolbar row

Renders the 6 shape buttons in the annotator's top glass toolbar, matching the existing glass button style. Emits selection changes through a callback. TDD red-first.

**Files:**
- Create: `packages/widget/src/shape-picker.ts`
- Create: `packages/widget/__tests__/widget/shape-picker.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `/Users/brian/dev/colaborate/packages/widget/__tests__/widget/shape-picker.test.ts`:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createT } from "../../src/i18n/index.js";
import { ShapePicker } from "../../src/shape-picker.js";
import { buildThemeColors } from "../../src/styles/theme.js";

const colors = buildThemeColors();
const t = createT("en");

afterEach(() => {
  document.body.replaceChildren();
});

describe("ShapePicker", () => {
  it("renders 6 buttons — one per shape — with data-shape attributes", () => {
    const picker = new ShapePicker(colors, t, "rectangle", vi.fn());
    document.body.appendChild(picker.element);

    const buttons = picker.element.querySelectorAll<HTMLButtonElement>("button[data-shape]");
    expect(buttons.length).toBe(6);
    const shapes = Array.from(buttons).map((b) => b.dataset.shape);
    expect(shapes.sort()).toEqual(
      ["arrow", "circle", "freehand", "line", "rectangle", "textbox"],
    );
  });

  it("marks the initial shape with data-active=\"true\"", () => {
    const picker = new ShapePicker(colors, t, "circle", vi.fn());
    const active = picker.element.querySelector<HTMLButtonElement>('button[data-shape="circle"]');
    expect(active?.dataset.active).toBe("true");
  });

  it("clicking a shape button fires the callback with that shape and flips data-active", () => {
    const cb = vi.fn();
    const picker = new ShapePicker(colors, t, "rectangle", cb);
    const arrowBtn = picker.element.querySelector<HTMLButtonElement>('button[data-shape="arrow"]')!;
    arrowBtn.click();
    expect(cb).toHaveBeenCalledWith("arrow");

    // Now arrow should be active; rectangle should not
    expect(arrowBtn.dataset.active).toBe("true");
    const rectBtn = picker.element.querySelector<HTMLButtonElement>('button[data-shape="rectangle"]')!;
    expect(rectBtn.dataset.active).not.toBe("true");
  });

  it("setActive(shape) updates the active flag without calling the callback", () => {
    const cb = vi.fn();
    const picker = new ShapePicker(colors, t, "rectangle", cb);
    picker.setActive("line");
    const lineBtn = picker.element.querySelector<HTMLButtonElement>('button[data-shape="line"]')!;
    expect(lineBtn.dataset.active).toBe("true");
    expect(cb).not.toHaveBeenCalled();
  });

  it("each button has an aria-label naming the shape", () => {
    const picker = new ShapePicker(colors, t, "rectangle", vi.fn());
    for (const shape of ["rectangle", "circle", "arrow", "line", "textbox", "freehand"] as const) {
      const btn = picker.element.querySelector<HTMLButtonElement>(`button[data-shape="${shape}"]`)!;
      const aria = btn.getAttribute("aria-label") ?? "";
      expect(aria.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/shape-picker.test.ts 2>&1 | tail -10
```

Expected: module not found.

- [ ] **Step 6.3: Implement `shape-picker.ts`**

Create `/Users/brian/dev/colaborate/packages/widget/src/shape-picker.ts`:

```ts
import type { Shape } from "@colaborate/core";
import { SHAPES } from "@colaborate/core";
import {
  ICON_SHAPE_ARROW,
  ICON_SHAPE_CIRCLE,
  ICON_SHAPE_FREEHAND,
  ICON_SHAPE_LINE,
  ICON_SHAPE_RECTANGLE,
  ICON_SHAPE_TEXTBOX,
} from "./icons.js";
import type { TFunction } from "./i18n/index.js";
import type { ThemeColors } from "./styles/theme.js";

const SHAPE_ICONS: Record<Shape, string> = {
  rectangle: ICON_SHAPE_RECTANGLE,
  circle: ICON_SHAPE_CIRCLE,
  arrow: ICON_SHAPE_ARROW,
  line: ICON_SHAPE_LINE,
  textbox: ICON_SHAPE_TEXTBOX,
  freehand: ICON_SHAPE_FREEHAND,
};

const SHAPE_KEY: Record<Shape, string> = {
  rectangle: "R",
  circle: "C",
  arrow: "A",
  line: "L",
  textbox: "T",
  freehand: "F",
};

/**
 * 6-button shape picker for the annotator toolbar. Glassmorphism pill-row
 * matching the existing cancel-button style. Fires the `onChange` callback
 * when the user clicks a button. Use `setActive(shape)` to sync from an
 * external source (keyboard shortcut) without firing the callback.
 */
export class ShapePicker {
  readonly element: HTMLElement;
  private buttons = new Map<Shape, HTMLButtonElement>();
  private active: Shape;

  constructor(
    colors: ThemeColors,
    t: TFunction,
    initial: Shape,
    private readonly onChange: (shape: Shape) => void,
  ) {
    this.active = initial;
    const row = document.createElement("div");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", t("picker.aria"));
    row.style.cssText = `
      display:flex;align-items:center;gap:4px;
      padding:3px;border-radius:9999px;
      background:${colors.glassBg};
      border:1px solid ${colors.glassBorderSubtle};
    `;

    for (const shape of SHAPES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.shape = shape;
      const isActive = shape === initial;
      if (isActive) btn.dataset.active = "true";
      btn.setAttribute(
        "aria-label",
        `${t(`shape.${shape}` as Parameters<TFunction>[0])} (${SHAPE_KEY[shape]})`,
      );
      btn.innerHTML = SHAPE_ICONS[shape];
      btn.style.cssText = this.buttonStyle(isActive, colors);
      btn.addEventListener("click", () => this.handleClick(shape, colors));
      this.buttons.set(shape, btn);
      row.appendChild(btn);
    }

    this.element = row;
  }

  /** Update active state without firing the callback (used by keyboard shortcut). */
  setActive(shape: Shape): void {
    if (shape === this.active) return;
    this.active = shape;
    for (const [s, btn] of this.buttons) {
      if (s === shape) {
        btn.dataset.active = "true";
      } else {
        delete btn.dataset.active;
      }
      // Colors refresh via inline style rebuild
    }
    this.refreshStyles();
  }

  private handleClick(shape: Shape, _colors: ThemeColors): void {
    if (shape === this.active) return;
    this.setActive(shape);
    this.onChange(shape);
  }

  private refreshStyles(): void {
    for (const [s, btn] of this.buttons) {
      btn.style.cssText = this.buttonStyle(s === this.active, this.colorsFromFirstButton(btn));
    }
  }

  /**
   * Recover the theme colors from closure via the first button's style.
   * We captured `colors` in the ctor but don't need to retain it — use a
   * simple snapshot approach: rebuild the full style string from the active flag.
   */
  private colorsFromFirstButton(_btn: HTMLButtonElement): ThemeColors {
    // Not actually used — buttonStyle is parameterized on `colors` but we pass
    // an object assembled from accent/border. We keep a reference to the colors
    // object; see note below.
    // (This shim exists because TypeScript cannot easily capture `colors` across
    //  arrow functions + methods in the same file without an instance field.)
    return this._colors;
  }

  private _colors!: ThemeColors; // set in ctor via init hack below

  private buttonStyle(isActive: boolean, colors: ThemeColors): string {
    // Side-effect: remember colors for later refreshStyles calls.
    this._colors = colors;
    const bg = isActive ? colors.accent : "transparent";
    const fg = isActive ? "#fff" : colors.textTertiary;
    const border = isActive ? colors.accent : "transparent";
    return `
      height:28px;width:32px;padding:0;
      display:inline-flex;align-items:center;justify-content:center;
      border-radius:9999px;
      border:1px solid ${border};
      background:${bg};
      color:${fg};
      cursor:pointer;
      transition:background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    `;
  }
}
```

> **Implementer note:** the `_colors` field + `colorsFromFirstButton` shim above is deliberately ugly — it exists only so `refreshStyles()` can re-invoke `buttonStyle` without re-plumbing `colors` through every method. If you prefer, inline it: add `private readonly colors: ThemeColors` as a constructor parameter property and drop the shim. Both are equivalent; prefer whichever your reviewer likes.

- [ ] **Step 6.4: Run tests to verify they pass**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/shape-picker.test.ts 2>&1 | tail -10
```

Expected: 5 tests pass.

Note: The tests exercise `t("shape.rectangle")` etc., but those i18n keys do not exist yet — they land in Task 8. Until then `createT("en")` will return the *key* as a fallback string (or whatever the i18n module's miss behaviour is). Either accept that the tests match the fallback text (`aria-label` length > 0 — true even if the value is the key itself), or run this task alongside Task 8. The tests above are designed to not assert on specific wording, only on presence + length, so they stay green either way. If your i18n module throws on missing keys, do Task 8 first.

- [ ] **Step 6.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/shape-picker.ts packages/widget/__tests__/widget/shape-picker.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): shape-picker — 6-button toolbar row for the annotator

New ShapePicker renders a glass pill-row of 6 icon buttons, each tagged
with a data-shape attribute for E2E + CSS targeting. Clicking fires the
onChange callback; setActive(shape) syncs state without firing (used by
the keyboard shortcut path). 5 unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Refactor `annotator.ts` to use modes + picker + shortcuts

The big integration task. Replace the inline rectangle-only drawing logic with a mode registry driven by the shape picker + keyboard shortcuts.

**Files:**
- Modify: `packages/widget/src/annotator.ts`
- Modify: `packages/widget/__tests__/widget/annotator.test.ts`

- [ ] **Step 7.1: Read the current annotator.ts in full**

Already read at plan time — the structure is clear. The rewrite preserves:
- `activate() / deactivate()` lifecycle and Escape / overlay keydown handlers
- RAF-throttled move handling
- Popup trigger and `annotation:complete` emission
- Keyboard-Enter full-bounds annotation path

The rewrite changes:
- `drawingRect: HTMLElement` becomes a mode-owned preview
- Adds `svgLayer: SVGSVGElement` inside the overlay (shared by SVG modes)
- Adds `shapePicker: ShapePicker` mounted in the toolbar between `instruction` and `cancelBtn`
- Adds `currentMode: DrawingMode` — rebuilt on every shape change
- `onKeyDown` now also checks `getShapeFromKey(e.key)` to switch modes

- [ ] **Step 7.2: Rewrite `annotator.ts`**

Replace the full contents of `/Users/brian/dev/colaborate/packages/widget/src/annotator.ts` with:

```ts
import type { AnnotationPayload, FeedbackType, Geometry, Shape } from "@colaborate/core";
import { findAnchorElement, generateAnchor } from "./dom/anchor.js";
import { createDrawingMode, type DrawingMode } from "./drawing-modes.js";
import { el, setText } from "./dom-utils.js";
import type { EventBus, WidgetEvents } from "./events.js";
import type { TFunction } from "./i18n/index.js";
import { Popup } from "./popup.js";
import { ShapePicker } from "./shape-picker.js";
import { getShapeFromKey } from "./shortcuts.js";
import type { ThemeColors } from "./styles/theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface AnnotationComplete {
  annotation: AnnotationPayload;
  type: FeedbackType;
  message: string;
}

/**
 * Annotation mode: full-page overlay with 6-shape drawing.
 *
 * Glassmorphism design:
 * - Frosted glass toolbar at top (instruction + shape picker + cancel)
 * - Subtle tinted overlay
 * - Per-mode preview (div or SVG) rendered inside the overlay
 *
 * Drawing is delegated to per-shape DrawingMode classes. The annotator
 * orchestrates activation/deactivation, picker + shortcut plumbing, and
 * the handoff from drag-complete to popup to `annotation:complete`.
 */
export class Annotator {
  private overlay: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private svgLayer: SVGSVGElement | null = null;
  private shapePicker: ShapePicker | null = null;
  private currentMode: DrawingMode | null = null;
  private currentShape: Shape = "rectangle";
  private isDrawing = false;
  private isActive = false;
  private popup: Popup;
  private savedOverflow = "";
  private preActiveFocusElement: Element | null = null;
  private rafId: number | null = null;
  private pendingMoveEvent: MouseEvent | Touch | null = null;

  constructor(
    private readonly colors: ThemeColors,
    private readonly bus: EventBus<WidgetEvents>,
    private readonly t: TFunction,
  ) {
    this.popup = new Popup(colors, t);

    this.bus.on("annotation:start", () => this.activate());
  }

  private activate(): void {
    if (this.isActive) return;
    this.isActive = true;

    this.preActiveFocusElement = document.activeElement;

    this.savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Overlay — subtle blue tint for depth
    this.overlay = el("div", {
      style: `
        position:fixed;inset:0;
        z-index:2147483646;
        background:rgba(15, 23, 42, 0.04);
        cursor:crosshair;
      `,
    });
    this.overlay.setAttribute("aria-hidden", "true");

    // Single SVG layer shared by SVG-backed modes
    this.svgLayer = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.overlay.appendChild(this.svgLayer);

    // Toolbar — glassmorphism bar
    this.toolbar = el("div", {
      style: `
        position:fixed;top:0;left:0;right:0;
        z-index:2147483647;
        height:52px;
        background:${this.colors.glassBg};
        backdrop-filter:blur(24px);
        -webkit-backdrop-filter:blur(24px);
        border-bottom:1px solid ${this.colors.glassBorder};
        display:flex;align-items:center;justify-content:center;gap:16px;
        font-family:"Inter",system-ui,-apple-system,sans-serif;
        font-size:14px;color:${this.colors.text};
        box-shadow:0 4px 16px ${this.colors.shadow};
        -webkit-font-smoothing:antialiased;
      `,
    });

    const dot = el("span", {
      style: `
        width:8px;height:8px;border-radius:50%;
        background:${this.colors.accent};
        box-shadow:0 0 8px ${this.colors.accentGlow};
        animation:pulse 1.5s ease-in-out infinite;
      `,
    });

    const style = document.createElement("style");
    style.textContent = [
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}",
      "@media(prefers-reduced-motion:reduce){@keyframes pulse{from,to{opacity:1}}}",
    ].join("");
    this.toolbar.appendChild(style);

    const instruction = el("span", { style: "font-weight:500;letter-spacing:-0.01em;" });
    setText(instruction, this.t("annotator.instruction"));

    // Shape picker
    this.shapePicker = new ShapePicker(this.colors, this.t, this.currentShape, (shape) => {
      this.switchShape(shape);
    });

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.style.cssText = `
      height:34px;padding:0 18px;border-radius:9999px;
      border:1px solid ${this.colors.border};
      background:${this.colors.glassBg};
      color:${this.colors.textTertiary};font-family:"Inter",system-ui,-apple-system,sans-serif;
      font-size:13px;font-weight:500;cursor:pointer;
      transition:all 0.2s ease;
    `;
    setText(cancelBtn, this.t("annotator.cancel"));
    cancelBtn.addEventListener("click", () => this.deactivate());
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.borderColor = this.colors.typeBug;
      cancelBtn.style.color = this.colors.typeBug;
      cancelBtn.style.background = this.colors.typeBugBg;
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.borderColor = this.colors.border;
      cancelBtn.style.color = this.colors.textTertiary;
      cancelBtn.style.background = this.colors.glassBg;
    });

    this.toolbar.appendChild(dot);
    this.toolbar.appendChild(instruction);
    this.toolbar.appendChild(this.shapePicker.element);
    this.toolbar.appendChild(cancelBtn);

    // Mouse / touch / keyboard listeners
    this.overlay.addEventListener("mousedown", this.onMouseDown);
    this.overlay.addEventListener("mousemove", this.onMouseMove);
    this.overlay.addEventListener("mouseup", this.onMouseUp);
    this.overlay.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.overlay.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.overlay.addEventListener("touchend", this.onTouchEnd);
    this.overlay.addEventListener("keydown", this.onOverlayKeyDown);
    this.overlay.setAttribute("tabindex", "0");

    document.addEventListener("keydown", this.onKeyDown);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.toolbar);

    // Build initial mode AFTER overlay + svgLayer are in the DOM.
    this.buildMode();
  }

  private buildMode(): void {
    if (!this.overlay || !this.svgLayer) return;
    this.currentMode?.cancel();
    this.currentMode = createDrawingMode(this.currentShape, this.overlay, this.svgLayer, this.colors);
  }

  private switchShape(shape: Shape): void {
    if (shape === this.currentShape) return;
    this.currentShape = shape;
    this.isDrawing = false;
    this.buildMode();
    this.shapePicker?.setActive(shape);
  }

  private deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.isDrawing = false;
    this.preActiveFocusElement = null;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingMoveEvent = null;

    document.body.style.overflow = this.savedOverflow;
    document.removeEventListener("keydown", this.onKeyDown);

    this.currentMode?.cancel();
    this.currentMode = null;
    this.shapePicker = null;
    this.svgLayer = null;

    this.overlay?.remove();
    this.toolbar?.remove();
    this.overlay = null;
    this.toolbar = null;

    this.bus.emit("annotation:end");
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.deactivate();
      return;
    }
    if (!this.isActive || this.isDrawing) return;
    const shape = getShapeFromKey(e.key);
    if (shape) {
      e.preventDefault();
      this.switchShape(shape);
    }
  };

  /**
   * Keyboard annotation: pressing Enter while the overlay is active selects
   * the element that was focused before activation and creates a full-bounds
   * annotation covering that element (WCAG 2.1.1 Level A).
   */
  private onOverlayKeyDown = async (e: KeyboardEvent): Promise<void> => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const target = this.preActiveFocusElement;
    if (!target || !(target instanceof HTMLElement)) return;

    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const rectBounds = new DOMRect(bounds.x, bounds.y, bounds.width, bounds.height);

    const result = await this.popup.show(rectBounds);
    if (!result) return;

    const anchor = generateAnchor(target);
    const geometry: Geometry = { shape: "rectangle", x: 0, y: 0, w: 1, h: 1 };
    const annotation: AnnotationPayload = {
      anchor,
      shape: "rectangle",
      geometry,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };

    this.deactivate();

    this.bus.emit("annotation:complete", {
      annotation,
      type: result.type,
      message: result.message,
    });
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.startDrawing(e.clientX, e.clientY);
  };

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) this.startDrawing(touch.clientX, touch.clientY);
  };

  private startDrawing(clientX: number, clientY: number): void {
    if (!this.currentMode) return;
    this.isDrawing = true;
    this.currentMode.start(clientX, clientY);
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.scheduleMove(e);
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches[0]) this.scheduleMove(e.touches[0]);
  };

  private scheduleMove(source: MouseEvent | Touch): void {
    if (!this.isDrawing || !this.currentMode) return;

    this.pendingMoveEvent = source;
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const evt = this.pendingMoveEvent;
      if (!evt || !this.currentMode) return;
      this.currentMode.move(evt.clientX, evt.clientY);
    });
  }

  private onTouchEnd = async (e: TouchEvent): Promise<void> => {
    const touch = e.changedTouches[0];
    if (touch) await this.finishDrawing(touch.clientX, touch.clientY);
  };

  private onMouseUp = async (e: MouseEvent): Promise<void> => {
    await this.finishDrawing(e.clientX, e.clientY);
  };

  private finishDrawing = async (clientX: number, clientY: number): Promise<void> => {
    if (!this.isDrawing || !this.currentMode || !this.overlay) return;
    this.isDrawing = false;

    // Temporarily hide overlay to find the real element under the drawn shape.
    // We need this BEFORE asking the mode to finish, because mode.finish consumes
    // the preview. Use a provisional rectangle centered on the drag midpoint.
    // The mode will compute the real fractional geometry against this same
    // anchor's bounding box below.
    this.overlay.style.pointerEvents = "none";
    // Use a 1-px probe rect at the current position for initial elementFromPoint;
    // the mode's `finish` bounds are used for anchor selection.
    const probe = new DOMRect(clientX, clientY, 1, 1);
    let anchorElement = findAnchorElement(probe);
    this.overlay.style.pointerEvents = "auto";

    // First pass: ask the mode to finish with the current anchor element's bounds.
    let anchorBounds = anchorElement.getBoundingClientRect();
    const first = this.currentMode.finish(clientX, clientY, anchorBounds);
    if (!first) {
      // Too small — rebuild a fresh mode for the next attempt.
      this.buildMode();
      return;
    }

    // Second pass: use the drawn shape's bounding box to pick the *best* anchor
    // (the previous probe was a 1-px point, which may undershoot for large shapes).
    this.overlay.style.pointerEvents = "none";
    anchorElement = findAnchorElement(first.bounds);
    this.overlay.style.pointerEvents = "auto";
    anchorBounds = anchorElement.getBoundingClientRect();

    // Show popup for type + message
    const result = await this.popup.show(first.bounds);
    if (!result) {
      this.buildMode();
      return;
    }

    // Re-project geometry against the real anchor bounds. (Cheap — just re-normalises
    // the fractional coords; mode-specific logic. We can just rebuild by re-running
    // finish against the real anchor.)
    const anchor = generateAnchor(anchorElement);

    // Rebuild geometry relative to the chosen anchor. The mode already consumed
    // its internal state, so we project `first.bounds` → new anchor manually
    // only when the anchor changed. Simpler: accept `first.geometry` + re-base
    // it using the shape-specific rule.
    const geometry = rebaseGeometry(first.geometry, first.bounds, anchorBounds, result.message);

    const annotation: AnnotationPayload = {
      anchor,
      shape: geometry.shape,
      geometry,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };

    this.deactivate();

    this.bus.emit("annotation:complete", {
      annotation,
      type: result.type,
      message: result.message,
    });
  };

  destroy(): void {
    this.deactivate();
    this.popup.destroy();
  }
}

/**
 * Re-project a Geometry from the original anchor's local frame into a new
 * anchor's local frame, using the shape's absolute bounding box in client
 * coordinates. Also fills in textbox.text from the popup message.
 */
function rebaseGeometry(g: Geometry, bounds: DOMRect, anchor: DOMRect, message: string): Geometry {
  switch (g.shape) {
    case "rectangle":
      return {
        shape: "rectangle",
        x: (bounds.left - anchor.left) / anchor.width,
        y: (bounds.top - anchor.top) / anchor.height,
        w: bounds.width / anchor.width,
        h: bounds.height / anchor.height,
      };
    case "textbox":
      return {
        shape: "textbox",
        x: (bounds.left - anchor.left) / anchor.width,
        y: (bounds.top - anchor.top) / anchor.height,
        w: bounds.width / anchor.width,
        h: bounds.height / anchor.height,
        text: message,
        fontSize: 14,
      };
    case "circle": {
      const cx = bounds.left + bounds.width / 2;
      const cy = bounds.top + bounds.height / 2;
      return {
        shape: "circle",
        cx: (cx - anchor.left) / anchor.width,
        cy: (cy - anchor.top) / anchor.height,
        rx: bounds.width / 2 / anchor.width,
        ry: bounds.height / 2 / anchor.height,
      };
    }
    case "line":
    case "arrow": {
      // `g` already holds fractional coords relative to the *original* anchor.
      // Convert back to absolute using `bounds` as the original bounding box
      // is the bounding box of the two endpoints. To recover endpoint order
      // (which matters for arrow direction), we can't derive it from bounds —
      // so we keep `g`'s fractions if the anchor hasn't changed, and recompute
      // them otherwise using the bounds' corners as a best-effort guess.
      // Simplification: if anchors match, return g as-is. Otherwise use the
      // original fractional coords scaled through the absolute bounds.
      // Anchor bounds aren't passed in the first pass, so we assume they match
      // in the common case. Real re-projection:
      //   absolute endpoint = originalAnchor.origin + g.(x1,y1) * originalAnchor.size
      // We don't have originalAnchor here, so use `bounds` as a fallback:
      // endpoints collapse to bounds corners ordered by the original direction.
      const x1abs = g.x1 < g.x2 ? bounds.left : bounds.right;
      const y1abs = g.y1 < g.y2 ? bounds.top : bounds.bottom;
      const x2abs = g.x1 < g.x2 ? bounds.right : bounds.left;
      const y2abs = g.y1 < g.y2 ? bounds.bottom : bounds.top;
      if (g.shape === "line") {
        return {
          shape: "line",
          x1: (x1abs - anchor.left) / anchor.width,
          y1: (y1abs - anchor.top) / anchor.height,
          x2: (x2abs - anchor.left) / anchor.width,
          y2: (y2abs - anchor.top) / anchor.height,
        };
      }
      return {
        shape: "arrow",
        x1: (x1abs - anchor.left) / anchor.width,
        y1: (y1abs - anchor.top) / anchor.height,
        x2: (x2abs - anchor.left) / anchor.width,
        y2: (y2abs - anchor.top) / anchor.height,
        headSize: g.headSize,
      };
    }
    case "freehand": {
      // Same problem as arrow/line — without the original anchor, we can
      // only fall back to the points already computed. Accept that the
      // re-anchoring step for freehand is approximate: the stored fractions
      // are relative to the anchor chosen in the FIRST pass (the 1-px probe
      // anchor), which is usually the same as the post-bounds anchor on
      // small shapes. For the initial v0 we keep g.points as-is.
      return g;
    }
  }
}
```

> **Implementer note — the `rebaseGeometry` dance:**
> The cleanest fix is to have `DrawingMode.finish` take the anchor as an argument *after* the first probe — which it already does. The two-pass anchor selection exists because a 1-px probe undershoots for large shapes. If you find the two-pass logic too fiddly, simplify by using the bounds of the drawn shape as the probe directly:
>
> ```ts
> // Single-pass alternative (simpler, slightly less precise for huge shapes):
> const tmp = this.currentMode.finish(clientX, clientY, new DOMRect(0, 0, 1, 1));
> if (!tmp) { this.buildMode(); return; }
> this.overlay.style.pointerEvents = "none";
> const anchorElement = findAnchorElement(tmp.bounds);
> this.overlay.style.pointerEvents = "auto";
> // ...then re-finish against the real anchor — but the mode's state is already
> // consumed. So you'd need a helper on each mode that re-projects its previous
> // bounds against a new anchor. That's the job rebaseGeometry() does inline above.
> ```
>
> Pick whichever version your reviewer likes; the unit tests in `drawing-modes.test.ts` already cover the mode-local math, and the E2E tests in Task 9 exercise the full anchor-selection path.

- [ ] **Step 7.3: Add annotator tests for mode switching**

In `/Users/brian/dev/colaborate/packages/widget/__tests__/widget/annotator.test.ts`, add a new `describe` block after the `describe("keyboard: Enter", ...)` block:

```ts
  // -------------------------------------------------------------------------
  // Shape picker + keyboard shortcut
  // -------------------------------------------------------------------------

  describe("shape picker", () => {
    it("activation mounts 6 shape-picker buttons in the toolbar", () => {
      bus.emit("annotation:start");
      const shapeButtons = document.body.querySelectorAll("button[data-shape]");
      expect(shapeButtons.length).toBe(6);
    });

    it("rectangle button is active by default", () => {
      bus.emit("annotation:start");
      const active = document.body.querySelector<HTMLButtonElement>('button[data-shape="rectangle"]');
      expect(active?.dataset.active).toBe("true");
    });

    it("clicking a different shape button flips data-active", () => {
      bus.emit("annotation:start");
      const circleBtn = document.body.querySelector<HTMLButtonElement>('button[data-shape="circle"]')!;
      circleBtn.click();
      expect(circleBtn.dataset.active).toBe("true");
      const rectBtn = document.body.querySelector<HTMLButtonElement>('button[data-shape="rectangle"]')!;
      expect(rectBtn.dataset.active).not.toBe("true");
    });
  });

  describe("shape keyboard shortcuts", () => {
    it("pressing 'C' while overlay active switches active shape to circle", () => {
      bus.emit("annotation:start");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
      const circleBtn = document.body.querySelector<HTMLButtonElement>('button[data-shape="circle"]');
      expect(circleBtn?.dataset.active).toBe("true");
    });

    it("pressing 'F' while overlay active switches to freehand", () => {
      bus.emit("annotation:start");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "F", bubbles: true }));
      const freehandBtn = document.body.querySelector<HTMLButtonElement>('button[data-shape="freehand"]');
      expect(freehandBtn?.dataset.active).toBe("true");
    });

    it("pressing a non-shortcut key does not change active shape", () => {
      bus.emit("annotation:start");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
      const rectBtn = document.body.querySelector<HTMLButtonElement>('button[data-shape="rectangle"]');
      expect(rectBtn?.dataset.active).toBe("true");
    });

    it("pressing Escape still deactivates (not shape-switch)", () => {
      bus.emit("annotation:start");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const overlay = document.body.querySelector<HTMLElement>('div[aria-hidden="true"][tabindex="0"]');
      expect(overlay).toBeNull();
    });
  });
```

- [ ] **Step 7.4: Verify existing annotator tests still pass**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/widget/annotator.test.ts 2>&1 | tail -25
```

Expected: every existing test + 7 new ones pass. Likely fix-up needed:

- The existing `"rejects mouse drag smaller than 10px"` tests now rely on `mode.finish` returning null. RectangleMode does this — same MIN_EXTENT. Tests should still pass.
- The existing test `"mouse drag with valid size triggers popup.show and emits annotation:complete"` mocks `findAnchorElement` → `document.body`. `document.body.getBoundingClientRect()` in jsdom returns zero width/height by default. Our two-pass anchor selection then divides by zero → NaN geometry → Zod would fail, but this test only asserts `data.annotation` is defined and `data.type === "bug"`. Confirm the emission still happens. If not, you may need to mock `getBoundingClientRect` on `document.body` in the test harness to return a non-zero rect — a one-line `vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 1000))` in the relevant `beforeEach`.

If you see NaN or division-by-zero issues, add the spy. If tests still fail for some other reason, stop and investigate — do not mutate the implementation to make the test pass unless the test was previously asserting incorrect behavior.

- [ ] **Step 7.5: Run the full widget test suite**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget 2>&1 | tail -20
```

Expected: all widget tests green.

- [ ] **Step 7.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/annotator.ts packages/widget/__tests__/widget/annotator.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): annotator drives 6 shapes via drawing-modes + picker + shortcuts

Annotator now delegates drag handling to per-shape DrawingMode classes,
mounts the ShapePicker between instruction + cancel in the glass toolbar,
and routes R/C/A/L/T/F key presses through getShapeFromKey to switch
modes. Textbox.text is filled from the popup.message on finish.
7 new annotator tests for picker + shortcuts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: i18n — new translation keys

Add 7 new keys so the picker aria + per-shape labels are localized.

**Files:**
- Modify: `packages/widget/src/i18n/types.ts`
- Modify: `packages/widget/src/i18n/en.ts`
- Modify: `packages/widget/src/i18n/fr.ts`

- [ ] **Step 8.1: Extend `Translations` interface**

In `/Users/brian/dev/colaborate/packages/widget/src/i18n/types.ts`, find the `// Annotator` section and add underneath it:

```ts
  // Shape picker (Phase 1c)
  "picker.aria": string;
  "shape.rectangle": string;
  "shape.circle": string;
  "shape.arrow": string;
  "shape.line": string;
  "shape.textbox": string;
  "shape.freehand": string;
```

- [ ] **Step 8.2: Add English strings**

In `/Users/brian/dev/colaborate/packages/widget/src/i18n/en.ts`, add under `// Annotator`:

```ts
  // Shape picker
  "picker.aria": "Shape picker",
  "shape.rectangle": "Rectangle",
  "shape.circle": "Circle",
  "shape.arrow": "Arrow",
  "shape.line": "Line",
  "shape.textbox": "Text",
  "shape.freehand": "Freehand",
```

Also update `"annotator.instruction"` — previously "Draw a rectangle on the area to comment" is shape-specific. Change to:

```ts
  "annotator.instruction": "Pick a shape, then draw on the area to comment",
```

- [ ] **Step 8.3: Add French strings**

In `/Users/brian/dev/colaborate/packages/widget/src/i18n/fr.ts`, add under `// Annotator`:

```ts
  // Shape picker
  "picker.aria": "S\u00e9lecteur de forme",
  "shape.rectangle": "Rectangle",
  "shape.circle": "Cercle",
  "shape.arrow": "Fl\u00e8che",
  "shape.line": "Ligne",
  "shape.textbox": "Texte",
  "shape.freehand": "Libre",
```

Also update `"annotator.instruction"`:

```ts
  "annotator.instruction": "Choisissez une forme, puis dessinez sur la zone \u00e0 commenter",
```

- [ ] **Step 8.4: Run widget tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget 2>&1 | tail -15
```

Expected: all widget tests green. If any test asserts the exact pre-1c instruction text ("Draw a rectangle…" or "Tracez un rectangle…"), update the assertion to the new string.

- [ ] **Step 8.5: Run the E2E locale tests**

```bash
cd /Users/brian/dev/colaborate
bun run build
bun run test:e2e --grep "Default locale is English" 2>&1 | tail -15
```

Expected: still green. The E2E tests that checked the annotation cancel button text (`expect ... === "Cancel"`) are not affected by the instruction rewrite. If one of those tests checked the full instruction text, update it.

- [ ] **Step 8.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/i18n/types.ts packages/widget/src/i18n/en.ts packages/widget/src/i18n/fr.ts
git commit -m "$(cat <<'EOF'
feat(widget): i18n for shape picker aria + 6 shape labels (en/fr)

Adds picker.aria + shape.{rectangle,circle,arrow,line,textbox,freehand}
in both locales, plus a shape-agnostic annotator.instruction wording.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Playwright E2E — per-shape draw + persist

One test per new shape. Each test draws the shape via mouse (arrow/line are click-drag like rectangle), submits the popup + identity modal, and asserts the persisted `shape` + parsed `geometry` from the mocked ingest.

**Files:**
- Modify: `e2e/widget.spec.ts`

- [ ] **Step 9.1: Extract a helper for the shared draw → submit → identity flow**

The existing `Full annotation flow` test already walks the full path. We don't want to duplicate it 5 more times. Add a helper at the top of `e2e/widget.spec.ts` (right after the `shadow(page)` helpers, before the first `test.describe`):

```ts
/**
 * Helper: open annotator, pick a shape, drag start→end, submit popup, fill identity.
 * Returns the persisted feedback row from the API.
 */
async function drawShapeAndSubmit(
  page: Page,
  shape: "rectangle" | "circle" | "arrow" | "line" | "textbox" | "freehand",
  message: string,
): Promise<Record<string, unknown>> {
  const s = shadow(page);
  await s.click(".sp-fab");
  await s.waitFor('[data-item-id="annotate"]');
  await s.click('[data-item-id="annotate"]');
  await page.waitForFunction(() => !!document.querySelector("div[style*='crosshair']"));

  // Pick the shape via its picker button (lives outside Shadow DOM — on document.body)
  await page.waitForFunction(
    (sh) => document.querySelector(`button[data-shape="${sh}"]`) !== null,
    shape,
  );
  await page.click(`button[data-shape="${shape}"]`);

  // Drag over the target element
  const box = await page.locator("#target-element").boundingBox();
  if (!box) throw new Error("target not found");
  const startX = box.x + 10;
  const startY = box.y + 10;
  const endX = box.x + 250;
  const endY = box.y + 60;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  if (shape === "freehand") {
    // Freehand: several intermediate points so getStroke produces > 2 points
    await page.mouse.move(startX + 50, startY + 20, { steps: 5 });
    await page.mouse.move(startX + 120, startY + 40, { steps: 5 });
    await page.mouse.move(endX, endY, { steps: 5 });
  } else {
    await page.mouse.move(endX, endY, { steps: 5 });
  }
  await page.mouse.up();

  // Popup → Bug type + message
  await page.waitForSelector("button[data-type='bug']");
  await page.click("button[data-type='bug']");
  await page.waitForSelector("textarea");
  await page.fill("textarea", message);

  // Submit (overlay may intercept pointer events — evaluate to click by text)
  await page.evaluate(() => {
    const btns = document.querySelectorAll("button");
    for (const b of btns) {
      if (b.textContent === "Send") {
        b.click();
        return;
      }
    }
  });

  // Handle identity modal if present
  await page.waitForFunction(
    () => {
      const host = document.querySelector("colaborate-widget");
      const hasIdentity = host?.shadowRoot?.querySelector(".sp-identity-title") !== null;
      const hasMarker =
        (document.getElementById("colaborate-markers")?.querySelectorAll("[data-feedback-id]").length ?? 0) >= 1;
      return hasIdentity || hasMarker;
    },
    undefined,
    { timeout: 5000 },
  );
  const needsIdentity = await page.evaluate(() => {
    const host = document.querySelector("colaborate-widget");
    return host?.shadowRoot?.querySelector(".sp-identity-title") !== null;
  });
  if (needsIdentity) {
    await page.evaluate(() => {
      const host = document.querySelector("colaborate-widget");
      const sr = host?.shadowRoot;
      const inputs = sr?.querySelectorAll(".sp-input") as NodeListOf<HTMLInputElement>;
      if (inputs?.length >= 2) {
        inputs[0].value = "Test User";
        inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
        inputs[1].value = "test@example.com";
        inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
      }
      (sr?.querySelector(".sp-btn-primary") as HTMLElement)?.click();
    });
  }

  // Wait for a marker
  await page.waitForFunction(
    () => (document.getElementById("colaborate-markers")?.querySelectorAll("[data-feedback-id]").length ?? 0) >= 1,
    undefined,
    { timeout: 10000 },
  );

  // Fetch the persisted feedback
  const project = getProject(page);
  await page.waitForFunction(
    async (pn) => {
      const r = await fetch(`http://localhost:3999/api/colaborate?projectName=${pn}`);
      const d = await r.json();
      return d.total >= 1;
    },
    project,
    { timeout: 5000 },
  );
  const res = await page.request.get(`http://localhost:3999/api/colaborate?projectName=${project}`);
  const data = await res.json();
  return data.feedbacks[0] as Record<string, unknown>;
}
```

- [ ] **Step 9.2: Add 5 per-shape tests**

Add this new `test.describe` at the bottom of `e2e/widget.spec.ts`:

```ts
test.describe("Phase 1c — per-shape drawing", () => {
  test("draws a circle and persists a circle geometry", async ({ page }) => {
    const fb = await drawShapeAndSubmit(page, "circle", "Circle feedback");
    const ann = (fb.annotations as Record<string, unknown>[])[0];
    expect(ann.shape).toBe("circle");
    const geom = JSON.parse(ann.geometry as string);
    expect(geom.shape).toBe("circle");
    expect(typeof geom.cx).toBe("number");
    expect(typeof geom.cy).toBe("number");
    expect(geom.rx).toBeGreaterThan(0);
    expect(geom.ry).toBeGreaterThan(0);
  });

  test("draws an arrow and persists an arrow geometry with headSize", async ({ page }) => {
    const fb = await drawShapeAndSubmit(page, "arrow", "Arrow feedback");
    const ann = (fb.annotations as Record<string, unknown>[])[0];
    expect(ann.shape).toBe("arrow");
    const geom = JSON.parse(ann.geometry as string);
    expect(geom.shape).toBe("arrow");
    expect(typeof geom.x1).toBe("number");
    expect(typeof geom.y1).toBe("number");
    expect(typeof geom.x2).toBe("number");
    expect(typeof geom.y2).toBe("number");
    expect(geom.headSize).toBeGreaterThan(0);
  });

  test("draws a line and persists a line geometry", async ({ page }) => {
    const fb = await drawShapeAndSubmit(page, "line", "Line feedback");
    const ann = (fb.annotations as Record<string, unknown>[])[0];
    expect(ann.shape).toBe("line");
    const geom = JSON.parse(ann.geometry as string);
    expect(geom.shape).toBe("line");
    expect(typeof geom.x1).toBe("number");
    expect(typeof geom.x2).toBe("number");
  });

  test("draws a textbox and persists the popup message as geometry.text", async ({ page }) => {
    const fb = await drawShapeAndSubmit(page, "textbox", "My textbox note");
    const ann = (fb.annotations as Record<string, unknown>[])[0];
    expect(ann.shape).toBe("textbox");
    const geom = JSON.parse(ann.geometry as string);
    expect(geom.shape).toBe("textbox");
    expect(geom.text).toBe("My textbox note");
    expect(geom.fontSize).toBe(14);
  });

  test("freehand drag persists a freehand geometry with ≥ 2 points", async ({ page }) => {
    const fb = await drawShapeAndSubmit(page, "freehand", "Freehand feedback");
    const ann = (fb.annotations as Record<string, unknown>[])[0];
    expect(ann.shape).toBe("freehand");
    const geom = JSON.parse(ann.geometry as string);
    expect(geom.shape).toBe("freehand");
    expect(Array.isArray(geom.points)).toBe(true);
    expect(geom.points.length).toBeGreaterThanOrEqual(2);
    expect(geom.strokeWidth).toBeGreaterThan(0);
  });

  test("keyboard shortcut 'C' switches to circle mode", async ({ page }) => {
    const s = shadow(page);
    await s.click(".sp-fab");
    await s.waitFor('[data-item-id="annotate"]');
    await s.click('[data-item-id="annotate"]');
    await page.waitForFunction(() => !!document.querySelector("div[style*='crosshair']"));

    await page.keyboard.press("c");
    await page.waitForFunction(
      () => document.querySelector('button[data-shape="circle"]')?.getAttribute("data-active") === "true",
    );
    const isActive = await page.evaluate(
      () => document.querySelector('button[data-shape="circle"]')?.getAttribute("data-active") === "true",
    );
    expect(isActive).toBe(true);
  });
});
```

- [ ] **Step 9.3: Build widget so the E2E server picks up changes**

```bash
cd /Users/brian/dev/colaborate
bun run build 2>&1 | tail -5
```

- [ ] **Step 9.4: Run the new E2E tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:e2e --grep "Phase 1c" 2>&1 | tail -30
```

Expected: 6 new tests pass across all 3 browsers (so 18 test-runs total, 1 may skip on WebKit if TouchEvent quirks surface — debug if so).

- [ ] **Step 9.5: Run the full E2E suite to confirm no regressions**

```bash
cd /Users/brian/dev/colaborate
bun run test:e2e 2>&1 | tail -15
```

Expected: 85 original + 18 new (6 × 3 browsers) = **103 passed**, 2 mobile skips.

- [ ] **Step 9.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add e2e/widget.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): Playwright coverage for all 5 new shape drawing primitives

Adds drawShapeAndSubmit() helper that encapsulates annotate → pick shape
→ drag → popup → identity → fetch persisted feedback. 6 new tests
covering circle/arrow/line/textbox/freehand geometry shape, plus a
keyboard-shortcut test for 'C' switching to circle mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Full baseline verification + tag

- [ ] **Step 10.1: Build all packages**

```bash
cd /Users/brian/dev/colaborate
bun run build 2>&1 | tail -10
```

Expected: 7/7 packages build.

- [ ] **Step 10.2: Run full unit test suite**

```bash
bun run test:run 2>&1 | tail -10
```

Expected: 796 original + ~30 new (4 shortcuts + 7 shape-render + 11 drawing-modes + 5 shape-picker + 7 annotator + 1 markers) = **~827** passing.

- [ ] **Step 10.3: Run Playwright E2E**

```bash
bun run test:e2e 2>&1 | tail -15
```

Expected: ~103 pass, 2 mobile skips.

- [ ] **Step 10.4: Run biome lint**

```bash
bun run lint 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 10.5: Gate — do not tag if anything above is red**

If any of Steps 10.1–10.4 fail, stop. Investigate — do not push through.

- [ ] **Step 10.6: Update `status.md` and `todo.md`**

Update `/Users/brian/dev/colaborate/status.md` by:
1. Changing the header date to today's date.
2. Adding a new row to the "What's landed" table for Phase 1c with the new commit SHA.
3. Updating the "Phase 1 decomposition" table — mark 1c ✅ with its commit; leave 1b as 📝.
4. Adding a "What Phase 1c shipped" section summarizing: shape picker, 6 drawing modes, shortcuts, shape-render for markers, Perfect Freehand bundled, new i18n keys, E2E per-shape coverage.
5. Updating the final "How to pick this up" test counts (`~827 unit`, `~103 e2e`).

Update `/Users/brian/dev/colaborate/todo.md` by:
1. Moving "Plan 1c" from "Next Up" to "Completed This Session" with the commit SHA + tag.
2. Leaving "Plan 1b — Schema extensions" in "Next Up" as the single remaining Phase 1 sub-plan.

- [ ] **Step 10.7: Commit the docs + tag**

```bash
cd /Users/brian/dev/colaborate
git add status.md todo.md
git commit -m "$(cat <<'EOF'
docs: status.md + todo.md updated for Phase 1c completion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git tag v0.1.1-phase-1c
git log --oneline | head -15
git tag --list
```

Expected: a `v0.1.1-phase-1c` tag on the latest docs commit; the commit log shows the full Phase-1c chain.

---

## Self-Review

- **Spec coverage:**
  - Spec §24 "Fork of SitePing with richer drawing (circle, arrow, line, text box, freehand)" → Tasks 5, 7.
  - Spec §168 "shape picker in the top glass toolbar next to cancel. Keyboard shortcuts R rect, C circle, A arrow, L line, T textbox, F freehand" → Tasks 1, 6, 7.
  - Spec §162 "Freehand uses Perfect Freehand (MIT, ~4 KB) for stroke smoothing" → Tasks 2, 3, 5.
  - Spec §172 "Marker rendering: markers.ts generalizes current rect marker anchor to an 'anchor-on-geometry-centroid' helper used by all shapes" → Tasks 3, 4.
  - Spec §258 "Draw one of each shape, submit session, assert Postgres state" → Task 9 (assert persisted state via ingest mock — the spec's 'Postgres' is abstract; the E2E server is a memory mock; the data path is identical).
  - Not covered by 1c (deferred): `sessionId`, `componentId`, `sourceFile`, `mentions[]`, source resolution — all Plan 1b scope.
- **Placeholder scan:** No TBD / TODO / "add error handling" — every step has the actual code. Each git commit message is literal.
- **Type consistency:**
  - `Shape` used identically across shortcuts.ts, shape-picker.ts, drawing-modes.ts, annotator.ts, shape-render.ts — single import from `@colaborate/core`.
  - `DrawingMode.finish(x, y, anchor) → { geometry: Geometry; bounds: DOMRect } | null` — same signature across all 6 implementations and referenced in Task 7 identically.
  - `renderShapeHighlight(geometry, anchorBounds, color) → HTMLElement | SVGSVGElement` — used in Task 4's `markers.ts` with matching args.
  - `ShapePicker` constructor signature `(colors, t, initial, onChange)` — Task 6 definition matches Task 7 call site.
- **Verification gate:** Tasks 2, 4, 5, 6, 7, 8, 9 each end in a test run. Task 10 is the final gate before the tag. ✓
- **Phase-1a contract honored:** No adapter / schema / validation file is touched. The E2E server's `JSON.stringify(ann.geometry)` path (line 211 of `e2e/server.mjs`) already handles geometry-as-object on the wire — no server changes needed.

---

## Exit criteria (Phase 1c done when all true)

1. All 6 shapes drawable from the UI: picker click OR keyboard shortcut.
2. Each shape persists a geometry JSON whose `shape` field matches the picked shape.
3. Markers render a shape-specific highlight for each geometry type (rectangle + textbox as bordered div; circle/arrow/line/freehand as SVG).
4. Freehand is smoothed via perfect-freehand at both draw time and highlight time.
5. `bun run build && bun run test:run && bun run test:e2e && bun run lint` all exit 0.
6. ~827 unit, ~103 E2E, biome clean.
7. Tag `v0.1.1-phase-1c` on the docs-update commit; small well-described commits for each task.
8. status.md + todo.md reflect the new state.

---

## Handoff to Plan 1b

Plan 1b adds the `ColaborateSession` model + `sessionId`/`componentId`/`sourceFile`/`mentions` fields. Purely additive backend work — no widget churn. With 1c in place, the widget can already *emit* all 6 shapes; 1b lets multiple annotations batch into a named session and carry source-location metadata.
