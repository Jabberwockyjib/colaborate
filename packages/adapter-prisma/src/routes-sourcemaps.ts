import { gunzipSync } from "node:zlib";
import type { SourcemapStore } from "@colaborate/core";
import { hashSourcemapContent } from "./sourcemap-hash.js";
import { formatValidationErrors, resolveSourceSchema, sourcemapUploadSchema } from "./validation.js";

export type SourcemapRoute = { kind: "upload" } | { kind: "resolve" };

/**
 * Route matcher. Returns the route descriptor when the pathname matches one of
 * the two sourcemap routes, otherwise null.
 */
export function matchSourcemapRoute(pathname: string, method: string): SourcemapRoute | null {
  if (method !== "POST") return null;
  if (pathname.endsWith("/api/colaborate/sourcemaps")) return { kind: "upload" };
  if (pathname.endsWith("/api/colaborate/resolve-source")) return { kind: "resolve" };
  return null;
}

/**
 * Read a request body, decompressing gzip transparently when Content-Encoding
 * indicates it. Returns the parsed JSON or `null` on any failure.
 */
async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    const encoding = request.headers.get("content-encoding")?.toLowerCase() ?? "";
    if (encoding.includes("gzip")) {
      const buf = Buffer.from(await request.arrayBuffer());
      const decompressed = gunzipSync(buf).toString("utf8");
      return JSON.parse(decompressed);
    }
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleUploadSourcemap(request: Request, store: SourcemapStore): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === null) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = sourcemapUploadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  const actual = hashSourcemapContent(parsed.data.content);
  if (actual !== parsed.data.hash) {
    return Response.json(
      { error: "hash does not match SHA-256 of content", actual, expected: parsed.data.hash },
      { status: 400 },
    );
  }

  const record = await store.putSourcemap({
    projectName: parsed.data.projectName,
    env: parsed.data.env,
    hash: parsed.data.hash,
    filename: parsed.data.filename,
    content: parsed.data.content,
  });
  return Response.json(record, { status: 201 });
}

export async function handleResolveSource(request: Request, store: SourcemapStore): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === null) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = resolveSourceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  const resolved = await store.resolveSourceLocation(parsed.data);
  if (!resolved) return Response.json({ error: "No mapping found" }, { status: 404 });
  return Response.json(resolved, { status: 200 });
}
