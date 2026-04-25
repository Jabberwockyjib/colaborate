import { describe, expect, it } from "vitest";
import { geometryHint } from "../src/bundle.js";

describe("geometryHint", () => {
  it("rectangle → 'rectangle covering …% × …% of the anchor'", () => {
    const json = JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
    expect(geometryHint(json)).toBe("rectangle covering 50% × 30% of the anchor");
  });

  it("circle → 'circle (rx=…%, ry=…%)'", () => {
    const json = JSON.stringify({ shape: "circle", cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.15 });
    expect(geometryHint(json)).toBe("circle (rx=20%, ry=15%)");
  });

  it("arrow → 'arrow from (…,…) to (…,…)'", () => {
    const json = JSON.stringify({ shape: "arrow", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7, headSize: 12 });
    expect(geometryHint(json)).toBe("arrow from (10%, 20%) to (80%, 70%)");
  });

  it("line → 'line from (…,…) to (…,…)'", () => {
    const json = JSON.stringify({ shape: "line", x1: 0.0, y1: 0.5, x2: 1.0, y2: 0.5 });
    expect(geometryHint(json)).toBe("line from (0%, 50%) to (100%, 50%)");
  });

  it("textbox → 'textbox: \"…\"'", () => {
    const json = JSON.stringify({
      shape: "textbox",
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.1,
      text: "Looks off here",
      fontSize: 14,
    });
    expect(geometryHint(json)).toBe('textbox: "Looks off here"');
  });

  it("textbox truncates long text to 80 chars + ellipsis", () => {
    const long = "a".repeat(100);
    const json = JSON.stringify({ shape: "textbox", x: 0, y: 0, w: 1, h: 1, text: long, fontSize: 12 });
    expect(geometryHint(json)).toBe(`textbox: "${"a".repeat(80)}…"`);
  });

  it("freehand → 'freehand stroke (N points)'", () => {
    const json = JSON.stringify({
      shape: "freehand",
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      strokeWidth: 3,
    });
    expect(geometryHint(json)).toBe("freehand stroke (3 points)");
  });

  it("invalid JSON → 'unknown geometry'", () => {
    expect(geometryHint("{not json")).toBe("unknown geometry");
  });

  it("unrecognized shape → 'unknown geometry'", () => {
    const json = JSON.stringify({ shape: "polygon", points: [] });
    expect(geometryHint(json)).toBe("unknown geometry");
  });
});

import { MemoryStore } from "@colaborate/adapter-memory";
import { type BundleFeedbackInput, loadSessionBundle, serializeBundle } from "../src/bundle.js";

describe("loadSessionBundle", () => {
  it("loads session + feedbacks + screenshots keyed by feedbackId", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    const fbA = await store.createFeedback({
      projectName: "p",
      type: "bug",
      message: "A",
      status: "open",
      url: "https://x",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "Alice",
      authorEmail: "a@x",
      clientId: "c-a",
      sessionId: session.id,
      annotations: [],
    });
    const fbB = await store.createFeedback({
      projectName: "p",
      type: "bug",
      message: "B",
      status: "open",
      url: "https://x",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "Bob",
      authorEmail: "b@x",
      clientId: "c-b",
      sessionId: session.id,
      annotations: [],
    });
    // unrelated feedback (different session)
    await store.createFeedback({
      projectName: "p",
      type: "bug",
      message: "Z",
      status: "open",
      url: "https://x",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "Other",
      authorEmail: "o@x",
      clientId: "c-z",
      annotations: [],
    });

    // Tiny PNG (1x1 transparent — official PNG bytes, base64-encoded)
    const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    await store.attachScreenshot(fbA.id, `data:image/png;base64,${PNG_1x1}`);

    const bundle = await loadSessionBundle(store, session.id);
    expect(bundle.session.id).toBe(session.id);
    expect(bundle.feedbacks.map((f) => f.id).sort()).toEqual([fbA.id, fbB.id].sort());
    expect(bundle.screenshotsByFeedbackId[fbA.id]).toHaveLength(1);
    expect(bundle.screenshotsByFeedbackId[fbB.id]).toEqual([]);
    // Unrelated feedback NOT in bundle
    expect(bundle.feedbacks.find((f) => f.clientId === "c-z")).toBeUndefined();
  });

  it("throws when session does not exist", async () => {
    const store = new MemoryStore();
    await expect(loadSessionBundle(store, "nope")).rejects.toThrow(/session not found/i);
  });
});

describe("serializeBundle", () => {
  it("emits a JSON string with stable shape", () => {
    const session = {
      id: "s1",
      projectName: "p",
      reviewerName: "Alice",
      reviewerEmail: null,
      status: "submitted" as const,
      submittedAt: new Date("2026-04-25T10:00:00Z"),
      triagedAt: null,
      notes: null,
      failureReason: null,
      createdAt: new Date("2026-04-25T09:00:00Z"),
      updatedAt: new Date("2026-04-25T10:00:00Z"),
    };
    const feedbacks: BundleFeedbackInput[] = [
      {
        id: "fb-1",
        message: "header is too low contrast",
        authorName: "Alice",
        componentId: "Header",
        sourceFile: "components/Header.tsx",
        sourceLine: 12,
        url: "https://app/",
        viewport: "1280x720",
        annotations: [
          { shape: "rectangle", geometry: JSON.stringify({ shape: "rectangle", x: 0, y: 0, w: 0.5, h: 0.1 }) },
        ],
        screenshots: ["/api/colaborate/feedbacks/fb-1/screenshots/abc"],
      },
    ];
    const text = serializeBundle({ session, feedbacks });
    const parsed = JSON.parse(text);
    expect(parsed.session.id).toBe("s1");
    expect(parsed.feedbacks).toHaveLength(1);
    expect(parsed.feedbacks[0].id).toBe("fb-1");
    expect(parsed.feedbacks[0].geometryHint).toMatch(/rectangle/);
    expect(parsed.feedbacks[0].screenshots).toEqual(["/api/colaborate/feedbacks/fb-1/screenshots/abc"]);
  });

  it("omits null/undefined feedback fields cleanly", () => {
    const session = {
      id: "s1",
      projectName: "p",
      reviewerName: null,
      reviewerEmail: null,
      status: "submitted" as const,
      submittedAt: new Date(),
      triagedAt: null,
      notes: null,
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const feedbacks: BundleFeedbackInput[] = [
      {
        id: "fb-1",
        message: "x",
        authorName: "A",
        componentId: null,
        sourceFile: null,
        sourceLine: null,
        url: "https://app/",
        viewport: "1280x720",
        annotations: [],
        screenshots: [],
      },
    ];
    const text = serializeBundle({ session, feedbacks });
    const parsed = JSON.parse(text);
    expect(parsed.feedbacks[0]).not.toHaveProperty("componentId");
    expect(parsed.feedbacks[0]).not.toHaveProperty("sourceFile");
    expect(parsed.feedbacks[0]).not.toHaveProperty("geometryHint");
  });
});
