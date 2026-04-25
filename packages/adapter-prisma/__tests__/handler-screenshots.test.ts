import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "@colaborate/adapter-memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createColaborateHandler } from "../src/index.js";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("createColaborateHandler — screenshots", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "colaborate-handler-ss-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips attach then list via the handler", async () => {
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store, apiKey: "secret" });

    // Seed a feedback directly via the store — the handler's feedback POST is separately tested.
    const feedback = await store.createFeedback({
      projectName: "demo",
      type: "bug",
      message: "hello",
      status: "open",
      url: "https://example.com",
      viewport: "1024x768",
      userAgent: "vitest",
      authorName: "x",
      authorEmail: "x@x.com",
      clientId: `cid-${Date.now()}`,
      mentions: "[]",
      annotations: [],
    });

    const attachRes = await handler.POST(
      new Request(`http://test/api/colaborate/feedbacks/${feedback.id}/screenshots`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
      }),
    );
    expect(attachRes.status).toBe(201);

    const listRes = await handler.GET(
      new Request(`http://test/api/colaborate/feedbacks/${feedback.id}/screenshots`, {
        headers: { authorization: "Bearer secret" },
      }),
    );
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as unknown[];
    expect(body).toHaveLength(1);
  });

  it("serves PNG bytes via GET when screenshotStore is configured", async () => {
    // Use FsScreenshotStore directly to write bytes; exercise the GET-bytes route.
    // MemoryStore doesn't carry bytes, so this test bypasses the store abstraction and
    // hits the FsScreenshotStore side of the handler.
    const { FsScreenshotStore } = await import("../src/fs-screenshot-store.js");
    const fsStore = new FsScreenshotStore({ root });
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
    const record = await fsStore.putScreenshot("fb-bytes", bytes);

    const handler = createColaborateHandler({
      store: new MemoryStore(),
      screenshotStore: fsStore,
      apiKey: "secret",
    });
    const res = await handler.GET(
      new Request(`http://test/api/colaborate/feedbacks/fb-bytes/screenshots/${record.id}`, {
        headers: { authorization: "Bearer secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const served = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(served, bytes)).toBe(0);
  });

  it("returns 401 on attach when apiKey set and no Authorization header", async () => {
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store, apiKey: "secret" });
    const res = await handler.POST(
      new Request(`http://test/api/colaborate/feedbacks/fb-1/screenshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("honors a custom screenshotMaxBytes — rejects payload exceeding the configured cap", async () => {
    // Build a PNG dataUrl whose base64 portion exceeds a small cap. We pad with
    // valid base64 chars so the regex passes; the .max() check is what fires.
    const tinyCap = 1024;
    const oversizedBase64 = "A".repeat(tinyCap + 1);
    const oversizedDataUrl = `data:image/png;base64,${oversizedBase64}`;

    const store = new MemoryStore();
    const handler = createColaborateHandler({ store, apiKey: "secret", screenshotMaxBytes: tinyCap });

    const res = await handler.POST(
      new Request("http://test/api/colaborate/feedbacks/fb-tiny/screenshots", {
        method: "POST",
        headers: { authorization: "Bearer secret", "content-type": "application/json" },
        body: JSON.stringify({ dataUrl: oversizedDataUrl }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors?: Array<{ field: string; message: string }> };
    expect(body.errors?.some((e) => e.field === "dataUrl" && /cap/i.test(e.message))).toBe(true);
  });

  it("default screenshotMaxBytes still accepts payloads under the 14 MiB cap", async () => {
    // Sanity: omitting the option preserves the historical behavior — a normal
    // 1x1 PNG dataUrl is well under any reasonable cap and must be accepted.
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store, apiKey: "secret" });
    const fb = await store.createFeedback({
      projectName: "demo",
      type: "bug",
      message: "hi",
      status: "open",
      url: "https://example.com",
      viewport: "1024x768",
      userAgent: "vitest",
      authorName: "x",
      authorEmail: "x@x.com",
      clientId: `cid-default-${Date.now()}`,
      mentions: "[]",
      annotations: [],
    });

    const res = await handler.POST(
      new Request(`http://test/api/colaborate/feedbacks/${fb.id}/screenshots`, {
        method: "POST",
        headers: { authorization: "Bearer secret", "content-type": "application/json" },
        body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
