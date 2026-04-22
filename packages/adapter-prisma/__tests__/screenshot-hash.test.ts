import { describe, expect, it } from "vitest";
import { hashPngBytes } from "../src/screenshot-hash.js";

describe("hashPngBytes", () => {
  it("produces a 64-char lowercase-hex SHA-256", () => {
    const hash = hashPngBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const a = hashPngBytes(Buffer.from("hello world"));
    const b = hashPngBytes(Buffer.from("hello world"));
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = hashPngBytes(Buffer.from("a"));
    const b = hashPngBytes(Buffer.from("b"));
    expect(a).not.toBe(b);
  });
});
