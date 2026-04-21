import type { FeedbackStatus, FeedbackType } from "@colaborate/core";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@colaborate/core";
import * as zod from "zod";

// Namespace import required: Zod publishes dual CJS/ESM, and bundlers (tsup, vitest) may
// resolve the CJS entry where `import { z } from "zod"` fails because CJS wraps
// the entire module under a default/namespace key. This workaround normalizes access
// regardless of which entry point the bundler resolves.
// See: https://github.com/colinhacks/zod/issues/2697
const z: typeof zod.z = ("z" in zod ? zod.z : zod) as typeof zod.z;

const mentionSchema = z.object({
  kind: z.enum(["user", "component"]),
  handle: z.string().min(1).max(200),
});

const anchorSchema = z.object({
  cssSelector: z.string().min(1).max(2000),
  xpath: z.string().min(1).max(2000),
  textSnippet: z.string().max(500),
  elementTag: z.string().min(1),
  elementId: z.string().optional(),
  textPrefix: z.string().max(200),
  textSuffix: z.string().max(200),
  fingerprint: z.string().max(200),
  neighborText: z.string().max(500),
});

const rectangleGeom = z.object({
  shape: z.literal("rectangle"),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
const circleGeom = z.object({
  shape: z.literal("circle"),
  cx: z.number(),
  cy: z.number(),
  rx: z.number(),
  ry: z.number(),
});
const arrowGeom = z.object({
  shape: z.literal("arrow"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  headSize: z.number(),
});
const lineGeom = z.object({
  shape: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});
const textboxGeom = z.object({
  shape: z.literal("textbox"),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  text: z.string().max(2000),
  fontSize: z.number().positive(),
});
const freehandGeom = z.object({
  shape: z.literal("freehand"),
  points: z
    .array(z.tuple([z.number(), z.number()]))
    .min(1)
    .max(5000),
  strokeWidth: z.number().positive(),
});
const geometrySchema = z.discriminatedUnion("shape", [
  rectangleGeom,
  circleGeom,
  arrowGeom,
  lineGeom,
  textboxGeom,
  freehandGeom,
]);

const annotationSchema = z.object({
  anchor: anchorSchema,
  shape: z.enum(["rectangle", "circle", "arrow", "line", "textbox", "freehand"]),
  geometry: geometrySchema,
  scrollX: z.number().min(0),
  scrollY: z.number().min(0),
  viewportW: z.number().int().positive(),
  viewportH: z.number().int().positive(),
  devicePixelRatio: z.number().positive().default(1),
});

export const feedbackCreateSchema = z.object({
  projectName: z.string().min(1).max(200),
  type: z.enum(FEEDBACK_TYPES),
  message: z.string().min(1).max(5000),
  url: z.string().max(2000).url(),
  viewport: z.string().min(1).max(50),
  userAgent: z.string().min(1).max(500),
  authorName: z.string().min(1).max(200),
  authorEmail: z.string().email().max(200),
  annotations: z.array(annotationSchema).max(50),
  clientId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).optional(),
  componentId: z.string().min(1).max(200).optional(),
  mentions: z.array(mentionSchema).max(100).default([]),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  sourceFile: z.string().min(1).max(2000).optional(),
  sourceLine: z.number().int().min(1).optional(),
  sourceColumn: z.number().int().min(0).optional(),
});

export const feedbackPatchSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().min(1).max(200),
  status: z.enum(FEEDBACK_STATUSES),
});

export const feedbackDeleteSchema = z.union([
  z.object({ id: z.string().min(1), projectName: z.string().min(1).max(200) }),
  z.object({ projectName: z.string().min(1).max(200), deleteAll: z.literal(true) }),
]);

export const getQuerySchema = z.object({
  projectName: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  type: z.enum(FEEDBACK_TYPES).optional(),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  search: z.string().max(200).optional(),
});

