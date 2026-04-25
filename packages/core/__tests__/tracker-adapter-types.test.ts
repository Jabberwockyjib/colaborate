import { describe, expect, it } from "vitest";
import type { IssueInput, IssuePatch, IssueRef, SessionBundle, TrackerAdapter } from "../src/index.js";

describe("Phase 5 tracker types", () => {
  it("IssueInput shape compiles", () => {
    const input: IssueInput = { title: "x", body: "y", labels: ["bug"] };
    expect(input.title).toBe("x");
  });

  it("IssueInput labels is optional", () => {
    const input: IssueInput = { title: "x", body: "y" };
    expect(input.labels).toBeUndefined();
  });

  it("IssueRef shape compiles", () => {
    const ref: IssueRef = { provider: "github", issueId: "42", issueUrl: "https://x" };
    expect(ref.provider).toBe("github");
  });

  it("IssuePatch fields are all optional", () => {
    const patch: IssuePatch = {};
    expect(patch).toEqual({});
  });

  it("TrackerAdapter interface contract", async () => {
    const stub: TrackerAdapter = {
      name: "github",
      async createIssue() {
        return { provider: "github", issueId: "1", issueUrl: "https://x/1" };
      },
      async updateIssue() {
        /* noop */
      },
      async linkResolve() {
        return { resolved: false };
      },
    };
    const ref = await stub.createIssue({ title: "t", body: "b" });
    expect(ref.issueId).toBe("1");
  });

  it("SessionBundle shape compiles (smoke — full type ergonomics)", () => {
    const bundle: SessionBundle = {
      session: {
        id: "s",
        projectName: "p",
        reviewerName: null,
        reviewerEmail: null,
        status: "submitted",
        submittedAt: new Date(),
        triagedAt: null,
        notes: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      feedbacks: [],
      screenshotsByFeedbackId: {},
    };
    expect(bundle.feedbacks).toHaveLength(0);
  });
});
