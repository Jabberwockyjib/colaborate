import { describe, expect, it } from "vitest";
import { geometryHint } from "../src/bundle.js";

describe("geometryHint", () => {
  it("rectangle → 'rectangle covering …% × …% of the anchor'", () => {
    const json = JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
    expect(geometryHint(json)).toBe("rectangle covering 50% × 30% of the anchor");
  });

  it("circle → 'circle (rx=…%, ry=…%)'", () => {
    const json = JSON.stringify({ shape: "circle", cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.15 });
    expect(geometryHint(json)).toBe("circle (rx=20%, ry=15%)");
  });

  it("arrow → 'arrow from (…,…) to (…,…)'", () => {
    const json = JSON.stringify({ shape: "arrow", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7, headSize: 12 });
    expect(geometryHint(json)).toBe("arrow from (10%, 20%) to (80%, 70%)");
  });

  it("line → 'line from (…,…) to (…,…)'", () => {
    const json = JSON.stringify({ shape: "line", x1: 0.0, y1: 0.5, x2: 1.0, y2: 0.5 });
    expect(geometryHint(json)).toBe("line from (0%, 50%) to (100%, 50%)");
  });

  it("textbox → 'textbox: \"…\"'", () => {
    const json = JSON.stringify({
      shape: "textbox",
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.1,
      text: "Looks off here",
      fontSize: 14,
    });
    expect(geometryHint(json)).toBe('textbox: "Looks off here"');
  });

  it("textbox truncates long text to 80 chars + ellipsis", () => {
    const long = "a".repeat(100);
    const json = JSON.stringify({ shape: "textbox", x: 0, y: 0, w: 1, h: 1, text: long, fontSize: 12 });
    expect(geometryHint(json)).toBe(`textbox: "${"a".repeat(80)}…"`);
  });

  it("freehand → 'freehand stroke (N points)'", () => {
    const json = JSON.stringify({
      shape: "freehand",
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      strokeWidth: 3,
    });
    expect(geometryHint(json)).toBe("freehand stroke (3 points)");
  });

  it("invalid JSON → 'unknown geometry'", () => {
    expect(geometryHint("{not json")).toBe("unknown geometry");
  });

  it("unrecognized shape → 'unknown geometry'", () => {
    const json = JSON.stringify({ shape: "polygon", points: [] });
    expect(geometryHint(json)).toBe("unknown geometry");
  });
});
