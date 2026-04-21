/**
 * Sourcemap storage — separate from `ColaborateStore` because source maps
 * are deploy-pipeline artefacts, not user-facing feedback data. Only the
 * server-side Prisma/FS adapter implements this; Memory/LocalStorage
 * adapters don't need it.
 */

/** Input for storing a new source map. */
export interface SourcemapPutInput {
  projectName: string;
  env: string;
  /** Hex SHA-256 of the decompressed map content. Used as the storage key. */
  hash: string;
  /** Original filename of the map (e.g. `main.abc123.js.map`). */
  filename: string;
  /** Raw source-map JSON (decompressed). */
  content: string;
}

/** Persisted metadata about a stored source map. */
export interface SourcemapRecord {
  /** Composite id: `{projectName}:{env}:{hash}`. */
  id: string;
  projectName: string;
  env: string;
  hash: string;
  filename: string;
  uploadedAt: Date;
}

/** Input for resolving a bundled (line, column) to an original source location. */
export interface ResolveSourceInput {
  projectName: string;
  env: string;
  /** Hash identifying which map to resolve against. */
  hash: string;
  line: number;
  column: number;
}

/** Resolved original-source location. */
export interface ResolveSourceResult {
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
}

/**
 * Abstract sourcemap storage interface.
 *
 * Implementations:
 *  - `FsSourcemapStore` in `@colaborate/adapter-prisma` — filesystem-backed.
 *  - (future) S3- or object-store-backed implementations.
 *
 * No memory/localStorage implementation is planned — sourcemap storage is
 * a server-side deploy concern, not something the widget's dev adapters need.
 */
export interface SourcemapStore {
  /** Store a source map. Idempotent on `{projectName, env, hash}` — re-uploading the same hash overwrites metadata and returns the existing record. */
  putSourcemap(input: SourcemapPutInput): Promise<SourcemapRecord>;
  /** Load a stored map by composite id. Returns `null` when not found — never throws. */
  getSourcemap(id: string): Promise<{ record: SourcemapRecord; content: string } | null>;
  /** List all stored maps for a project/env combination, newest first. Returns empty array when none exist. */
  listSourcemaps(projectName: string, env: string): Promise<SourcemapRecord[]>;
  /** Resolve a bundled (line, column) against a specific map. Returns `null` when the map is missing or the position has no mapping. */
  resolveSourceLocation(input: ResolveSourceInput): Promise<ResolveSourceResult | null>;
}
