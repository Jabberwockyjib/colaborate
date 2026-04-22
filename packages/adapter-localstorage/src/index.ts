import {
  type AnnotationCreateInput,
  type AnnotationRecord,
  type ColaborateStore,
  type FeedbackCreateInput,
  type FeedbackQuery,
  type FeedbackRecord,
  type FeedbackUpdateInput,
  type ScreenshotRecord,
  type SessionCreateInput,
  type SessionRecord,
  type SessionStatus,
  StoreNotFoundError,
} from "@colaborate/core";

export type { ColaborateStore } from "@colaborate/core";
export { StoreDuplicateError, StoreNotFoundError } from "@colaborate/core";

const DEFAULT_KEY = "colaborate_feedbacks";
const DEFAULT_SESSIONS_KEY = "colaborate_sessions";
const DEFAULT_SCREENSHOTS_KEY = "colaborate_screenshots";

export interface LocalStorageStoreOptions {
  /** localStorage key prefix for feedbacks — defaults to `'colaborate_feedbacks'` */
  key?: string;
  /** localStorage key prefix for sessions — defaults to `'colaborate_sessions'` */
  sessionsKey?: string;
  /** localStorage key prefix for screenshot metadata — defaults to `'colaborate_screenshots'` */
  screenshotsKey?: string;
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/**
 * Decode a PNG data URL to raw bytes + hex SHA-256. Throws on malformed input.
 *
 * Note: this helper is duplicated between `@colaborate/adapter-memory` and this
 * adapter. We intentionally do NOT promote it to `@colaborate/core` yet — only
 * two callers, and Prisma uses a synchronous Node `Buffer.from(...)` path. Revisit
 * if a third caller appears.
 *
 * TS typing: `Uint8Array<ArrayBuffer>` (not `Uint8Array`) satisfies TS 5.7+'s
 * `BufferSource` parameter on `crypto.subtle.digest` — the strict-mode default of
 * `Uint8Array<ArrayBufferLike>` is rejected because it could be backed by a
 * `SharedArrayBuffer`. Narrowing fixes compilation without changing behavior.
 */
async function decodePngDataUrl(dataUrl: string): Promise<{ bytes: Uint8Array; hash: string }> {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error("Invalid dataUrl: expected 'data:image/png;base64,...'");
  }
  const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (base64.length === 0) throw new Error("Invalid dataUrl: empty body");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    throw new Error("Invalid dataUrl: base64 decode failed");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, hash };
}

/**
 * Client-side `ColaborateStore` implementation backed by `localStorage`.
 *
 * Designed for demos, prototyping, and static sites that don't need a server.
 * Data persists across page reloads but is scoped to the current origin.
 *
 * @example
 * ```ts
 * import { initColaborate } from '@colaborate/widget'
 * import { LocalStorageStore } from '@colaborate/adapter-localstorage'
 *
 * const store = new LocalStorageStore()
 *
 * initColaborate({
 *   store,
 *   projectName: 'my-demo',
 * })
 * ```
 */
export class LocalStorageStore implements ColaborateStore {
  private readonly key: string;
  private readonly sessionsKey: string;
  private readonly screenshotsKey: string;

  constructor(options?: LocalStorageStoreOptions) {
    this.key = options?.key ?? DEFAULT_KEY;
    this.sessionsKey = options?.sessionsKey ?? DEFAULT_SESSIONS_KEY;
    this.screenshotsKey = options?.screenshotsKey ?? DEFAULT_SCREENSHOTS_KEY;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private load(): FeedbackRecord[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const data = JSON.parse(raw) as SerializedFeedback[];
      return data.map(reviveFeedback);
    } catch {
      return [];
    }
  }

