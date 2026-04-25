import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "@colaborate/adapter-memory";
import type { ColaborateStore, ScreenshotRecord } from "@colaborate/core";
import { StoreValidationError } from "@colaborate/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsScreenshotStore } from "../src/fs-screenshot-store.js";
import {
  handleAttachScreenshot,
  handleListScreenshots,
  handleReadScreenshot,
  matchScreenshotRoute,
} from "../src/routes-screenshots.js";

// 1x1 transparent PNG (base64-encoded)
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("matchScreenshotRoute", () => {
  it("matches POST attach route", () => {
    expect(matchScreenshotRoute("/api/colaborate/feedbacks/fb-1/screenshots", "POST")).toEqual({
      kind: "attach",
      feedbackId: "fb-1",
    });
  });
  it("matches GET list route", () => {
    expect(matchScreenshotRoute("/api/colaborate/feedbacks/fb-1/screenshots", "GET")).toEqual({
      kind: "list",
      feedbackId: "fb-1",
    });
  });
  it("matches GET bytes route", () => {
    expect(matchScreenshotRoute("/api/colaborate/feedbacks/fb-1/screenshots/abc123", "GET")).toEqual({
      kind: "read",
      feedbackId: "fb-1",
      hash: "abc123",
    });
  });
  it("returns null for non-screenshot paths", () => {
    expect(matchScreenshotRoute("/api/colaborate/sessions/s-1", "GET")).toBeNull();
  });
  it("returns null for wrong-method combos", () => {
    expect(matchScreenshotRoute("/api/colaborate/feedbacks/fb-1/screenshots", "DELETE")).toBeNull();
  });
});

describe("handleAttachScreenshot", () => {
  let root: string;
  let store: MemoryStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "colaborate-routes-ss-"));
    store = new MemoryStore();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns 201 with the persisted metadata on happy path", async () => {
    const req = new Request("http://test/api/colaborate/feedbacks/fb-1/screenshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
    });
    const res = await handleAttachScreenshot(req, store, "fb-1");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; feedbackId: string; byteSize: number };
    expect(body.id).toMatch(/^[0-9a-f]{64}$/);
    expect(body.feedbackId).toBe("fb-1");
    expect(body.byteSize).toBeGreaterThan(0);
  });

  it("returns 400 on invalid dataUrl", async () => {
    const req = new Request("http://test/api/colaborate/feedbacks/fb-1/screenshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: "not a dataUrl" }),
    });
    const res = await handleAttachScreenshot(req, store, "fb-1");
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request("http://test/api/colaborate/feedbacks/fb-1/screenshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid",
    });
    const res = await handleAttachScreenshot(req, store, "fb-1");
    expect(res.status).toBe(400);
  });

  it("returns 400 when the store throws StoreValidationError (e.g. base64-pads-to-non-PNG)", async () => {
    // dataUrl passes the Zod regex (valid base64 chars) but decodes to bytes that
    // are NOT a PNG — exercising the signature gate inside the store.
    const notAPng = `data:image/png;base64,${Buffer.from("not actually a png at all").toString("base64")}`;
    const req = new Request("http://test/api/colaborate/feedbacks/fb-1/screenshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: notAPng }),
    });
    const res = await handleAttachScreenshot(req, store, "fb-1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/PNG|signature|invalid/i);
  });

  it("returns 500 when the store throws an unrelated error", async () => {
    // Use a stub store whose attachScreenshot rejects with a generic Error — not
    // a StoreValidationError. The handler must NOT mistake this for client error.
    const failingStore: Partial<ColaborateStore> = {
      attachScreenshot: async () => {
        throw new Error("database is on fire");
      },
    };
    const req = new Request("http://test/api/colaborate/feedbacks/fb-1/screenshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // valid 1x1 PNG so Zod accepts the body
      body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
    });
    const res = await handleAttachScreenshot(req, failingStore as ColaborateStore, "fb-1");
    expect(res.status).toBe(500);
  });

  it("preserves StoreValidationError 400 path even with a custom store implementation", async () => {
    // Belt-and-braces: if a non-built-in adapter throws StoreValidationError, the
    // route still classifies it as a 400. Demonstrates the contract is on the error
    // type, not on built-in adapter behavior.
    const validatingStore: Partial<ColaborateStore> = {
      attachScreenshot: async (): Promise<ScreenshotRecord> => {
        throw new StoreValidationError("custom adapter says no");
      },
    };
    const req = new Request("http://test/api/colaborate/feedbacks/fb-1/screenshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
    });
    const res = await handleAttachScreenshot(req, validatingStore as ColaborateStore, "fb-1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("custom adapter says no");
  });
});

describe("handleListScreenshots", () => {
  it("returns 200 with [] for a feedback with no screenshots", async () => {
    const store = new MemoryStore();
    const res = await handleListScreenshots(store, "fb-unknown");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns 200 with attached records after one attach", async () => {
    const store = new MemoryStore();
    await store.attachScreenshot("fb-1", PNG_DATA_URL);
    const res = await handleListScreenshots(store, "fb-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; feedbackId: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.feedbackId).toBe("fb-1");
  });
});

describe("handleReadScreenshot", () => {
  let root: string;
  let screenshotStore: FsScreenshotStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "colaborate-routes-ss-read-"));
    screenshotStore = new FsScreenshotStore({ root });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns 200 PNG bytes with content-type image/png", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
    const record = await screenshotStore.putScreenshot("fb-1", bytes);
    const res = await handleReadScreenshot(screenshotStore, "fb-1", record.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, bytes)).toBe(0);
  });

  it("returns 404 on unknown hash", async () => {
    const res = await handleReadScreenshot(screenshotStore, "fb-1", "0".repeat(64));
    expect(res.status).toBe(404);
  });
});
