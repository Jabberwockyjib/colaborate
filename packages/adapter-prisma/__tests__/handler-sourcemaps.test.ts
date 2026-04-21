import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "@colaborate/adapter-memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createColaborateHandler } from "../src/index.js";
import { hashSourcemapContent } from "../src/sourcemap-hash.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("createColaborateHandler — sourcemap routes", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "colaborate-handler-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("wires POST /api/colaborate/sourcemaps into the handler", async () => {
    const handler = createColaborateHandler({
      store: new MemoryStore(),
      sourcemapStorePath: root,
      apiKey: "shh",
    });

    const hash = hashSourcemapContent(SIMPLE_MAP);
    const response = await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({
          projectName: "p1",
          env: "staging",
          hash,
          filename: "main.js.map",
          content: SIMPLE_MAP,
        }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it("requires bearer auth on upload when apiKey is set", async () => {
    const handler = createColaborateHandler({
      store: new MemoryStore(),
      sourcemapStorePath: root,
      apiKey: "shh",
    });

    const response = await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("wires POST /api/colaborate/resolve-source and returns the resolved triple", async () => {
    const handler = createColaborateHandler({
      store: new MemoryStore(),
      sourcemapStorePath: root,
      apiKey: "shh",
    });

    const hash = hashSourcemapContent(SIMPLE_MAP);
    await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({
          projectName: "p1",
          env: "staging",
          hash,
          filename: "main.js.map",
          content: SIMPLE_MAP,
        }),
      }),
    );

    const resolve = await handler.POST(
      new Request("http://t/api/colaborate/resolve-source", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({
          projectName: "p1",
          env: "staging",
          hash,
          line: 1,
          column: 0,
        }),
      }),
    );
    expect(resolve.status).toBe(200);
    const body = (await resolve.json()) as { sourceFile: string };
    expect(body.sourceFile).toBe("a.ts");
  });

  it("returns >=400 when sourcemap routes are called without a sourcemap store configured", async () => {
    const handler = createColaborateHandler({ store: new MemoryStore(), apiKey: "shh" });
    const response = await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).not.toBe(201);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
