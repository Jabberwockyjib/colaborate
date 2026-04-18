import type {
  AnnotationPayload,
  ColaborateStore,
  FeedbackCreateInput,
  FeedbackPayload,
  FeedbackRecord,
} from "@colaborate/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreClient } from "../../src/store-client.js";

// ---------------------------------------------------------------------------
// Mock ColaborateStore
// ---------------------------------------------------------------------------

function mockStore(): ColaborateStore {
  return {
    createFeedback: vi.fn(),
    getFeedbacks: vi.fn(),
    findByClientId: vi.fn(),
    updateFeedback: vi.fn(),
    deleteFeedback: vi.fn(),
    deleteAllFeedbacks: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date("2025-06-01T12:00:00.000Z");

const sampleAnnotation: AnnotationPayload = {
  anchor: {
    cssSelector: "div.hero",
    xpath: "/html/body/div[1]",
    textSnippet: "Welcome",
    elementTag: "DIV",
    elementId: "hero",
    textPrefix: "nav",
    textSuffix: "footer",
    fingerprint: "2:0:x1",
    neighborText: "aside",
  },
  shape: "rectangle" as const,
  geometry: { shape: "rectangle" as const, x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
  scrollX: 0,
  scrollY: 150,
  viewportW: 1920,
  viewportH: 1080,
  devicePixelRatio: 2,
};

const samplePayload: FeedbackPayload = {
  projectName: "test-project",
  type: "bug",
  message: "Broken layout",
  url: "https://example.com",
  viewport: "1920x1080",
  userAgent: "Mozilla/5.0",
  authorName: "Alice",
  authorEmail: "alice@test.com",
  annotations: [sampleAnnotation],
  clientId: "uuid-123",
};

function makeFeedbackRecord(overrides?: Partial<FeedbackRecord>): FeedbackRecord {
  return {
    id: "fb-1",
    projectName: "test-project",
    type: "bug",
    message: "Broken layout",
    status: "open",
    url: "https://example.com",
    viewport: "1920x1080",
    userAgent: "Mozilla/5.0",
    authorName: "Alice",
    authorEmail: "alice@test.com",
    clientId: "uuid-123",
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    annotations: [
      {
        id: "ann-1",
        feedbackId: "fb-1",
        cssSelector: "div.hero",
        xpath: "/html/body/div[1]",
        textSnippet: "Welcome",
        elementTag: "DIV",
        elementId: "hero",
        textPrefix: "nav",
        textSuffix: "footer",
        fingerprint: "2:0:x1",
        neighborText: "aside",
        shape: "rectangle",
        geometry: JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 }),
        scrollX: 0,
        scrollY: 150,
        viewportW: 1920,
        viewportH: 1080,
        devicePixelRatio: 2,
        createdAt: now,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StoreClient", () => {
  let store: ReturnType<typeof mockStore>;
  let client: StoreClient;

  beforeEach(() => {
    store = mockStore();
    client = new StoreClient(store, "test-project");
  });

  // -----------------------------------------------------------------------
  // sendFeedback
  // -----------------------------------------------------------------------

  describe("sendFeedback", () => {
    it("calls store.createFeedback with flattened annotations", async () => {
      const record = makeFeedbackRecord();
      vi.mocked(store.createFeedback).mockResolvedValue(record);

      await client.sendFeedback(samplePayload);

      expect(store.createFeedback).toHaveBeenCalledOnce();
      const input = vi.mocked(store.createFeedback).mock.calls[0]![0] as FeedbackCreateInput;

      // Status should be "open" for new feedbacks
      expect(input.status).toBe("open");
      // Annotations should be flattened (no anchor/rect/geometry-object nesting)
      expect(input.annotations[0]!.cssSelector).toBe("div.hero");
      expect(input.annotations[0]!.shape).toBe("rectangle");
      expect(JSON.parse(input.annotations[0]!.geometry)).toEqual({
        shape: "rectangle",
        x: 0.1,
        y: 0.2,
        w: 0.5,
        h: 0.3,
      });
      expect(input.annotations[0]!.scrollY).toBe(150);
      // No nested anchor; geometry is a JSON string, not an object.
      expect("anchor" in input.annotations[0]!).toBe(false);
      expect(typeof input.annotations[0]!.geometry).toBe("string");
    });

    it("passes all payload fields through", async () => {
      vi.mocked(store.createFeedback).mockResolvedValue(makeFeedbackRecord());

      await client.sendFeedback(samplePayload);
      const input = vi.mocked(store.createFeedback).mock.calls[0]![0] as FeedbackCreateInput;

      expect(input.projectName).toBe("test-project");
      expect(input.type).toBe("bug");
      expect(input.message).toBe("Broken layout");
      expect(input.url).toBe("https://example.com");
      expect(input.authorName).toBe("Alice");
      expect(input.clientId).toBe("uuid-123");
    });

    it("serializes dates to ISO strings in the response", async () => {
      const record = makeFeedbackRecord();
      vi.mocked(store.createFeedback).mockResolvedValue(record);

      const response = await client.sendFeedback(samplePayload);

      expect(response.createdAt).toBe("2025-06-01T12:00:00.000Z");
      expect(response.updatedAt).toBe("2025-06-01T12:00:00.000Z");
      expect(response.resolvedAt).toBeNull();
      expect(response.annotations[0]!.createdAt).toBe("2025-06-01T12:00:00.000Z");
    });

    it("serializes resolvedAt when present", async () => {
      const resolvedAt = new Date("2025-06-02T08:00:00.000Z");
      const record = makeFeedbackRecord({ status: "resolved", resolvedAt });
      vi.mocked(store.createFeedback).mockResolvedValue(record);

      const response = await client.sendFeedback(samplePayload);
      expect(response.resolvedAt).toBe("2025-06-02T08:00:00.000Z");
    });

    it("does not include clientId in the response", async () => {
      vi.mocked(store.createFeedback).mockResolvedValue(makeFeedbackRecord());
      const response = await client.sendFeedback(samplePayload);
      expect("clientId" in response).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getFeedbacks
  // -----------------------------------------------------------------------

  describe("getFeedbacks", () => {
    it("delegates to store.getFeedbacks with correct query", async () => {
      vi.mocked(store.getFeedbacks).mockResolvedValue({ feedbacks: [], total: 0 });

      await client.getFeedbacks("my-project", { page: 2, limit: 10, type: "bug", status: "open", search: "hello" });

      expect(store.getFeedbacks).toHaveBeenCalledWith({
        projectName: "my-project",
        page: 2,
        limit: 10,
        type: "bug",
        status: "open",
        search: "hello",
      });
    });

    it("handles missing options", async () => {
      vi.mocked(store.getFeedbacks).mockResolvedValue({ feedbacks: [], total: 0 });

      await client.getFeedbacks("my-project");

      expect(store.getFeedbacks).toHaveBeenCalledWith({
        projectName: "my-project",
        page: undefined,
        limit: undefined,
        type: undefined,
        status: undefined,
        search: undefined,
      });
    });

    it("serializes dates in returned feedbacks", async () => {
      vi.mocked(store.getFeedbacks).mockResolvedValue({
        feedbacks: [makeFeedbackRecord()],
        total: 1,
      });

      const result = await client.getFeedbacks("test-project");
      expect(result.total).toBe(1);
      expect(result.feedbacks[0]!.createdAt).toBe("2025-06-01T12:00:00.000Z");
      expect(typeof result.feedbacks[0]!.createdAt).toBe("string");
    });
  });

  // -----------------------------------------------------------------------
  // resolveFeedback
  // -----------------------------------------------------------------------

  describe("resolveFeedback", () => {
    it("calls store.updateFeedback with resolved status", async () => {
      const resolved = makeFeedbackRecord({ status: "resolved", resolvedAt: now });
      vi.mocked(store.updateFeedback).mockResolvedValue(resolved);

      await client.resolveFeedback("fb-1", true);

      expect(store.updateFeedback).toHaveBeenCalledWith("fb-1", {
        status: "resolved",
        resolvedAt: expect.any(Date),
      });
    });

    it("calls store.updateFeedback with open status when unresolving", async () => {
      const reopened = makeFeedbackRecord({ status: "open", resolvedAt: null });
      vi.mocked(store.updateFeedback).mockResolvedValue(reopened);

      await client.resolveFeedback("fb-1", false);

      expect(store.updateFeedback).toHaveBeenCalledWith("fb-1", {
        status: "open",
        resolvedAt: null,
      });
    });

    it("returns serialized FeedbackResponse", async () => {
      vi.mocked(store.updateFeedback).mockResolvedValue(makeFeedbackRecord({ status: "resolved", resolvedAt: now }));

      const response = await client.resolveFeedback("fb-1", true);
      expect(response.status).toBe("resolved");
      expect(response.resolvedAt).toBe("2025-06-01T12:00:00.000Z");
    });
  });

  // -----------------------------------------------------------------------
  // deleteFeedback
  // -----------------------------------------------------------------------

  describe("deleteFeedback", () => {
    it("delegates to store.deleteFeedback", async () => {
      vi.mocked(store.deleteFeedback).mockResolvedValue(undefined);

      await client.deleteFeedback("fb-1");
      expect(store.deleteFeedback).toHaveBeenCalledWith("fb-1");
    });
  });

  // -----------------------------------------------------------------------
  // deleteAllFeedbacks
  // -----------------------------------------------------------------------

  describe("deleteAllFeedbacks", () => {
    it("delegates to store.deleteAllFeedbacks", async () => {
      vi.mocked(store.deleteAllFeedbacks).mockResolvedValue(undefined);

      await client.deleteAllFeedbacks("test-project");
      expect(store.deleteAllFeedbacks).toHaveBeenCalledWith("test-project");
    });
  });
});