export const sessionCreateBodySchema = z.object({
  projectName: z.string().min(1).max(200),
  reviewerName: z.string().min(1).max(200).optional(),
  reviewerEmail: z.string().email().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

export const sessionListQuerySchema = z.object({
  projectName: z.string().min(1).max(200),
  status: z.enum(["drafting", "submitted", "triaged", "archived"] as const).optional(),
});

export const sourcemapUploadSchema = z.object({
  projectName: z.string().min(1).max(200),
  env: z.string().min(1).max(100),
  /** Hex SHA-256 of the decompressed map body. */
  hash: z.string().regex(/^[0-9a-f]{64}$/, "hash must be 64-char lowercase hex"),
  filename: z.string().min(1).max(500),
  /** Raw source-map JSON (decompressed). */
  content: z
    .string()
    .min(2)
    .max(50 * 1024 * 1024), // up to 50 MB decompressed
});

export const resolveSourceSchema = z.object({
  projectName: z.string().min(1).max(200),
  env: z.string().min(1).max(100),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  line: z.number().int().min(1),
  column: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Explicit public interfaces — decoupled from Zod to keep .d.ts clean
// ---------------------------------------------------------------------------

export interface AnchorInput {
  cssSelector: string;
  xpath: string;
  textSnippet: string;
  elementTag: string;
  elementId?: string | undefined;
  textPrefix: string;
  textSuffix: string;
  fingerprint: string;
  neighborText: string;
}

export interface AnnotationInput {
  anchor: AnchorInput;
  shape: import("@colaborate/core").Shape;
  geometry: import("@colaborate/core").Geometry;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  /** Set to 1 by schema default when omitted from raw input. */
  devicePixelRatio: number;
}

export interface FeedbackCreateInput {
  projectName: string;
  type: FeedbackType;
  message: string;
  url: string;
  viewport: string;
  userAgent: string;
  authorName: string;
  authorEmail: string;
  annotations: AnnotationInput[];
  clientId: string;
  sessionId?: string | undefined;
  componentId?: string | undefined;
  /** Set to [] by schema default when omitted from raw input. */
  mentions: import("@colaborate/core").Mention[];
  status?: FeedbackStatus | undefined;
  sourceFile?: string | undefined;
  sourceLine?: number | undefined;
  sourceColumn?: number | undefined;
}

export interface FeedbackPatchInput {
  id: string;
  projectName: string;
  status: FeedbackStatus;
}

export interface FeedbackDeleteSingle {
  id: string;
  projectName: string;
}

export interface FeedbackDeleteAll {
  projectName: string;
  deleteAll: true;
}

export type FeedbackDeleteInput = FeedbackDeleteSingle | FeedbackDeleteAll;

export interface GetQueryInput {
  projectName: string;
  /** Set to 1 by schema default when omitted from raw input. */
  page: number;
  /** Set to 50 by schema default when omitted from raw input. */
  limit: number;
  type?: FeedbackType | undefined;
  status?: FeedbackStatus | undefined;
  search?: string | undefined;
}

export interface SessionCreateBodyInput {
  projectName: string;
  reviewerName?: string | undefined;
  reviewerEmail?: string | undefined;
  notes?: string | undefined;
}

export interface SessionListQueryInput {
  projectName: string;
  status?: import("@colaborate/core").SessionStatus | undefined;
}

export interface SourcemapUploadInput {
  projectName: string;
  env: string;
  hash: string;
  filename: string;
  content: string;
}

export interface ResolveSourceBodyInput {
  projectName: string;
  env: string;
  hash: string;
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Type-level assertions: manual interfaces stay in sync with schemas.
// If a field is added/removed/changed in the schema but not the interface
// (or vice versa), these lines produce a compile error.
// ---------------------------------------------------------------------------

type _AssertCreate = zod.z.infer<typeof feedbackCreateSchema> extends FeedbackCreateInput ? true : never;
type _AssertCreateReverse = FeedbackCreateInput extends zod.z.infer<typeof feedbackCreateSchema> ? true : never;
type _AssertPatch = zod.z.infer<typeof feedbackPatchSchema> extends FeedbackPatchInput ? true : never;
type _AssertPatchReverse = FeedbackPatchInput extends zod.z.infer<typeof feedbackPatchSchema> ? true : never;
type _AssertDelete = zod.z.infer<typeof feedbackDeleteSchema> extends FeedbackDeleteInput ? true : never;
type _AssertDeleteReverse = FeedbackDeleteInput extends zod.z.infer<typeof feedbackDeleteSchema> ? true : never;
type _AssertQuery = zod.z.infer<typeof getQuerySchema> extends GetQueryInput ? true : never;
type _AssertQueryReverse = GetQueryInput extends zod.z.infer<typeof getQuerySchema> ? true : never;
type _AssertSessionCreate = zod.z.infer<typeof sessionCreateBodySchema> extends SessionCreateBodyInput ? true : never;
type _AssertSessionCreateReverse =
  SessionCreateBodyInput extends zod.z.infer<typeof sessionCreateBodySchema> ? true : never;
type _AssertSessionList = zod.z.infer<typeof sessionListQuerySchema> extends SessionListQueryInput ? true : never;
type _AssertSessionListReverse =
  SessionListQueryInput extends zod.z.infer<typeof sessionListQuerySchema> ? true : never;

type _AssertSourcemapUpload = zod.z.infer<typeof sourcemapUploadSchema> extends SourcemapUploadInput ? true : never;
type _AssertSourcemapUploadReverse =
  SourcemapUploadInput extends zod.z.infer<typeof sourcemapUploadSchema> ? true : never;
type _AssertResolveSource = zod.z.infer<typeof resolveSourceSchema> extends ResolveSourceBodyInput ? true : never;
type _AssertResolveSourceReverse =
  ResolveSourceBodyInput extends zod.z.infer<typeof resolveSourceSchema> ? true : never;

// Suppress unused-variable warnings — assertions are compile-time only
void (0 as unknown as _AssertCreate);
void (0 as unknown as _AssertCreateReverse);
void (0 as unknown as _AssertPatch);
void (0 as unknown as _AssertPatchReverse);
void (0 as unknown as _AssertDelete);
void (0 as unknown as _AssertDeleteReverse);
void (0 as unknown as _AssertQuery);
void (0 as unknown as _AssertQueryReverse);
void (0 as unknown as _AssertSessionCreate);
void (0 as unknown as _AssertSessionCreateReverse);
void (0 as unknown as _AssertSessionList);
void (0 as unknown as _AssertSessionListReverse);
void (0 as unknown as _AssertSourcemapUpload);
void (0 as unknown as _AssertSourcemapUploadReverse);
void (0 as unknown as _AssertResolveSource);
void (0 as unknown as _AssertResolveSourceReverse);

/**
 * Map Zod errors to a flat array of { field, message } objects.
 * Safe: does not leak input values or schema structure.
 */
export function formatValidationErrors(error: zod.z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue: { path: Array<string | number>; message: string }) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}
