import { type Geometry, type Shape, serializeGeometry } from "./geometry.js";
import type { Mention } from "./mentions.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Configuration options for the Colaborate widget. */
export interface ColaborateConfig {
  /** HTTP endpoint that receives feedbacks (e.g. '/api/colaborate'). Required unless `store` is provided. */
  endpoint?: string | undefined;
  /** Required — project identifier used to scope feedbacks */
  projectName: string;
  /** Direct store for client-side mode. When set, bypasses HTTP and uses the store directly in the browser. */
  store?: ColaborateStore | undefined;
  /** FAB position — defaults to 'bottom-right' */
  position?: "bottom-right" | "bottom-left";
  /** Accent color for the widget UI — defaults to '#0066ff' */
  accentColor?: string;
  /** Show the widget even in production — defaults to false */
  forceShow?: boolean;
  /** Enable debug logging of lifecycle events — defaults to false */
  debug?: boolean;
  /** Color theme — defaults to 'light' */
  theme?: "light" | "dark" | "auto";
  /** UI locale — defaults to 'en' */
  locale?: "fr" | "en" | (string & {}) | undefined;
  /** Called when the widget is skipped (production mode, mobile viewport) */
  onSkip?: (reason: "production" | "mobile") => void;

  // Events
  /** Called when the feedback panel is opened. */
  onOpen?: () => void;
  /** Called when the feedback panel is closed. */
  onClose?: () => void;
  onFeedbackSent?: (feedback: FeedbackResponse) => void;
  onError?: (error: Error) => void;
  /** Called when the user starts drawing an annotation. */
  onAnnotationStart?: () => void;
  /** Called when the user finishes drawing an annotation. */
  onAnnotationEnd?: () => void;
}

/** Instance returned by initColaborate() with lifecycle methods. */
export interface ColaborateInstance {
  /** Remove the widget from the DOM and clean up all listeners. */
  destroy: () => void;
  /** Open the panel programmatically */
  open: () => void;
  /** Close the panel */
  close: () => void;
  /** Reload feedbacks from server */
  refresh: () => void;
  /** Subscribe to a public widget event */
  on: <K extends keyof ColaboratePublicEvents>(
    event: K,
    listener: (...args: ColaboratePublicEvents[K]) => void,
  ) => () => void;
  /** Unsubscribe from a public widget event */
  off: <K extends keyof ColaboratePublicEvents>(
    event: K,
    listener: (...args: ColaboratePublicEvents[K]) => void,
  ) => void;
}

