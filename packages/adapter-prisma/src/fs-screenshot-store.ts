import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScreenshotRecord } from "@colaborate/core";
import { hashPngBytes } from "./screenshot-hash.js";

interface FsIndexEntry {
  id: string;
  byteSize: number;
  createdAt: string;
}

/** Filesystem-backed screenshot store. Layout: `{root}/{feedbackId}/{hash}.png` + sibling `index.json`. */
export class FsScreenshotStore {
  private readonly root: string;

  constructor(options: { root: string }) {
    this.root = options.root;
  }

  async putScreenshot(feedbackId: string, bytes: Buffer | Uint8Array): Promise<ScreenshotRecord> {
    const id = hashPngBytes(bytes);
    const dir = this.dirFor(feedbackId);
    await mkdir(dir, { recursive: true });
    const pngPath = join(dir, `${id}.png`);
    const now = new Date();
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const byteSize = buf.byteLength;

    // Write bytes first — idempotent (overwrites are byte-identical by hash).
    await writeFile(pngPath, buf);

    // Update index
    const entries = await this.readIndex(feedbackId);
    const existing = entries.find((e) => e.id === id);
    if (existing) {
      existing.createdAt = now.toISOString();
      existing.byteSize = byteSize;
    } else {
      entries.unshift({ id, byteSize, createdAt: now.toISOString() });
    }
    await writeFile(join(dir, "index.json"), `${JSON.stringify(entries, null, 2)}\n`);

    return this.toRecord(feedbackId, { id, byteSize, createdAt: now.toISOString() });
  }

  async listScreenshots(feedbackId: string): Promise<ScreenshotRecord[]> {
    const entries = await this.readIndex(feedbackId);
    return entries.map((e) => this.toRecord(feedbackId, e));
  }

  async readScreenshot(feedbackId: string, hash: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.dirFor(feedbackId), `${hash}.png`));
    } catch {
      return null;
    }
  }

  private dirFor(feedbackId: string): string {
    // Sanitize: feedbackId is a UUID-ish in practice, but guard against path traversal.
    if (feedbackId.includes("/") || feedbackId.includes("..") || feedbackId.includes("\\")) {
      throw new Error(`Invalid feedbackId: ${feedbackId}`);
    }
    return join(this.root, feedbackId);
  }

  private async readIndex(feedbackId: string): Promise<FsIndexEntry[]> {
    try {
      const raw = await readFile(join(this.dirFor(feedbackId), "index.json"), "utf8");
      const parsed = JSON.parse(raw) as FsIndexEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toRecord(feedbackId: string, e: FsIndexEntry): ScreenshotRecord {
    return {
      id: e.id,
      feedbackId,
      url: `/api/colaborate/feedbacks/${feedbackId}/screenshots/${e.id}`,
      byteSize: e.byteSize,
      createdAt: new Date(e.createdAt),
    };
  }
}
