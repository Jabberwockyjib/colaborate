import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FsScreenshotStore } from "../src/fs-screenshot-store.js";

describe("FsScreenshotStore", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "colaborate-screenshots-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const store = () => new FsScreenshotStore({ root });
  const bytes1 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const bytes2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02]);

  it("writes bytes + index.json and lists the metadata", async () => {
    const s = store();
    const record = await s.putScreenshot("fb-1", bytes1);
    expect(record.feedbackId).toBe("fb-1");
    expect(record.id).toMatch(/^[0-9a-f]{64}$/);
    expect(record.byteSize).toBe(bytes1.byteLength);
    expect(record.url).toBe(`/api/colaborate/feedbacks/fb-1/screenshots/${record.id}`);

    const listed = await s.listScreenshots("fb-1");
    expect(listed.map((r) => r.id)).toEqual([record.id]);

    // File actually exists on disk
    const files = await readdir(join(root, "fb-1"));
    expect(files).toContain(`${record.id}.png`);
    expect(files).toContain("index.json");
  });

  it("is idempotent on duplicate bytes — no new file, same id, refreshed createdAt", async () => {
    const s = store();
    const first = await s.putScreenshot("fb-2", bytes1);
    const second = await s.putScreenshot("fb-2", bytes1);
    expect(second.id).toBe(first.id);
    expect(second.createdAt.getTime()).toBeGreaterThanOrEqual(first.createdAt.getTime());

    const listed = await s.listScreenshots("fb-2");
    expect(listed).toHaveLength(1);
  });

  it("stores different contents as separate records", async () => {
    const s = store();
    await s.putScreenshot("fb-3", bytes1);
    await s.putScreenshot("fb-3", bytes2);
    const listed = await s.listScreenshots("fb-3");
    expect(listed).toHaveLength(2);
  });

  it("readScreenshot returns the exact bytes", async () => {
    const s = store();
    const record = await s.putScreenshot("fb-4", bytes1);
    const read = await s.readScreenshot("fb-4", record.id);
    expect(read).not.toBeNull();
    expect(Buffer.compare(read as Buffer, bytes1)).toBe(0);
  });

  it("readScreenshot returns null for unknown hash", async () => {
    const s = store();
    const read = await s.readScreenshot("fb-5", "0".repeat(64));
    expect(read).toBeNull();
  });

  it("listScreenshots returns an empty array for an unknown feedbackId", async () => {
    const s = store();
    const listed = await s.listScreenshots("fb-does-not-exist");
    expect(listed).toEqual([]);
  });

  it("persists across instances (index.json survives restart)", async () => {
    const s1 = store();
    const record = await s1.putScreenshot("fb-6", bytes1);
    const s2 = store();
    const listed = await s2.listScreenshots("fb-6");
    expect(listed.map((r) => r.id)).toEqual([record.id]);
    // index.json is valid JSON
    const raw = await readFile(join(root, "fb-6", "index.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
