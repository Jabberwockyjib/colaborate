import { describe, expect, it } from "vitest";
import { feedbackCreateSchema, resolveSourceSchema, sourcemapUploadSchema } from "../src/validation.js";

describe("sourcemapUploadSchema", () => {
  it("accepts a well-formed body", () => {
    const parsed = sourcemapUploadSchema.safeParse({
      projectName: "parkland",
      env: "staging",
      hash: "a".repeat(64),
      filename: "main.js.map",
      content: '{"version":3,"sources":[],"mappings":""}',
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-hex 64-char hash", () => {
    const parsed = sourcemapUploadSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "zzz",
      filename: "x.map",
      content: "{}",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing projectName", () => {
    const parsed = sourcemapUploadSchema.safeParse({
      env: "staging",
      hash: "a".repeat(64),
      filename: "x.map",
      content: "{}",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("resolveSourceSchema", () => {
  it("accepts a well-formed body", () => {
    const parsed = resolveSourceSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "a".repeat(64),
      line: 10,
      column: 5,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects line < 1", () => {
    const parsed = resolveSourceSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "a".repeat(64),
      line: 0,
      column: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects column < 0", () => {
    const parsed = resolveSourceSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "a".repeat(64),
      line: 1,
      column: -1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("feedbackCreateSchema with source fields", () => {
  const base = {
    projectName: "p",
    type: "bug" as const,
    message: "msg",
    url: "https://example.com/",
    viewport: "1280x720",
    userAgent: "ua",
    authorName: "a",
    authorEmail: "a@example.com",
    clientId: "c1",
    annotations: [],
  };

  it("accepts payload without source fields (backward compatible)", () => {
    const parsed = feedbackCreateSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("accepts payload with source fields populated", () => {
    const parsed = feedbackCreateSchema.safeParse({
      ...base,
      sourceFile: "app/CheckoutButton.tsx",
      sourceLine: 42,
      sourceColumn: 5,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceFile).toBe("app/CheckoutButton.tsx");
      expect(parsed.data.sourceLine).toBe(42);
      expect(parsed.data.sourceColumn).toBe(5);
    }
  });

  it("rejects negative sourceLine", () => {
    const parsed = feedbackCreateSchema.safeParse({
      ...base,
      sourceFile: "a.ts",
      sourceLine: -1,
      sourceColumn: 0,
    });
    expect(parsed.success).toBe(false);
  });
});
