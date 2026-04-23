import { MemoryStore } from "@colaborate/adapter-memory";
import { describe, expect, it } from "vitest";
import { handle, inputSchema } from "../../src/tools/attach-screenshot.js";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("attach_screenshot tool", () => {
  it("returns the persisted screenshot record as text JSON", async () => {
    const store = new MemoryStore();
    const fb = await store.createFeedback({
      projectName: "demo",
      type: "bug",
      message: "hi",
      status: "open",
      url: "https://example.com",
      viewport: "1024x768",
      userAgent: "ua",
      authorName: "a",
      authorEmail: "a@b.com",
      clientId: `cid-${Math.random()}`,
      mentions: "[]",
      annotations: [],
    });

    const result = await handle({ feedbackId: fb.id, dataUrl: PNG_DATA_URL }, { store });
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { feedbackId: string; id: string };
    expect(parsed.feedbackId).toBe(fb.id);
    expect(parsed.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns isError=true on malformed dataUrl", async () => {
    const store = new MemoryStore();
    const result = await handle({ feedbackId: "any", dataUrl: "not a url" }, { store });
    expect(result.isError).toBe(true);
  });

  it("inputSchema rejects dataUrl exceeding the 14 MiB base64 cap", () => {
    // 14 MiB + 1 byte of base64 after the prefix — deliberately oversized.
    const oversized = `data:image/png;base64,${"A".repeat(14 * 1024 * 1024 + 1)}`;
    const parsed = inputSchema.safeParse({ feedbackId: "any", dataUrl: oversized });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.join(".") === "dataUrl");
      expect(issue?.message).toMatch(/10 MB|cap/i);
    }
  });
});
