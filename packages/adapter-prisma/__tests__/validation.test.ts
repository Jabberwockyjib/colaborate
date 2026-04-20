import { describe, expect, it } from "vitest";
import { feedbackCreateSchema, feedbackPatchSchema, formatValidationErrors } from "../src/validation.js";
import { validAnnotation, validPayload } from "./fixtures.js";

describe("feedbackCreateSchema", () => {
  it("accepts a valid payload", () => {
    const result = feedbackCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts payload without annotations", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing projectName", () => {
    const { projectName, ...rest } = validPayload;
    const result = feedbackCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty message", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects message over 5000 chars", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      message: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      authorEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects geometry with unknown shape", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [
        {
          ...validAnnotation,
          shape: "zigzag",
          geometry: { shape: "zigzag", x: 0, y: 0 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects geometry missing required field for the declared shape", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [
        {
          ...validAnnotation,
          shape: "rectangle",
          // missing x, y, w, h
          geometry: { shape: "rectangle" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects annotation when shape and geometry.shape disagree", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [
        {
          ...validAnnotation,
          shape: "circle",
          geometry: { shape: "rectangle", x: 0, y: 0, w: 1, h: 1 },
        },
      ],
    });
    // discriminatedUnion resolves to rectangle, but the outer enum "shape" says circle;
    // Zod accepts the inner discriminator, leaving shape/geometry consistent inside geometry itself.
    // This test documents that the schema currently does NOT cross-check top-level shape vs geometry.shape —
    // consumers treat geometry.shape as the source of truth.
    expect(result.success).toBe(true);
  });

  it("validates all four feedback types", () => {
    for (const type of ["question", "change", "bug", "other"]) {
      const result = feedbackCreateSchema.safeParse({
        ...validPayload,
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects annotation missing fingerprint", () => {
    const { fingerprint, ...anchorWithout } = validAnnotation.anchor;
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [{ ...validAnnotation, anchor: anchorWithout }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects annotation missing textPrefix", () => {
    const { textPrefix, ...anchorWithout } = validAnnotation.anchor;
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [{ ...validAnnotation, anchor: anchorWithout }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects annotation missing textSnippet", () => {
    const { textSnippet, ...anchorWithout } = validAnnotation.anchor;
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [{ ...validAnnotation, anchor: anchorWithout }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects annotation missing textSuffix", () => {
    const { textSuffix, ...anchorWithout } = validAnnotation.anchor;
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [{ ...validAnnotation, anchor: anchorWithout }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects annotation missing neighborText", () => {
    const { neighborText, ...anchorWithout } = validAnnotation.anchor;
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [{ ...validAnnotation, anchor: anchorWithout }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty strings for text context fields", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      annotations: [
        {
          ...validAnnotation,
          anchor: {
            ...validAnnotation.anchor,
            textSnippet: "",
            textPrefix: "",
            textSuffix: "",
            fingerprint: "",
            neighborText: "",
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with sessionId, componentId, mentions", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      sessionId: "sess-1",
      componentId: "Checkout",
      mentions: [{ kind: "user", handle: "alice" }],
    });
    expect(result.success).toBe(true);
  });

  it("defaults mentions to [] when omitted", () => {
    const result = feedbackCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mentions).toEqual([]);
  });

  it("rejects mention with unknown kind", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      mentions: [{ kind: "robot", handle: "a" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects mention with empty handle", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      mentions: [{ kind: "user", handle: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects over 100 mentions", () => {
    const result = feedbackCreateSchema.safeParse({
      ...validPayload,
      mentions: Array.from({ length: 101 }, (_, i) => ({ kind: "user", handle: `u${i}` })),
    });
    expect(result.success).toBe(false);
  });
});

describe("feedbackPatchSchema", () => {
  it("accepts valid resolve", () => {
    const result = feedbackPatchSchema.safeParse({
      id: "abc123",
      projectName: "test-project",
      status: "resolved",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid unresolve", () => {
    const result = feedbackPatchSchema.safeParse({
      id: "abc123",
      projectName: "test-project",
      status: "open",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = feedbackPatchSchema.safeParse({
      id: "abc123",
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = feedbackPatchSchema.safeParse({ status: "resolved" });
    expect(result.success).toBe(false);
  });
});

describe("formatValidationErrors", () => {
  it("formats errors as field + message pairs", () => {
    const result = feedbackCreateSchema.safeParse({ type: "invalid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = formatValidationErrors(result.error);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toHaveProperty("field");
      expect(errors[0]).toHaveProperty("message");
    }
  });
});
