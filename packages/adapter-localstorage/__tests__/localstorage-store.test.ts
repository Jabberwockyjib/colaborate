// @vitest-environment jsdom

import { testColaborateStore } from "@colaborate/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageStore } from "../src/index.js";

// Run the full ColaborateStore conformance suite
testColaborateStore(() => {
  localStorage.clear();
  return new LocalStorageStore({ key: "test_conformance", sessionsKey: "test_conformance_sessions" });
});

// ---------------------------------------------------------------------------
// LocalStorageStore-specific tests
// ---------------------------------------------------------------------------

describe("LocalStorageStore specific", () => {
  let store: LocalStorageStore;

  beforeEach(() => {
    localStorage.clear();
    store = new LocalStorageStore({ key: "test_feedbacks", sessionsKey: "test_sessions" });
  });

  afterEach(() => {
    localStorage.clear();
  });

  const input = {
    projectName: "test-project",
    type: "bug" as const,
    message: "test",
    status: "open" as const,
    url: "https://example.com",
    viewport: "1920x1080",
    userAgent: "test",
    authorName: "Alice",
    authorEmail: "a@t.com",
    clientId: "c1",
    annotations: [],
  };

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  describe("localStorage persistence", () => {
    it("persists data to localStorage", async () => {
      await store.createFeedback(input);
      const raw = localStorage.getItem("test_feedbacks");
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw!);
      expect(data).toHaveLength(1);
    });

    it("persists updates to localStorage", async () => {
      const fb = await store.createFeedback(input);
      await store.updateFeedback(fb.id, { status: "resolved", resolvedAt: new Date() });

      const store2 = new LocalStorageStore({ key: "test_feedbacks" });
      const { feedbacks } = await store2.getFeedbacks({ projectName: "test-project" });
      expect(feedbacks[0]!.status).toBe("resolved");
    });

    it("persists deletions to localStorage", async () => {
      const fb = await store.createFeedback(input);
      await store.deleteFeedback(fb.id);

      const store2 = new LocalStorageStore({ key: "test_feedbacks" });
      const { total } = await store2.getFeedbacks({ projectName: "test-project" });
      expect(total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Date round-trip
  // -----------------------------------------------------------------------

  describe("date serialization", () => {
    it("revives Date objects from localStorage JSON", async () => {
      const fb = await store.createFeedback(input);
      await store.updateFeedback(fb.id, {
        status: "resolved",
        resolvedAt: new Date("2025-06-15T12:00:00.000Z"),
      });

      const store2 = new LocalStorageStore({ key: "test_feedbacks" });
      const { feedbacks } = await store2.getFeedbacks({ projectName: "test-project" });

      expect(feedbacks[0]!.createdAt).toBeInstanceOf(Date);
      expect(feedbacks[0]!.updatedAt).toBeInstanceOf(Date);
      expect(feedbacks[0]!.resolvedAt).toBeInstanceOf(Date);
      expect(feedbacks[0]!.resolvedAt!.toISOString()).toBe("2025-06-15T12:00:00.000Z");
    });

    it("handles null resolvedAt through round-trip", async () => {
      await store.createFeedback(input);

      const store2 = new LocalStorageStore({ key: "test_feedbacks" });
      const { feedbacks } = await store2.getFeedbacks({ projectName: "test-project" });
      expect(feedbacks[0]!.resolvedAt).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Session round-trip
  // -----------------------------------------------------------------------

  describe("session serialization", () => {
    it("persists sessions across reloads (dates revived correctly)", async () => {
      const created = await store.createSession({
        projectName: "rt-project",
        reviewerName: "Alice",
        reviewerEmail: "alice@example.com",
        notes: "Round-trip test",
      });
      await store.submitSession(created.id);

      // New store instance, same keys — simulates a page reload
      const store2 = new LocalStorageStore({ key: "test_feedbacks", sessionsKey: "test_sessions" });
      const loaded = await store2.getSession(created.id);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(created.id);
      expect(loaded?.projectName).toBe("rt-project");
      expect(loaded?.reviewerName).toBe("Alice");
      expect(loaded?.reviewerEmail).toBe("alice@example.com");
      expect(loaded?.notes).toBe("Round-trip test");
      expect(loaded?.status).toBe("submitted");
      // Date round-trip: fields should be Date instances, not strings
      expect(loaded?.createdAt).toBeInstanceOf(Date);
      expect(loaded?.updatedAt).toBeInstanceOf(Date);
      expect(loaded?.submittedAt).toBeInstanceOf(Date);
      // Unset nullable dates stay null across revival
      expect(loaded?.triagedAt).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("uses default key when no options provided", async () => {
      const defaultStore = new LocalStorageStore();
      await defaultStore.createFeedback({ ...input, clientId: "default-key" });
      expect(localStorage.getItem("colaborate_feedbacks")).toBeTruthy();
      localStorage.removeItem("colaborate_feedbacks");
    });

    it("handles corrupted localStorage gracefully", async () => {
      localStorage.setItem("test_feedbacks", "not-valid-json");
      const { feedbacks } = await store.getFeedbacks({ projectName: "test-project" });
      expect(feedbacks).toHaveLength(0);
    });

    it("handles localStorage full on save (silent fail)", async () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new DOMException("QuotaExceededError");
      };
      await expect(store.createFeedback(input)).resolves.toBeDefined();
      Storage.prototype.setItem = original;
    });

    it("clear() removes all data for this store's keys", async () => {
      await store.createFeedback(input);
      await store.createSession({ projectName: "test-project", reviewerName: "Alice" });
      expect(localStorage.getItem("test_feedbacks")).not.toBeNull();
      expect(localStorage.getItem("test_sessions")).not.toBeNull();

      store.clear();

      expect(localStorage.getItem("test_feedbacks")).toBeNull();
      expect(localStorage.getItem("test_sessions")).toBeNull();
    });

    it("multiple stores with different keys are isolated", async () => {
      const store2 = new LocalStorageStore({ key: "other_feedbacks" });
      await store.createFeedback({ ...input, message: "store 1" });
      await store2.createFeedback({ ...input, clientId: "c2", message: "store 2" });

      const r1 = await store.getFeedbacks({ projectName: "test-project" });
      const r2 = await store2.getFeedbacks({ projectName: "test-project" });
      expect(r1.feedbacks[0]!.message).toBe("store 1");
      expect(r2.feedbacks[0]!.message).toBe("store 2");
      localStorage.removeItem("other_feedbacks");
    });
  });
});
