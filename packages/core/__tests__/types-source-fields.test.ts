import { describe, expect, expectTypeOf, it } from "vitest";
import type { FeedbackPayload } from "../src/types.js";

describe("FeedbackPayload source fields", () => {
  it("carries optional sourceFile / sourceLine / sourceColumn", () => {
    expectTypeOf<FeedbackPayload>().toHaveProperty("sourceFile");
    expectTypeOf<FeedbackPayload>().toHaveProperty("sourceLine");
    expectTypeOf<FeedbackPayload>().toHaveProperty("sourceColumn");
  });

  it("accepts the three source fields at runtime (compile-time shape check)", () => {
    const p: FeedbackPayload = {
      projectName: "p",
      type: "bug",
      message: "m",
      url: "https://example.com/",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "a",
      authorEmail: "a@example.com",
      annotations: [],
      clientId: "c",
      sourceFile: "src/app.tsx",
      sourceLine: 42,
      sourceColumn: 5,
    };
    expect(p.sourceFile).toBe("src/app.tsx");
  });

  it("still accepts a payload without source fields", () => {
    const p: FeedbackPayload = {
      projectName: "p",
      type: "bug",
      message: "m",
      url: "https://example.com/",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "a",
      authorEmail: "a@example.com",
      annotations: [],
      clientId: "c",
    };
    expect(p.sourceFile).toBeUndefined();
  });
});
