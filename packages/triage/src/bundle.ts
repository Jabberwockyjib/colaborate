import type {
  AnnotationRecord,
  ColaborateStore,
  FeedbackRecord,
  Geometry,
  ScreenshotRecord,
  SessionBundle,
  SessionRecord,
} from "@colaborate/core";

const TEXTBOX_MAX_TEXT = 80;

/**
 * Convert a serialized `Geometry` JSON string into a short English phrase
 * suitable for an LLM prompt. Far cheaper than serializing raw fractions and
 * far easier for the model to reason about.
 *
 * Returns `"unknown geometry"` on any parse failure (fail-soft — geometry hint
 * is decoration, not load-bearing data).
 */
export function geometryHint(geometryJson: string): string {
  let g: Geometry;
  try {
    g = JSON.parse(geometryJson) as Geometry;
  } catch {
    return "unknown geometry";
  }
  switch (g.shape) {
    case "rectangle":
      return `rectangle covering ${pct(g.w)} × ${pct(g.h)} of the anchor`;
    case "circle":
      return `circle (rx=${pct(g.rx)}, ry=${pct(g.ry)})`;
    case "arrow":
      return `arrow from (${pct(g.x1)}, ${pct(g.y1)}) to (${pct(g.x2)}, ${pct(g.y2)})`;
    case "line":
      return `line from (${pct(g.x1)}, ${pct(g.y1)}) to (${pct(g.x2)}, ${pct(g.y2)})`;
    case "textbox": {
      const text = g.text.length > TEXTBOX_MAX_TEXT ? `${g.text.slice(0, TEXTBOX_MAX_TEXT)}…` : g.text;
      return `textbox: "${text}"`;
    }
    case "freehand":
      return `freehand stroke (${g.points.length} points)`;
    default:
      return "unknown geometry";
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** What the LLM sees per feedback in the prompt body. */
export interface BundleFeedbackInput {
  id: string;
  message: string;
  authorName: string;
  componentId: string | null | undefined;
  sourceFile: string | null | undefined;
  sourceLine: number | null | undefined;
  url: string;
  viewport: string;
  annotations: Array<{ shape: string; geometry: string }>;
  screenshots: string[]; // urls
}

/**
 * Load a session and all its associated data (feedbacks, screenshots) from a `ColaborateStore`.
 *
 * Throws `Error` if the session does not exist (wrapper around `getSession` returning null).
 * Screenshots are returned as a map keyed by feedbackId — feedbacks with no screenshots
 * map to an empty array (never undefined).
 */
export async function loadSessionBundle(store: ColaborateStore, sessionId: string): Promise<SessionBundle> {
  const session: SessionRecord | null = await store.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const all = await store.getFeedbacks({ projectName: session.projectName });
  const feedbacks = all.feedbacks.filter((f: FeedbackRecord) => f.sessionId === sessionId);
  const screenshotsByFeedbackId: Record<string, ScreenshotRecord[]> = {};
  for (const fb of feedbacks) {
    screenshotsByFeedbackId[fb.id] = await store.listScreenshots(fb.id);
  }
  return { session, feedbacks, screenshotsByFeedbackId };
}

/**
 * Serialize a session bundle into the deterministic-JSON user message that the
 * triage LLM will see. Drops null/undefined fields for prompt cleanliness.
 *
 * Accepts a pre-projected shape with `BundleFeedbackInput[]` (the worker uses
 * `projectFeedback` to convert FeedbackRecords first).
 */
export function serializeBundle(input: { session: SessionRecord; feedbacks: BundleFeedbackInput[] }): string {
  const out = {
    session: {
      id: input.session.id,
      projectName: input.session.projectName,
      createdAt: input.session.createdAt.toISOString(),
      ...(input.session.reviewerName ? { reviewerName: input.session.reviewerName } : {}),
      ...(input.session.notes ? { notes: input.session.notes } : {}),
    },
    feedbacks: input.feedbacks.map((f) => {
      const firstAnn = f.annotations[0];
      return {
        id: f.id,
        message: f.message,
        authorName: f.authorName,
        ...(f.componentId ? { componentId: f.componentId } : {}),
        ...(f.sourceFile ? { sourceFile: f.sourceFile } : {}),
        ...(f.sourceLine != null ? { sourceLine: f.sourceLine } : {}),
        url: f.url,
        viewport: f.viewport,
        ...(firstAnn ? { shape: firstAnn.shape, geometryHint: geometryHint(firstAnn.geometry) } : {}),
        ...(f.screenshots.length ? { screenshots: f.screenshots } : {}),
      };
    }),
  };
  return JSON.stringify(out, null, 2);
}

/** Project a `FeedbackRecord` (+ its screenshots) into the LLM-facing shape. */
export function projectFeedback(fb: FeedbackRecord, screenshots: ScreenshotRecord[]): BundleFeedbackInput {
  return {
    id: fb.id,
    message: fb.message,
    authorName: fb.authorName,
    componentId: fb.componentId,
    sourceFile: fb.sourceFile,
    sourceLine: fb.sourceLine,
    url: fb.url,
    viewport: fb.viewport,
    annotations: fb.annotations.map((a: AnnotationRecord) => ({ shape: a.shape, geometry: a.geometry })),
    screenshots: screenshots.map((s) => s.url),
  };
}
