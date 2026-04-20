import { describe, expect, it } from "vitest";
import { getShapeFromKey, SHAPE_SHORTCUTS } from "../../src/shortcuts.js";

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
