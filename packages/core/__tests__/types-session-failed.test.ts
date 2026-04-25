import { describe, expect, it } from "vitest";
import { SESSION_STATUSES, COLABORATE_MODELS } from "../src/index.js";

describe("Phase 5 schema additions", () => {
  it("SESSION_STATUSES includes 'failed'", () => {
    expect(SESSION_STATUSES).toContain("failed");
  });

  it("SESSION_STATUSES retains existing values + 'failed' (no removals)", () => {
    expect([...SESSION_STATUSES].sort()).toEqual(
      ["archived", "drafting", "failed", "submitted", "triaged"].sort(),
    );
  });

  it("ColaborateSession schema has optional failureReason text field", () => {
    const session = COLABORATE_MODELS.ColaborateSession;
    expect(session.fields).toHaveProperty("failureReason");
    const f = session.fields.failureReason as { type: string; optional: boolean; nativeType?: string };
    expect(f.type).toBe("String");
    expect(f.optional).toBe(true);
    expect(f.nativeType).toBe("Text");
  });
});
