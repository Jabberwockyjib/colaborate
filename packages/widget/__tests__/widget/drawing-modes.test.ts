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
    // Drag from (100,100) to (200,200) — anchor at (100,100,200,100):
    // midpoint cx = (100+200)/2 = 150 → fractional (150-100)/200 = 0.25
    // midpoint cy = (100+200)/2 = 150 → fractional (150-100)/100 = 0.5
    // rx = |200-100|/2 = 50 → fractional 50/200 = 0.25
    // ry = |200-100|/2 = 50 → fractional 50/100 = 0.5
    mode.start(100, 100);
    mode.move(200, 200);
    const result = mode.finish(200, 200, anchorBounds);
    expect(result).not.toBeNull();
    expect(result!.geometry.shape).toBe("circle");
    if (result!.geometry.shape === "circle") {
      expect(result!.geometry.cx).toBeCloseTo(0.25, 5);
      expect(result!.geometry.cy).toBeCloseTo(0.5, 5);
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