  private save(feedbacks: FeedbackRecord[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(feedbacks));
    } catch {
      // localStorage full — silently drop (best-effort persistence)
    }
  }

  private loadSessions(): SessionRecord[] {
    try {
      const raw = localStorage.getItem(this.sessionsKey);
      if (!raw) return [];
      const data = JSON.parse(raw) as SerializedSession[];
      return data.map(reviveSession);
    } catch {
      return [];
    }
  }

  private saveSessions(sessions: SessionRecord[]): void {
    try {
      localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
    } catch {
      // localStorage full — silently drop (best-effort persistence)
    }
  }

  private loadScreenshots(): Record<string, ScreenshotRecord[]> {
    try {
      const raw = localStorage.getItem(this.screenshotsKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<
        string,
        Array<Omit<ScreenshotRecord, "createdAt"> & { createdAt: string }>
      >;
      const out: Record<string, ScreenshotRecord[]> = {};
      for (const [k, v] of Object.entries(parsed)) {
        out[k] = v.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
      }
      return out;
    } catch {
      return {};
    }
  }

  private saveScreenshots(map: Record<string, ScreenshotRecord[]>): void {
    try {
      localStorage.setItem(this.screenshotsKey, JSON.stringify(map));
    } catch {
      // localStorage full — silently drop
    }
  }

  private generateId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  // ---------------------------------------------------------------------------
  // ColaborateStore implementation
  // ---------------------------------------------------------------------------

  async createFeedback(data: FeedbackCreateInput): Promise<FeedbackRecord> {
    const feedbacks = this.load();

    // ClientId dedup — idempotent
    const existing = feedbacks.find((f) => f.clientId === data.clientId);
    if (existing) return existing;

    const now = new Date();
    const feedbackId = this.generateId();

    const annotations: AnnotationRecord[] = data.annotations.map((ann: AnnotationCreateInput) => ({
      id: this.generateId(),
      feedbackId,
      cssSelector: ann.cssSelector,
      xpath: ann.xpath,
      textSnippet: ann.textSnippet,
      elementTag: ann.elementTag,
      elementId: ann.elementId ?? null,
      textPrefix: ann.textPrefix,
      textSuffix: ann.textSuffix,
      fingerprint: ann.fingerprint,
      neighborText: ann.neighborText,
      shape: ann.shape,
      geometry: ann.geometry,
      scrollX: ann.scrollX,
      scrollY: ann.scrollY,
      viewportW: ann.viewportW,
      viewportH: ann.viewportH,
      devicePixelRatio: ann.devicePixelRatio,
      createdAt: now,
    }));

    const record: FeedbackRecord = {
      id: feedbackId,
      type: data.type,
      message: data.message,
      status: data.status,
      projectName: data.projectName,
      url: data.url,
      authorName: data.authorName,
      authorEmail: data.authorEmail,
      viewport: data.viewport,
      userAgent: data.userAgent,
      clientId: data.clientId,
      sessionId: data.sessionId ?? null,
      componentId: data.componentId ?? null,
      sourceFile: data.sourceFile ?? null,
      sourceLine: data.sourceLine ?? null,
      sourceColumn: data.sourceColumn ?? null,
      mentions: data.mentions ?? "[]",
      externalProvider: data.externalProvider ?? null,
      externalIssueId: data.externalIssueId ?? null,
      externalIssueUrl: data.externalIssueUrl ?? null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
      annotations,
    };

    feedbacks.unshift(record);
    this.save(feedbacks);
    return record;
  }

  async getFeedbacks(query: FeedbackQuery): Promise<{ feedbacks: FeedbackRecord[]; total: number }> {
    let results = this.load().filter((f) => f.projectName === query.projectName);

    if (query.type) results = results.filter((f) => f.type === query.type);
    if (query.status) results = results.filter((f) => f.status === query.status);
    if (query.search) {
      const s = query.search.toLowerCase();
      results = results.filter((f) => f.message.toLowerCase().includes(s));
    }

    const total = results.length;
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const start = (page - 1) * limit;

    return { feedbacks: results.slice(start, start + limit), total };
  }

  async findByClientId(clientId: string): Promise<FeedbackRecord | null> {
    return this.load().find((f) => f.clientId === clientId) ?? null;
  }

  async updateFeedback(id: string, data: FeedbackUpdateInput): Promise<FeedbackRecord> {
    const feedbacks = this.load();
    const fb = feedbacks.find((f) => f.id === id);
    if (!fb) throw new StoreNotFoundError();

    fb.status = data.status;
    fb.resolvedAt = data.resolvedAt;
    fb.updatedAt = new Date();
    this.save(feedbacks);
    return fb;
  }

  async deleteFeedback(id: string): Promise<void> {
    const feedbacks = this.load();
    const idx = feedbacks.findIndex((f) => f.id === id);
    if (idx === -1) throw new StoreNotFoundError();

    feedbacks.splice(idx, 1);
    this.save(feedbacks);
  }

  async deleteAllFeedbacks(projectName: string): Promise<void> {
    const feedbacks = this.load().filter((f) => f.projectName !== projectName);
    this.save(feedbacks);
  }

  async createSession(data: SessionCreateInput): Promise<SessionRecord> {
    const sessions = this.loadSessions();
    const now = new Date();
    const record: SessionRecord = {
      id: this.generateId(),
      projectName: data.projectName,
      reviewerName: data.reviewerName ?? null,
      reviewerEmail: data.reviewerEmail ?? null,
      status: "drafting",
      submittedAt: null,
      triagedAt: null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    sessions.unshift(record);
    this.saveSessions(sessions);
    return record;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.loadSessions().find((s) => s.id === id) ?? null;
  }

  async listSessions(projectName: string, status?: SessionStatus): Promise<SessionRecord[]> {
    let results = this.loadSessions().filter((s) => s.projectName === projectName);
    if (status) results = results.filter((s) => s.status === status);
    return results;
  }

  async submitSession(id: string): Promise<SessionRecord> {
    const sessions = this.loadSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) throw new StoreNotFoundError();

    const now = new Date();
    session.status = "submitted";
    session.submittedAt = now;
    session.updatedAt = now;
    this.saveSessions(sessions);

    // Flip associated drafts and persist feedbacks.
    const feedbacks = this.load();
    let changed = false;
    for (const fb of feedbacks) {
      if (fb.sessionId === id && fb.status === "draft") {
        fb.status = "open";
        fb.updatedAt = now;
        changed = true;
      }
    }
    if (changed) this.save(feedbacks);

    return session;
  }

  async attachScreenshot(feedbackId: string, dataUrl: string): Promise<ScreenshotRecord> {
    const { bytes, hash } = await decodePngDataUrl(dataUrl);
    const map = this.loadScreenshots();
    const list = map[feedbackId] ?? [];
    const now = new Date();
    const existing = list.find((r) => r.id === hash);
    if (existing) {
      existing.createdAt = now;
      map[feedbackId] = list;
      this.saveScreenshots(map);
      return existing;
    }
    const record: ScreenshotRecord = {
      id: hash,
      feedbackId,
      url: `/api/colaborate/feedbacks/${feedbackId}/screenshots/${hash}`,
      byteSize: bytes.byteLength,
      createdAt: now,
    };
    list.unshift(record);
    map[feedbackId] = list;
    this.saveScreenshots(map);
    return record;
  }

  async listScreenshots(feedbackId: string): Promise<ScreenshotRecord[]> {
    const map = this.loadScreenshots();
    return map[feedbackId]?.slice() ?? [];
  }

  /** Remove all data from localStorage for this store's keys. */
  clear(): void {
    localStorage.removeItem(this.key);
    localStorage.removeItem(this.sessionsKey);
    localStorage.removeItem(this.screenshotsKey);
  }
}

// ---------------------------------------------------------------------------
// JSON serialization helpers — revive date strings from localStorage
// ---------------------------------------------------------------------------

interface SerializedFeedback extends Omit<FeedbackRecord, "createdAt" | "updatedAt" | "resolvedAt" | "annotations"> {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  annotations: SerializedAnnotation[];
}

interface SerializedAnnotation extends Omit<AnnotationRecord, "createdAt"> {
  createdAt: string;
}

function reviveFeedback(raw: SerializedFeedback): FeedbackRecord {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    resolvedAt: raw.resolvedAt ? new Date(raw.resolvedAt) : null,
    annotations: raw.annotations.map((ann) => ({
      ...ann,
      createdAt: new Date(ann.createdAt),
    })),
  };
}

interface SerializedSession extends Omit<SessionRecord, "createdAt" | "updatedAt" | "submittedAt" | "triagedAt"> {
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  triagedAt: string | null;
}

function reviveSession(raw: SerializedSession): SessionRecord {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
    triagedAt: raw.triagedAt ? new Date(raw.triagedAt) : null,
  };
}
