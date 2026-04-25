import { describe, expect, it } from "vitest";
import { hashSourcemapContent } from "../src/sourcemap-hash.js";

describe("hashSourcemapContent", () => {
  it("produces a deterministic 64-char hex SHA-256 digest for string input", () => {
    const hex = hashSourcemapContent('{"version":3,"sources":["a.ts"],"mappings":""}');
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    // Determinism — same input, same output
    expect(hashSourcemapContent('{"version":3,"sources":["a.ts"],"mappings":""}')).toBe(hex);
  });

  it("produces the same digest for string and Buffer inputs of equal bytes", () => {
    const text = '{"version":3,"sources":["main.js"],"mappings":";AAAA"}';
    const fromString = hashSourcemapContent(text);
    const fromBuffer = hashSourcemapContent(Buffer.from(text, "utf8"));
    expect(fromBuffer).toBe(fromString);
  });

  it("differs across different inputs", () => {
    const a = hashSourcemapContent('{"version":3,"mappings":"AAAA"}');
    const b = hashSourcemapContent('{"version":3,"mappings":"BBBB"}');
    expect(a).not.toBe(b);
  });
});
