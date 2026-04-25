import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ResolveSourceInput,
  ResolveSourceResult,
  SourcemapPutInput,
  SourcemapRecord,
  SourcemapStore,
} from "@colaborate/core";
import { resolveSource } from "./sourcemap-resolver.js";

interface IndexEntry {
  hash: string;
  filename: string;
  uploadedAt: string; // ISO
}

export interface FsSourcemapStoreOptions {
  /** Root directory under which sourcemaps are stored. Must exist or be creatable. */
  root: string;
}

/**
 * Filesystem-backed `SourcemapStore`.
 *
 * Layout:
 *   {root}/
 *     {projectName}/
 *       {env}/
 *         index.json    ← array of IndexEntry, newest last on disk
 *         {hash}.map    ← one file per map
 *
 * Design notes:
 *  - No locking. Concurrent `putSourcemap` calls against the same
 *    `{project,env}` could race on `index.json` rewrites. Acceptable for a
 *    CLI-driven deploy-pipeline tool at v0 scale; revisit if multiple
 *    concurrent deploys become a thing.
 *  - Re-uploading the same hash overwrites the map file AND refreshes the
 *    index entry (filename + uploadedAt). No duplicate rows.
 *  - Reading preserves insertion order; `listSourcemaps` reverses it for
 *    newest-first presentation.
 */
export class FsSourcemapStore implements SourcemapStore {
  private readonly root: string;

  constructor(options: FsSourcemapStoreOptions) {
    this.root = options.root;
  }

  private dirFor(projectName: string, env: string): string {
    return join(this.root, projectName, env);
  }

  private indexPathFor(projectName: string, env: string): string {
    return join(this.dirFor(projectName, env), "index.json");
  }

  private mapPathFor(projectName: string, env: string, hash: string): string {
    return join(this.dirFor(projectName, env), `${hash}.map`);
  }

  private async readIndex(projectName: string, env: string): Promise<IndexEntry[]> {
    try {
      const raw = await readFile(this.indexPathFor(projectName, env), "utf8");
      const parsed = JSON.parse(raw) as IndexEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async writeIndex(projectName: string, env: string, entries: IndexEntry[]): Promise<void> {
    const path = this.indexPathFor(projectName, env);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), "utf8");
  }

  async putSourcemap(input: SourcemapPutInput): Promise<SourcemapRecord> {
    const { projectName, env, hash, filename, content } = input;
    await mkdir(this.dirFor(projectName, env), { recursive: true });
    await writeFile(this.mapPathFor(projectName, env, hash), content, "utf8");

    const entries = await this.readIndex(projectName, env);
    const filtered = entries.filter((e) => e.hash !== hash);
    const uploadedAt = new Date();
    filtered.push({ hash, filename, uploadedAt: uploadedAt.toISOString() });
    await this.writeIndex(projectName, env, filtered);

    return {
      id: `${projectName}:${env}:${hash}`,
      projectName,
      env,
      hash,
      filename,
      uploadedAt,
    };
  }

  async getSourcemap(id: string): Promise<{ record: SourcemapRecord; content: string } | null> {
    const parts = id.split(":");
    if (parts.length !== 3) return null;
    const [projectName, env, hash] = parts as [string, string, string];
    const entries = await this.readIndex(projectName, env);
    const entry = entries.find((e) => e.hash === hash);
    if (!entry) return null;
    let content: string;
    try {
      content = await readFile(this.mapPathFor(projectName, env, hash), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return {
      record: {
        id,
        projectName,
        env,
        hash: entry.hash,
        filename: entry.filename,
        uploadedAt: new Date(entry.uploadedAt),
      },
      content,
    };
  }

  async listSourcemaps(projectName: string, env: string): Promise<SourcemapRecord[]> {
    const entries = await this.readIndex(projectName, env);
    return entries
      .map(
        (e): SourcemapRecord => ({
          id: `${projectName}:${env}:${e.hash}`,
          projectName,
          env,
          hash: e.hash,
          filename: e.filename,
          uploadedAt: new Date(e.uploadedAt),
        }),
      )
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async resolveSourceLocation(input: ResolveSourceInput): Promise<ResolveSourceResult | null> {
    const got = await this.getSourcemap(`${input.projectName}:${input.env}:${input.hash}`);
    if (!got) return null;
    const resolved = resolveSource(got.content, input.line, input.column);
    if (!resolved) return null;
    return {
      sourceFile: resolved.source,
      sourceLine: resolved.line,
      sourceColumn: resolved.column,
    };
  }
}
