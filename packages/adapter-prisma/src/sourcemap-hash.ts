import { createHash } from "node:crypto";

/**
 * Hex-encoded SHA-256 of the *decompressed* source-map body.
 *
 * Used as:
 *  - the storage key in `FsSourcemapStore` (one file per hash)
 *  - the CLI-side dedup signal (upload only if the remote doesn't already have this hash)
 *
 * Hashing happens after gzip decompression so that changing the gzip level
 * (e.g. upgrading zlib, toggling `-9`) doesn't invalidate existing uploads.
 */
export function hashSourcemapContent(content: string | Buffer): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha256").update(buf).digest("hex");
}