/** Events exposed to consumers via ColaborateInstance.on / .off */
export interface ColaboratePublicEvents {
  "feedback:sent": [FeedbackResponse];
  "feedback:deleted": [string];
  "panel:open": [];
  "panel:close": [];
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Single source of truth for feedback types — used by both TS types and Zod schemas. */
export const FEEDBACK_TYPES = ["question", "change", "bug", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** Feedback lifecycle. `draft` is the client-side pre-session state; `triaged` is set by the triage worker. */
export const FEEDBACK_STATUSES = ["draft", "open", "triaged", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Review session lifecycle. `drafting` is the widget's local session; `submitted` is posted to the server; `triaged` means the triage worker has processed it; `archived` is a soft delete. */
export const SESSION_STATUSES = ["drafting", "submitted", "triaged", "archived"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Input for creating a session — status defaults to `drafting`. */
export interface SessionCreateInput {
  projectName: string;
  reviewerName?: string | undefined;
  reviewerEmail?: string | undefined;
  notes?: string | undefined;
}

/** Persisted session record returned by the store. */
export interface SessionRecord {
  id: string;
  projectName: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: SessionStatus;
  submittedAt: Date | null;
  triagedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Abstract Store — adapter pattern
// ---------------------------------------------------------------------------

/** Input for creating a feedback record in the store. */
export interface FeedbackCreateInput {
  projectName: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  url: string;
  viewport: string;
  userAgent: string;
  authorName: string;
  authorEmail: string;
  clientId: string;
  /** Optional session this feedback belongs to. */
  sessionId?: string | null | undefined;
  /** Opt-in data-colaborate-id of the annotated component. */
  componentId?: string | null | undefined;
  /** Source file resolved via sourcemap upload (Phase 4). */
  sourceFile?: string | null | undefined;
  sourceLine?: number | null | undefined;
  sourceColumn?: number | null | undefined;
  /** Serialized `Mention[]` JSON — see `packages/core/src/mentions.ts`. Defaults to `"[]"` in the store when omitted. */
  mentions?: string | undefined;
  /** Tracker integration set by the triage worker (Phase 5). */
  externalProvider?: string | null | undefined;
  externalIssueId?: string | null | undefined;
  externalIssueUrl?: string | null | undefined;
  annotations: AnnotationCreateInput[];
}

/** Input for a single annotation when creating a feedback. */
export interface AnnotationCreateInput {
  cssSelector: string;
  xpath: string;
  textSnippet: string;
  elementTag: string;
  elementId?: string | undefined;
  textPrefix: string;
  textSuffix: string;
  fingerprint: string;
  neighborText: string;
  /** One of `SHAPES`. Stored as a column for cheap filtering; source of truth is `geometry.shape`. */
  shape: string;
  /** Serialized `Geometry` JSON — see `packages/core/src/geometry.ts`. */
  geometry: string;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  devicePixelRatio: number;
}

/** Query parameters for fetching feedbacks. */
export interface FeedbackQuery {
  projectName: string;
  type?: FeedbackType | undefined;
  status?: FeedbackStatus | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

/** Update payload for patching a feedback. */
export interface FeedbackUpdateInput {
  status: FeedbackStatus;
  resolvedAt: Date | null;
}

/** A persisted feedback record returned by the store. */
export interface FeedbackRecord {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  projectName: string;
  url: string;
  authorName: string;
  authorEmail: string;
  viewport: string;
  userAgent: string;
  clientId: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sessionId: string | null;
  componentId: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  sourceColumn: number | null;
  /** Serialized `Mention[]` JSON. */
  mentions: string;
  externalProvider: string | null;
  externalIssueId: string | null;
  externalIssueUrl: string | null;
  annotations: AnnotationRecord[];
}

/** A persisted annotation record returned by the store. */
export interface AnnotationRecord {
  id: string;
  feedbackId: string;
  cssSelector: string;
  xpath: string;
  textSnippet: string;
  elementTag: string;
  elementId: string | null;
  textPrefix: string;
  textSuffix: string;
  fingerprint: string;
  neighborText: string;
  /** One of `SHAPES`. */
  shape: string;
  /** Serialized `Geometry` JSON. */
  geometry: string;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  devicePixelRatio: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Store errors — throw these from adapter implementations
// ---------------------------------------------------------------------------

/**
 * Thrown when a record is not found during update or delete.
 *
 * Handlers translate this to HTTP 404. Adapters MUST throw this (not
 * ORM-specific errors) so the handler layer remains ORM-agnostic.
 */
export class StoreNotFoundError extends Error {
  readonly code = "STORE_NOT_FOUND" as const;
  constructor(message = "Record not found") {
    super(message);
    this.name = "StoreNotFoundError";
  }
}

/**
 * Thrown when a unique constraint is violated (e.g. duplicate `clientId`).
 *
 * Handlers use this to return the existing record instead of failing.
 */
export class StoreDuplicateError extends Error {
  readonly code = "STORE_DUPLICATE" as const;
  constructor(message = "Duplicate record") {
    super(message);
    this.name = "StoreDuplicateError";
  }
}

/** Type guard — works for `StoreNotFoundError` and ORM-specific equivalents (e.g. Prisma P2025). */
export function isStoreNotFound(error: unknown): boolean {
  if (error instanceof StoreNotFoundError) return true;
  // Backwards compat: Prisma's P2025
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025";
}

/** Type guard — works for `StoreDuplicateError` and ORM-specific equivalents (e.g. Prisma P2002). */
export function isStoreDuplicate(error: unknown): boolean {
  if (error instanceof StoreDuplicateError) return true;
  // Backwards compat: Prisma's P2002
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

// ---------------------------------------------------------------------------
// Store helpers — shared conversion logic for adapters
// ---------------------------------------------------------------------------

/** Flatten a widget `AnnotationPayload` (nested anchor + geometry object) into a flat `AnnotationCreateInput` with geometry JSON-serialized. */
export function flattenAnnotation(ann: AnnotationPayload): AnnotationCreateInput {
  return {
    cssSelector: ann.anchor.cssSelector,
    xpath: ann.anchor.xpath,
    textSnippet: ann.anchor.textSnippet,
    elementTag: ann.anchor.elementTag,
    elementId: ann.anchor.elementId,
    textPrefix: ann.anchor.textPrefix,
    textSuffix: ann.anchor.textSuffix,
    fingerprint: ann.anchor.fingerprint,
    neighborText: ann.anchor.neighborText,
    shape: ann.shape,
    geometry: serializeGeometry(ann.geometry),
    scrollX: ann.scrollX,
    scrollY: ann.scrollY,
    viewportW: ann.viewportW,
    viewportH: ann.viewportH,
    devicePixelRatio: ann.devicePixelRatio,
  };
}

// ---------------------------------------------------------------------------
// Abstract Store — adapter pattern
// ---------------------------------------------------------------------------

/**
 * Abstract storage interface for Colaborate.
 *
 * Any adapter (Prisma, Drizzle, raw SQL, localStorage, etc.) implements this
 * interface. The HTTP handler and widget `StoreClient` operate against
 * `ColaborateStore`, decoupled from the storage backend.
 *
 * ## Error contract
 *
 * - **`updateFeedback` / `deleteFeedback`**: throw `StoreNotFoundError` when
 *   the record does not exist.
 * - **`createFeedback`**: either return the existing record on duplicate
 *   `clientId` (idempotent) or throw `StoreDuplicateError`. The handler
 *   handles both patterns.
 * - Other methods should not throw on empty results — return empty arrays or `null`.
 */
export interface ColaborateStore {
  /** Create a feedback with its annotations. Idempotent on `clientId` — return existing record on duplicate, or throw `StoreDuplicateError`. */
  createFeedback(data: FeedbackCreateInput): Promise<FeedbackRecord>;
  /** Paginated query with optional filters. Returns empty array (not error) when no results. */
  getFeedbacks(query: FeedbackQuery): Promise<{ feedbacks: FeedbackRecord[]; total: number }>;
  /** Lookup by client-generated UUID. Returns `null` (not error) when not found. */
  findByClientId(clientId: string): Promise<FeedbackRecord | null>;
  /** Update status/resolvedAt. Throws `StoreNotFoundError` if `id` does not exist. */
  updateFeedback(id: string, data: FeedbackUpdateInput): Promise<FeedbackRecord>;
  /** Delete a single record. Throws `StoreNotFoundError` if `id` does not exist. */
  deleteFeedback(id: string): Promise<void>;
  /** Bulk delete all feedbacks for a project. No-op (not error) if none exist. */
  deleteAllFeedbacks(projectName: string): Promise<void>;
  /** Create a new session. Returns the persisted record with status=`drafting`. */
  createSession(data: SessionCreateInput): Promise<SessionRecord>;
  /** Lookup a session by id. Returns `null` (not error) when not found. */
  getSession(id: string): Promise<SessionRecord | null>;
  /** List sessions for a project, newest first. Optional status filter. Returns empty array (not error) when none. */
  listSessions(projectName: string, status?: SessionStatus): Promise<SessionRecord[]>;
  /** Flip status to `submitted` and stamp `submittedAt`. Throws `StoreNotFoundError` if `id` does not exist. */
  submitSession(id: string): Promise<SessionRecord>;
}

/** Payload sent from the widget to the server when submitting feedback. */
export interface FeedbackPayload {
  projectName: string;
  type: FeedbackType;
  message: string;
  url: string;
  viewport: string;
  userAgent: string;
  authorName: string;
  authorEmail: string;
  annotations: AnnotationPayload[];
  /** Optional — session the widget is drafting in. */
  sessionId?: string | undefined;
  /** Optional — opt-in component tag. */
  componentId?: string | undefined;
  /** Optional — @ mentions on this feedback. Defaults to empty on server when omitted. */
  mentions?: Mention[] | undefined;
  /** Optional — defaults to "open" server-side. Widget sets "draft" when session mode is active. */
  status?: FeedbackStatus | undefined;
  /** Client-generated UUID for deduplication */
  clientId: string;
}

// ---------------------------------------------------------------------------
// Annotation — multi-selector anchoring (Hypothesis / W3C Web Annotation)
// ---------------------------------------------------------------------------

/** DOM anchoring data for re-attaching annotations to page elements. */
export interface AnchorData {
  /** CSS selector generated by @medv/finder — primary anchor */
  cssSelector: string;
  /** XPath — fallback 1 */
  xpath: string;
  /** First ~120 chars of element innerText — empty string if none */
  textSnippet: string;
  /** Tag name for validation (e.g. "DIV", "SECTION") */
  elementTag: string;
  /** Element id attribute if available — most stable */
  elementId?: string | undefined;
  /** ~32 chars of text before this element in document flow (disambiguation) */
  textPrefix: string;
  /** ~32 chars of text after this element in document flow (disambiguation) */
  textSuffix: string;
  /** Structural fingerprint: "childCount:siblingIdx:attrHash" */
  fingerprint: string;
  /** Text content of adjacent sibling elements (context) */
  neighborText: string;
}

/** Annotation data sent as part of a feedback submission. */
export interface AnnotationPayload {
  anchor: AnchorData;
  /** Discriminator for the geometry — one of `SHAPES`. */
  shape: Shape;
  /** Geometry object (typed union on `shape`). Server serializes to JSON string for storage. */
  geometry: Geometry;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  devicePixelRatio: number;
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

/** Feedback record as returned by the API (dates serialized as strings). */
export interface FeedbackResponse {
  id: string;
  projectName: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  url: string;
  viewport: string;
  userAgent: string;
  authorName: string;
  authorEmail: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sessionId: string | null;
  componentId: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  sourceColumn: number | null;
  /** Serialized `Mention[]` JSON. */
  mentions: string;
  externalProvider: string | null;
  externalIssueId: string | null;
  externalIssueUrl: string | null;
  annotations: AnnotationResponse[];
}

/** Annotation record as returned by the API. */
export interface AnnotationResponse {
  id: string;
  feedbackId: string;
  cssSelector: string;
  xpath: string;
  textSnippet: string;
  elementTag: string;
  elementId: string | null;
  textPrefix: string;
  textSuffix: string;
  fingerprint: string;
  neighborText: string;
  /** One of `SHAPES`. */
  shape: string;
  /** Serialized `Geometry` JSON. */
  geometry: string;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  devicePixelRatio: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Deprecated aliases (kept for one transition release after the SitePing → Colaborate rename)
// ---------------------------------------------------------------------------

/** @deprecated Use `ColaborateConfig`. */
export type SitepingConfig = ColaborateConfig;
/** @deprecated Use `ColaborateInstance`. */
export type SitepingInstance = ColaborateInstance;
/** @deprecated Use `ColaborateStore`. */
export type SitepingStore = ColaborateStore;
/** @deprecated Use `ColaboratePublicEvents`. */
export type SitepingPublicEvents = ColaboratePublicEvents;
