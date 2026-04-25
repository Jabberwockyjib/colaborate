import type { SessionRecord } from "@colaborate/core";
import { describe, expect, it } from "vitest";
import type { BundleFeedbackInput } from "../src/bundle.js";
import { buildTriagePrompt, TRIAGE_SYSTEM_PROMPT } from "../src/prompt.js";

const session: SessionRecord = {
  id: "s1",
  projectName: "p",
  reviewerName: null,
  reviewerEmail: null,
  status: "submitted",
  submittedAt: new Date("2026-04-25T10:00:00Z"),
  triagedAt: null,
  notes: null,
  failureReason: null,
  createdAt: new Date("2026-04-25T09:00:00Z"),
  updatedAt: new Date("2026-04-25T10:00:00Z"),
};

const fb: BundleFeedbackInput = {
  id: "fb-1",
  message: "x",
  authorName: "A",
  componentId: null,
  sourceFile: null,
  sourceLine: null,
  url: "https://x",
  viewport: "1280x720",
  annotations: [],
  screenshots: [],
};

describe("buildTriagePrompt", () => {
  it("returns { system: [{type:'text', text, cache_control}], user: string }", () => {
    const p = buildTriagePrompt({ session, feedbacks: [fb] });
    expect(p.system).toEqual([{ type: "text", text: TRIAGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(typeof p.user).toBe("string");
    expect(p.user).toContain("fb-1");
  });

  it("system text contains the JSON output contract heading", () => {
    expect(TRIAGE_SYSTEM_PROMPT).toContain("Output contract");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("relatedFeedbackIds");
  });

  it("system text contains at least 2 worked examples", () => {
    expect(TRIAGE_SYSTEM_PROMPT).toContain("Example 1");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("Example 2");
  });
});
