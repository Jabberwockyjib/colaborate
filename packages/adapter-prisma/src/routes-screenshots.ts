import { type ColaborateStore, isStoreValidation } from "@colaborate/core";
import type { FsScreenshotStore } from "./fs-screenshot-store.js";
import { formatValidationErrors, screenshotAttachSchema } from "./validation.js";

export type ScreenshotRoute =
  | { kind: "attach"; feedbackId: string }
  | { kind: "list"; feedbackId: string }
  | { kind: "read"; feedbackId: string; hash: string };

/**
 * Route matcher. Paths:
 *   POST   /api/colaborate/feedbacks/:id/screenshots               → attach
 *   GET    /api/colaborate/feedbacks/:id/screenshots               → list
 *   GET    /api/colaborate/feedbacks/:id/screenshots/:hash         → read
 */
export function matchScreenshotRoute(pathname: string, method: string): ScreenshotRoute | null {
  const anchor = "/api/colaborate/feedbacks/";
  const idx = pathname.indexOf(anchor);
  if (idx === -1) return null;
  const rest = pathname.slice(idx + anchor.length);
  const segments = rest.split("/").filter(Boolean);
  // Expect shapes: [feedbackId, "screenshots"] or [feedbackId, "screenshots", hash]
  if (segments.length < 2 || segments[1] !== "screenshots") return null;
  const feedbackId = segments[0];
  if (!feedbackId) return null;

  if (segments.length === 2) {
    if (method === "POST") return { kind: "attach", feedbackId };
    if (method === "GET") return { kind: "list", feedbackId };
    return null;
  }
  if (segments.length === 3 && segments[2]) {
    if (method === "GET") return { kind: "read", feedbackId, hash: segments[2] };
    return null;
  }
  return null;
}

export async function handleAttachScreenshot(
  request: Request,
  store: ColaborateStore,
  feedbackId: string,
): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = screenshotAttachSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  try {
    const record = await store.attachScreenshot(feedbackId, parsed.data.dataUrl);
    return Response.json(record, { status: 201 });
  } catch (error) {
    if (isStoreValidation(error)) {
      const message = error instanceof Error ? error.message : "Invalid screenshot input";
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("[colaborate] attachScreenshot failed:", error);
    return Response.json({ error: "Failed to attach screenshot" }, { status: 500 });
  }
}

export async function handleListScreenshots(store: ColaborateStore, feedbackId: string): Promise<Response> {
  const list = await store.listScreenshots(feedbackId);
  return Response.json(list, { status: 200 });
}

export async function handleReadScreenshot(
  screenshotStore: FsScreenshotStore,
  feedbackId: string,
  hash: string,
): Promise<Response> {
  const bytes = await screenshotStore.readScreenshot(feedbackId, hash);
  if (!bytes) return Response.json({ error: "Not found" }, { status: 404 });
  // Copy into a fresh ArrayBuffer-backed Uint8Array. TS 5.7+ distinguishes
  // `Uint8Array<ArrayBufferLike>` from `Uint8Array<ArrayBuffer>` for BodyInit,
  // and Buffer's backing type is ArrayBufferLike — so we rebuild over a fresh ArrayBuffer.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Response(ab, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=3600",
    },
  });
}
