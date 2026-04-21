import { describe, expect, it } from "vitest";
import { resolveSource } from "../src/sourcemap-resolver.js";

// Hand-rolled fixture. The VLQ mapping below corresponds to:
//   bundled line 1, column 0  →  original a.ts, line 1, column 0
//   bundled line 1, column 10 →  original a.ts, line 2, column 5
// Generated with https://github.com/jridgewell/sourcemap-codec
const fixture = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA,UACK",
});

describe("resolveSource", () => {
  it("maps a bundled position to the original source", () => {
    const result = resolveSource(fixture, 1, 0);
    expect(result).toEqual({ source: "a.ts", line: 1, column: 0 });
  });

  it("maps a later bundled column to a later original line", () => {
    const result = resolveSource(fixture, 1, 10);
    expect(result).toEqual({ source: "a.ts", line: 2, column: 5 });
  });

  it("returns null when the bundled position has no mapping", () => {
    // Line 999 is way past any mapping in the fixture.
    expect(resolveSource(fixture, 999, 0)).toBeNull();
  });

  it("returns null when the map is syntactically broken", () => {
    expect(resolveSource("not json", 1, 0)).toBeNull();
  });

  it("returns null when a mapping has no source (e.g. inline code without a source entry)", () => {
    const empty = JSON.stringify({
      version: 3,
      file: "bundle.js",
      sources: [],
      names: [],
      mappings: "",
    });
    expect(resolveSource(empty, 1, 0)).toBeNull();
  });
});
