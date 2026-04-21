import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsSourcemapStore } from "../src/fs-sourcemap-store.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("FsSourcemapStore", () => {
  let root: string;
  let store: FsSourcemapStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "colaborate-sm-"));
    store = new FsSourcemapStore({ root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes a map file + an index.json entry on putSourcemap", async () => {
    const record = await store.putSourcemap({
      projectName: "parkland",
      env: "staging",
      hash: "abc123",
      filename: "main.js.map",
      content: SIMPLE_MAP,
    });
    expect(record.id).toBe("parkland:staging:abc123");
    expect(record.hash).toBe("abc123");
    expect(record.filename).toBe("main.js.map");
    expect(record.uploadedAt).toBeInstanceOf(Date);

    // File actually written
    const written = await readFile(join(root, "parkland", "staging", "abc123.map"), "utf8");
    expect(written).toBe(SIMPLE_MAP);
    // Metadata index actually written
    const rawIndex = await readFile(join(root, "parkland", "staging", "index.json"), "utf8");
    const index = JSON.parse(rawIndex) as Array<{ hash: string }>;
    expect(index).toHaveLength(1);
    expect(index[0]!.hash).toBe("abc123");
  });

  it("getSourcemap returns the record + content for a known id", async () => {
    await store.putSourcemap({
      projectName: "p1",
      env: "prod",
      hash: "deadbeef",
      filename: "a.js.map",
      content: SIMPLE_MAP,
    });
    const got = await store.getSourcemap("p1:prod:deadbeef");
    expect(got).not.toBeNull();
    expect(got!.record.filename).toBe("a.js.map");
    expect(got!.content).toBe(SIMPLE_MAP);
  });

  it("getSourcemap returns null for an unknown id", async () => {
    expect(await store.getSourcemap("nope:nope:nope")).toBeNull();
  });

  it("listSourcemaps returns newest first", async () => {
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "h1",
      filename: "1.map",
      content: SIMPLE_MAP,
    });
    // Nudge the clock forward so uploadedAt orderings are observable.
    await new Promise((r) => setTimeout(r, 5));
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "h2",
      filename: "2.map",
      content: SIMPLE_MAP,
    });

    const list = await store.listSourcemaps("p1", "staging");
    expect(list.map((r) => r.hash)).toEqual(["h2", "h1"]);
  });

  it("listSourcemaps returns empty array when no uploads exist", async () => {
    expect(await store.listSourcemaps("unknown-project", "unknown-env")).toEqual([]);
  });

  it("overwriting the same hash leaves a single index entry + refreshes uploadedAt", async () => {
    const first = await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "abc",
      filename: "old.map",
      content: SIMPLE_MAP,
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "abc",
      filename: "new.map",
      content: SIMPLE_MAP,
    });

    expect(second.uploadedAt.getTime()).toBeGreaterThan(first.uploadedAt.getTime());
    expect(second.filename).toBe("new.map");
    const list = await store.listSourcemaps("p1", "staging");
    expect(list).toHaveLength(1);
    expect(list[0]!.filename).toBe("new.map");
  });

  it("resolveSourceLocation hits the stored map and returns the original position", async () => {
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "h1",
      filename: "x.map",
      content: SIMPLE_MAP,
    });
    const resolved = await store.resolveSourceLocation({
      projectName: "p1",
      env: "staging",
      hash: "h1",
      line: 1,
      column: 0,
    });
    expect(resolved).toEqual({ sourceFile: "a.ts", sourceLine: 1, sourceColumn: 0 });
  });

  it("resolveSourceLocation returns null when the hash is unknown", async () => {
    const resolved = await store.resolveSourceLocation({
      projectName: "p1",
      env: "staging",
      hash: "missing",
      line: 1,
      column: 0,
    });
    expect(resolved).toBeNull();
  });
});
