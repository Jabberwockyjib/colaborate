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
  /**
   * When `true`, the widget captures a viewport screenshot via html2canvas and attaches it
   * to each submitted feedback. Adds ~50 KB to the widget bundle (html2canvas is
   * lazy-imported on first use). Defaults to `false`.
   */
  captureScreenshots?: boolean;
  /** Optional API key for widget-authenticated routes (screenshots). Sent as `Authorization: Bearer`. */
  apiKey?: string;

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

/** Review session lifecycle. `drafting` is the widget's local session; `submitted` is posted to the server; `triaged` means the triage worker has processed it; `failed` means the triage worker errored and the session needs manual retry; `archived` is a soft delete. */
export const SESSION_STATUSES = ["drafting", "submitted", "triaged", "failed", "archived"] as const;
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
  /** Populated by the triage worker on `markSessionFailed`. Cleared on `markSessionTriaged`. */
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Session record as returned by the API (dates serialized as strings). */
export interface SessionResponse {
  id: string;
  projectName: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: SessionStatus;
  submittedAt: string | null;
  triagedAt: string | null;
  notes: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Tracker integration — Phase 5 (triage worker → external issue trackers)
// ---------------------------------------------------------------------------

/** Input for creating a tracker issue. */
export interface IssueInput {
  title: string;
  body: string;
  labels?: string[] | undefined;
}

/** Returned reference for a created tracker issue. */
export interface IssueRef {
  provider: "github" | "linear";
  /** Provider-specific id. For GitHub: the issue number as a string. */
  issueId: string;
  /** Canonical, browser-friendly URL. */
  issueUrl: string;
}

/** Patch payload for updating an existing tracker issue. All fields optional. */
export interface IssuePatch {
  state?: "open" | "closed" | undefined;
  body?: string | undefined;
  labels?: string[] | undefined;
}

/**
 * Abstract tracker adapter. Implementations live in `@colaborate/integration-github`
 * (Phase 5) and `@colaborate/integration-linear` (Phase 6+). The triage worker
 * depends on this interface, not on any specific implementation.
 */
export interface TrackerAdapter {
  readonly name: "github" | "linear";
  createIssue(input: IssueInput): Promise<IssueRef>;
  updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void>;
  /**
   * Phase 5 placeholder — used in Phase 6+ for tracker → feedback resolution sync.
   * v0 implementations return `{ resolved: false }`.
   */
  linkResolve(ref: IssueRef): Promise<{ resolved: boolean }>;
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

/**
 * Thrown when the store rejects an input as invalid (e.g. malformed PNG dataUrl that
 * passes a Zod regex but fails downstream decode).
 *
 * Handlers translate this to HTTP 400 — it indicates a client error, not a server
 * fault. Adapters MUST throw this (not raw decode errors) so the handler layer can
 * distinguish bad input from infrastructure failures.
 */
export class StoreValidationError extends Error {
  readonly code = "STORE_VALIDATION" as const;
  constructor(message = "Invalid input") {
    super(message);
    this.name = "StoreValidationError";
  }
}

/** Type guard — works for `StoreNotFoundError` and ORM-specific equivalents (e.g. Prisma P2025). */
export function isStoreNotFound(error: unknown): boolean {
  if (error instanceof StoreNotFoundError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code: string }).code;
  // Own code (handles module-duplication edge case in bundler/test environments)
  if (code === "STORE_NOT_FOUND") return true;
  // Backwards compat: Prisma's P2025
  return code === "P2025";
}

/** Type guard — works for `StoreDuplicateError` and ORM-specific equivalents (e.g. Prisma P2002). */
export function isStoreDuplicate(error: unknown): boolean {
  if (error instanceof StoreDuplicateError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code: string }).code;
  // Own code (handles module-duplication edge case in bundler/test environments)
  if (code === "STORE_DUPLICATE") return true;
  // Backwards compat: Prisma's P2002
  return code === "P2002";
}

/** Type guard — works for `StoreValidationError` across module-duplication boundaries. */
export function isStoreValidation(error: unknown): boolean {
  if (error instanceof StoreValidationError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code: string }).code;
  return code === "STORE_VALIDATION";
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

/** Persisted metadata for an attached screenshot. The PNG bytes live elsewhere (FS, localStorage, in-memory Map). */
export interface ScreenshotRecord {
  /** Stable id — hex SHA-256 of the decoded PNG bytes. Dedup key: same content ⇒ same id. */
  id: string;
  /** Feedback this screenshot is attached to. */
  feedbackId: string;
  /**
   * Relative URL at which the PNG bytes can be fetched. For Prisma-backed deployments this is
   * `/api/colaborate/feedbacks/{feedbackId}/screenshots/{id}`. Memory/LocalStorage stores that
   * have no HTTP surface still set a URL of this shape so clients building session bundles can
   * present a consistent shape; whether the URL actually resolves is environment-dependent.
   */
  url: string;
  /** Byte size of the stored PNG (decoded from the dataUrl). */
  byteSize: number;
  /** When the record was first attached. Re-attaching identical content refreshes this value. */
  createdAt: Date;
}

/** HTTP/JSON-serialized shape of a `ScreenshotRecord`. Dates are ISO strings on the wire. */
export interface ScreenshotResponse {
  id: string;
  feedbackId: string;
  url: string;
  byteSize: number;
  createdAt: string;
}

/**
 * Aggregated view of a session loaded by the triage worker.
 * Built by `loadSessionBundle` in `@colaborate/triage`.
 */
export interface SessionBundle {
  session: SessionRecord;
  feedbacks: FeedbackRecord[];
  /** Map keyed by `feedbackId`. Empty array (not undefined) when a feedback has no screenshots. */
  screenshotsByFeedbackId: Record<string, ScreenshotRecord[]>;
}

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
  /**
   * Attach a screenshot to a feedback. The `dataUrl` must be of the form
   * `data:image/png;base64,<...>`. Implementations decode, hash, and persist.
   * Idempotent on `{feedbackId, hash}` — re-attaching identical bytes returns the existing record
   * with an updated `createdAt`. Does NOT validate that `feedbackId` refers to an existing
   * feedback; the calling HTTP handler is responsible for that check.
   */
  attachScreenshot(feedbackId: string, dataUrl: string): Promise<ScreenshotRecord>;
  /** List all screenshots attached to a feedback, newest first. Empty array (not error) when none. */
  listScreenshots(feedbackId: string): Promise<ScreenshotRecord[]>;
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
  /** Source file resolved by the widget's fiber `_debugSource` walk (dev mode). Server persists as-is. */
  sourceFile?: string | undefined;
  /** 1-indexed line within `sourceFile`. */
  sourceLine?: number | undefined;
  /** 0-indexed column within `sourceFile`. */
  sourceColumn?: number | undefined;
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
