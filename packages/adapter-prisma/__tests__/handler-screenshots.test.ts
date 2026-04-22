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
});
