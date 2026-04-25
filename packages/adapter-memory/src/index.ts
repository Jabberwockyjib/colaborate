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
  StoreValidationError,
} from "@colaborate/core";

export type { ColaborateStore } from "@colaborate/core";
export { StoreDuplicateError, StoreNotFoundError, StoreValidationError } from "@colaborate/core";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
/** PNG file signature — first 8 bytes of every valid PNG. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Decode `data:image/png;base64,<...>` → `{bytes, hash}`. Throws `StoreValidationError`
 * on malformed input — the caller (HTTP handler / MCP tool) maps this to a 400-class error.
 */
async function decodePngDataUrl(dataUrl: string): Promise<{ bytes: Uint8Array; hash: string }> {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new StoreValidationError("Invalid dataUrl: expected 'data:image/png;base64,...'");
  }
  const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (base64.length === 0) throw new StoreValidationError("Invalid dataUrl: empty body");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    // Works in Node 18+, Bun, browsers, Workers.
    const binary = atob(base64);
    bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch (cause) {
    throw new StoreValidationError(
      `Invalid dataUrl: base64 decode failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (!hasPngSignature(bytes)) {
    throw new StoreValidationError("Invalid dataUrl: decoded bytes are not a PNG (missing signature)");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, hash };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * In-memory `ColaborateStore` implementation.
 *
 * Zero dependencies, works in any JS environment (Node, Bun, Deno, browser,
 * Cloudflare Workers). Data lives in a plain array — lost on process restart.
 *
 * Use cases:
 * - **Testing** — fast, isolated store for unit/integration tests
 * - **Demos** — lightweight store that needs no database or localStorage
 * - **Reference** — simplest possible adapter for contributors to study
 *
 * @example
 * ```ts
 * import { MemoryStore } from '@colaborate/adapter-memory'
 *
 * const store = new MemoryStore()
 * // Pass to createColaborateHandler({ store }) or initColaborate({ store })
 * ```
 */
export class MemoryStore implements ColaborateStore {
  private feedbacks: FeedbackRecord[] = [];
  private sessions: SessionRecord[] = [];
  private screenshots: Map<string, ScreenshotRecord[]> = new Map();
  private idCounter = 1;

  private generateId(): string {
    return `mem-${this.idCounter++}-${Date.now().toString(36)}`;
  }

  async createFeedback(data: FeedbackCreateInput): Promise<FeedbackRecord> {
    // ClientId dedup — idempotent
    const existing = this.feedbacks.find((f) => f.clientId === data.clientId);
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

    this.feedbacks.unshift(record);
    return record;
  }

  async getFeedbacks(query: FeedbackQuery): Promise<{ feedbacks: FeedbackRecord[]; total: number }> {
    let results = this.feedbacks.filter((f) => f.projectName === query.projectName);

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
    return this.feedbacks.find((f) => f.clientId === clientId) ?? null;
  }

  async updateFeedback(id: string, data: FeedbackUpdateInput): Promise<FeedbackRecord> {
    const fb = this.feedbacks.find((f) => f.id === id);
    if (!fb) throw new StoreNotFoundError();

    fb.status = data.status;
    fb.resolvedAt = data.resolvedAt;
    fb.updatedAt = new Date();
    return fb;
  }

  async deleteFeedback(id: string): Promise<void> {
    const idx = this.feedbacks.findIndex((f) => f.id === id);
    if (idx === -1) throw new StoreNotFoundError();
    this.feedbacks.splice(idx, 1);
  }

  async deleteAllFeedbacks(projectName: string): Promise<void> {
    this.feedbacks = this.feedbacks.filter((f) => f.projectName !== projectName);
  }

  async createSession(data: SessionCreateInput): Promise<SessionRecord> {
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
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.unshift(record);
    return record;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async listSessions(projectName: string, status?: SessionStatus): Promise<SessionRecord[]> {
    let results = this.sessions.filter((s) => s.projectName === projectName);
    if (status) results = results.filter((s) => s.status === status);
    return results;
  }

  async submitSession(id: string): Promise<SessionRecord> {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) throw new StoreNotFoundError();
    const now = new Date();
    session.status = "submitted";
    session.submittedAt = now;
    session.updatedAt = now;
    // Flip associated drafts to "open" — they're now real, processable feedbacks.
    for (const fb of this.feedbacks) {
      if (fb.sessionId === id && fb.status === "draft") {
        fb.status = "open";
        fb.updatedAt = now;
      }
    }
    return session;
  }

  async attachScreenshot(feedbackId: string, dataUrl: string): Promise<ScreenshotRecord> {
    const { bytes, hash } = await decodePngDataUrl(dataUrl);
    const list = this.screenshots.get(feedbackId) ?? [];
    const now = new Date();
    const existing = list.find((r) => r.id === hash);
    if (existing) {
      existing.createdAt = now;
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
    this.screenshots.set(feedbackId, list);
    return record;
  }

  async listScreenshots(feedbackId: string): Promise<ScreenshotRecord[]> {
    return (this.screenshots.get(feedbackId) ?? []).slice();
  }

  async setFeedbackExternalIssue(
    id: string,
    data: { provider: string; issueId: string; issueUrl: string },
  ): Promise<FeedbackRecord> {
    const fb = this.feedbacks.find((f) => f.id === id);
    if (!fb) throw new StoreNotFoundError();
    fb.externalProvider = data.provider;
    fb.externalIssueId = data.issueId;
    fb.externalIssueUrl = data.issueUrl;
    fb.updatedAt = new Date();
    return fb;
  }

  async markSessionTriaged(id: string): Promise<SessionRecord> {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) throw new StoreNotFoundError();
    if (session.status !== "submitted" && session.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as triaged from status '${session.status}' (expected 'submitted' or 'failed')`,
      );
    }
    const now = new Date();
    session.status = "triaged";
    session.triagedAt = now;
    session.failureReason = null;
    session.updatedAt = now;
    return session;
  }

  async markSessionFailed(id: string, reason: string): Promise<SessionRecord> {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) throw new StoreNotFoundError();
    if (session.status !== "submitted" && session.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as failed from status '${session.status}' (expected 'submitted' or 'failed')`,
      );
    }
    session.status = "failed";
    session.failureReason = reason;
    session.updatedAt = new Date();
    return session;
  }

  /** Remove all data from this store instance. */
  clear(): void {
    this.feedbacks = [];
    this.sessions = [];
    this.screenshots = new Map();
    this.idCounter = 1;
  }
}
