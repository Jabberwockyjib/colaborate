import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsSourcemapStore } from "../src/fs-sourcemap-store.js";
import { handleResolveSource, handleUploadSourcemap, matchSourcemapRoute } from "../src/routes-sourcemaps.js";
import { hashSourcemapContent } from "../src/sourcemap-hash.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("matchSourcemapRoute", () => {
  it("matches POST /api/colaborate/sourcemaps", () => {
    expect(matchSourcemapRoute("/api/colaborate/sourcemaps", "POST")).toEqual({ kind: "upload" });
  });

  it("matches POST /api/colaborate/resolve-source", () => {
    expect(matchSourcemapRoute("/api/colaborate/resolve-source", "POST")).toEqual({
      kind: "resolve",
    });
  });

  it("does not match unrelated paths", () => {
    expect(matchSourcemapRoute("/api/colaborate", "POST")).toBeNull();
    expect(matchSourcemapRoute("/api/colaborate/sessions", "POST")).toBeNull();
  });

  it("does not match wrong methods", () => {
    expect(matchSourcemapRoute("/api/colaborate/sourcemaps", "GET")).toBeNull();
    expect(matchSourcemapRoute("/api/colaborate/resolve-source", "GET")).toBeNull();
  });
});

describe("handleUploadSourcemap", () => {
  let root: string;
  let store: FsSourcemapStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "colaborate-routes-"));
    store = new FsSourcemapStore({ root });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function makeRequest(body: unknown, gzip = false): Request {
    if (gzip) {
      const compressed = gzipSync(Buffer.from(JSON.stringify(body), "utf8"));
      return new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", "content-encoding": "gzip" },
        body: compressed,
      });
    }
    return new Request("http://t/api/colaborate/sourcemaps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("stores a plain-JSON upload and returns 201 with the record", async () => {
    const hash = hashSourcemapContent(SIMPLE_MAP);
    const response = await handleUploadSourcemap(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash,
        filename: "main.js.map",
        content: SIMPLE_MAP,
      }),
      store,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; hash: string };
    expect(body.hash).toBe(hash);
    expect(body.id).toBe(`p1:staging:${hash}`);
  });

  it("rejects when the body's hash does not match hashSourcemapContent(content)", async () => {
    const response = await handleUploadSourcemap(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash: "0".repeat(64),
        filename: "main.js.map",
        content: SIMPLE_MAP,
      }),
      store,
    );
    expect(response.status).toBe(400);
  });

  it("rejects on invalid JSON", async () => {
    const bad = new Request("http://t/api/colaborate/sourcemaps", {
      method: "POST",
      body: "not json",
    });
    const response = await handleUploadSourcemap(bad, store);
    expect(response.status).toBe(400);
  });

  it("rejects on schema violation (missing fields)", async () => {
    const response = await handleUploadSourcemap(makeRequest({ projectName: "p1" }), store);
    expect(response.status).toBe(400);
  });

  it("accepts a gzipped body (Content-Encoding: gzip) and stores the decompressed content", async () => {
    const hash = hashSourcemapContent(SIMPLE_MAP);
    const response = await handleUploadSourcemap(
      makeRequest(
        {
          projectName: "p1",
          env: "staging",
          hash,
          filename: "main.js.map",
          content: SIMPLE_MAP,
        },
        true,
      ),
      store,
    );
    expect(response.status).toBe(201);
    const got = await store.getSourcemap(`p1:staging:${hash}`);
    expect(got?.content).toBe(SIMPLE_MAP);
  });
});

describe("handleResolveSource", () => {
  let root: string;
  let store: FsSourcemapStore;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "colaborate-routes-"));
    store = new FsSourcemapStore({ root });
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "a".repeat(64),
      filename: "main.js.map",
      content: SIMPLE_MAP,
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function makeRequest(body: unknown): Request {
    return new Request("http://t/api/colaborate/resolve-source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns a 200 with the resolved triple on a hit", async () => {
    const response = await handleResolveSource(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash: "a".repeat(64),
        line: 1,
        column: 0,
      }),
      store,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sourceFile: string; sourceLine: number; sourceColumn: number };
    expect(body).toEqual({ sourceFile: "a.ts", sourceLine: 1, sourceColumn: 0 });
  });

  it("returns 404 on an unresolvable position", async () => {
    const response = await handleResolveSource(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash: "b".repeat(64),
        line: 1,
        column: 0,
      }),
      store,
    );
    expect(response.status).toBe(404);
  });

  it("rejects on schema violation", async () => {
    const response = await handleResolveSource(makeRequest({ projectName: "p1" }), store);
    expect(response.status).toBe(400);
  });
});
