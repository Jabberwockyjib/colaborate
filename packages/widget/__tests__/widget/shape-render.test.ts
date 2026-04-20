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
    // svg coordinates are relative to svg's top-left — the shape's fractions
    // are multiplied by the anchor's width/height.
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
