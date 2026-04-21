import { MemoryStore } from "@colaborate/adapter-memory";
import { describe, expect, it } from "vitest";
import { createColaborateHandler } from "../src/index.js";

const ANCHOR = {
  cssSelector: "main > h1",
  xpath: "/html/body/main/h1",
  textSnippet: "Hi",
  elementTag: "H1",
  textPrefix: "",
  textSuffix: "",
  fingerprint: "1:0:x",
  neighborText: "",
};

const ANNOTATION = {
  anchor: ANCHOR,
  shape: "rectangle" as const,
  geometry: { shape: "rectangle" as const, x: 0, y: 0, w: 1, h: 1 },
  scrollX: 0,
  scrollY: 0,
  viewportW: 1280,
  viewportH: 720,
  devicePixelRatio: 1,
};

describe("createColaborateHandler POST — source fields", () => {
  it("persists sourceFile/Line/Column when present on the payload", async () => {
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store });

    const response = await handler.POST(
      new Request("http://t/api/colaborate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName: "p",
          type: "bug",
          message: "msg",
          url: "https://example.com/",
          viewport: "1280x720",
          userAgent: "ua",
          authorName: "a",
          authorEmail: "a@example.com",
          clientId: "c1",
          annotations: [ANNOTATION],
          sourceFile: "app/CheckoutButton.tsx",
          sourceLine: 42,
          sourceColumn: 5,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sourceFile: string | null;
      sourceLine: number | null;
      sourceColumn: number | null;
    };
    expect(body.sourceFile).toBe("app/CheckoutButton.tsx");
    expect(body.sourceLine).toBe(42);
    expect(body.sourceColumn).toBe(5);
  });

  it("leaves source fields null when payload omits them (backward compat)", async () => {
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store });

    const response = await handler.POST(
      new Request("http://t/api/colaborate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName: "p",
          type: "bug",
          message: "msg",
          url: "https://example.com/",
          viewport: "1280x720",
          userAgent: "ua",
          authorName: "a",
          authorEmail: "a@example.com",
          clientId: "c2",
          annotations: [ANNOTATION],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sourceFile: string | null;
      sourceLine: number | null;
      sourceColumn: number | null;
    };
    expect(body.sourceFile).toBeNull();
    expect(body.sourceLine).toBeNull();
    expect(body.sourceColumn).toBeNull();
  });
});
