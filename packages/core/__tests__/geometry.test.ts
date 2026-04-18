import { describe, expect, it } from "vitest";
import {
  type Geometry,
  geometryFromRect,
  parseGeometry,
  SHAPES,
  type Shape,
  serializeGeometry,
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
    {
      shape: "freehand",
      points: [
        [0.1, 0.1],
        [0.2, 0.15],
        [0.25, 0.2],
      ],
      strokeWidth: 3,
    },
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
