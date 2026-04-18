import { testColaborateStore } from "@colaborate/core/testing";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/index.js";

// Run the full ColaborateStore conformance suite
testColaborateStore(() => new MemoryStore());

// ---------------------------------------------------------------------------
// MemoryStore-specific tests
// ---------------------------------------------------------------------------

describe("MemoryStore specific", () => {
  it("clear() removes all data and resets id counter", async () => {
    const store = new MemoryStore();
    await store.createFeedback({
      projectName: "a",
      type: "bug",
      message: "test",
      status: "open",
      url: "https://example.com",
      viewport: "1920x1080",
      userAgent: "test",
      authorName: "Alice",
      authorEmail: "a@t.com",
      clientId: "c1",
      annotations: [],
    });
    await store.createFeedback({
      projectName: "b",
      type: "bug",
      message: "test",
      status: "open",
      url: "https://example.com",
      viewport: "1920x1080",
      userAgent: "test",
      authorName: "Alice",
      authorEmail: "a@t.com",
      clientId: "c2",
      annotations: [],
    });

    store.clear();

    expect((await store.getFeedbacks({ projectName: "a" })).total).toBe(0);
    expect((await store.getFeedbacks({ projectName: "b" })).total).toBe(0);

    // ID counter resets — next id starts at 1
    const fb = await store.createFeedback({
      projectName: "c",
      type: "bug",
      message: "test",
      status: "open",
      url: "https://example.com",
      viewport: "1920x1080",
      userAgent: "test",
      authorName: "Alice",
      authorEmail: "a@t.com",
      clientId: "c3",
      annotations: [],
    });
    expect(fb.id).toMatch(/^mem-1-/);
  });
});
