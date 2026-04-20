import {
  type AnnotationRecord,
  type AnnotationResponse,
  type ColaborateStore,
  type FeedbackPayload,
  type FeedbackRecord,
  type FeedbackResponse,
  type FeedbackStatus,
  type FeedbackType,
  flattenAnnotation,
  type SessionRecord,
  type SessionResponse,
  type SessionStatus,
  serializeMentions,
} from "@colaborate/core";
import type { WidgetClient } from "./api-client.js";

/**
 * `WidgetClient` implementation that delegates directly to a `ColaborateStore`.
 *
 * Used in client-side mode — the widget calls the store in-process instead of
 * making HTTP requests. Handles the same conversions the HTTP handler normally
 * performs: flattening annotations and serializing dates.
 */
export class StoreClient implements WidgetClient {
  constructor(
    private readonly store: ColaborateStore,
    private readonly projectName: string,
  ) {}

  async sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
    const record = await this.store.createFeedback({
      projectName: payload.projectName,
      type: payload.type,
      message: payload.message,
      status: payload.status ?? "open",
      url: payload.url,
      viewport: payload.viewport,
      userAgent: payload.userAgent,
      authorName: payload.authorName,
      authorEmail: payload.authorEmail,
      clientId: payload.clientId,
      sessionId: payload.sessionId,
      componentId: payload.componentId,
      mentions: serializeMentions(payload.mentions ?? []),
      annotations: payload.annotations.map(flattenAnnotation),
    });

    return toResponse(record);
  }

  async getFeedbacks(
    projectName: string,
    options?: { page?: number; limit?: number; type?: FeedbackType; status?: FeedbackStatus; search?: string },
  ): Promise<{ feedbacks: FeedbackResponse[]; total: number }> {
    const { feedbacks, total } = await this.store.getFeedbacks({
      projectName,
      page: options?.page,
      limit: options?.limit,
      type: options?.type,
      status: options?.status,
      search: options?.search,
    });

    return { feedbacks: feedbacks.map(toResponse), total };
  }

  async resolveFeedback(id: string, resolved: boolean): Promise<FeedbackResponse> {
    const record = await this.store.updateFeedback(id, {
      status: resolved ? "resolved" : "open",
      resolvedAt: resolved ? new Date() : null,
    });
    return toResponse(record);
  }

  async deleteFeedback(id: string): Promise<void> {
    await this.store.deleteFeedback(id);
  }

  async deleteAllFeedbacks(projectName: string): Promise<void> {
    await this.store.deleteAllFeedbacks(projectName);
  }

  async createSession(input: {
    projectName: string;
    reviewerName?: string;
    reviewerEmail?: string;
    notes?: string;
  }): Promise<SessionResponse> {
    const record = await this.store.createSession(input);
    return toSessionResponse(record);
  }

  async submitSession(id: string): Promise<SessionResponse> {
    const record = await this.store.submitSession(id);
    return toSessionResponse(record);
  }

  async getSession(id: string): Promise<SessionResponse | null> {
    const record = await this.store.getSession(id);
    return record ? toSessionResponse(record) : null;
  }

  async listSessions(projectName: string, status?: SessionStatus): Promise<SessionResponse[]> {
    const records = await this.store.listSessions(projectName, status);
    return records.map(toSessionResponse);
  }
}

// ---------------------------------------------------------------------------
// FeedbackRecord (Date) → FeedbackResponse (string) serialization
// ---------------------------------------------------------------------------

function toResponse(record: FeedbackRecord): FeedbackResponse {
  return {
    id: record.id,
    projectName: record.projectName,
    type: record.type,
    message: record.message,
    status: record.status,
    url: record.url,
    viewport: record.viewport,
    userAgent: record.userAgent,
    authorName: record.authorName,
    authorEmail: record.authorEmail,
    sessionId: record.sessionId,
    componentId: record.componentId,
    sourceFile: record.sourceFile,
    sourceLine: record.sourceLine,
    sourceColumn: record.sourceColumn,
    mentions: record.mentions,
    externalProvider: record.externalProvider,
    externalIssueId: record.externalIssueId,
    externalIssueUrl: record.externalIssueUrl,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    annotations: record.annotations.map(toAnnotationResponse),
  };
}

function toAnnotationResponse(ann: AnnotationRecord): AnnotationResponse {
  return {
    id: ann.id,
    feedbackId: ann.feedbackId,
    cssSelector: ann.cssSelector,
    xpath: ann.xpath,
    textSnippet: ann.textSnippet,
    elementTag: ann.elementTag,
    elementId: ann.elementId,
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
    createdAt: ann.createdAt.toISOString(),
  };
}

function toSessionResponse(record: SessionRecord): SessionResponse {
  return {
    id: record.id,
    projectName: record.projectName,
    reviewerName: record.reviewerName,
    reviewerEmail: record.reviewerEmail,
    status: record.status,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    triagedAt: record.triagedAt?.toISOString() ?? null,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
