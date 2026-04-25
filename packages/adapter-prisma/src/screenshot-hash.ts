import { createHash } from "node:crypto";

/** Hex SHA-256 of raw PNG bytes — used as the dedup key + FS filename. */
export function hashPngBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
