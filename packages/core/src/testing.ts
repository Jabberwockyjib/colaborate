/**
 * Shared conformance test suite for `ColaborateStore` implementations.
 *
 * Adapters import this and run it with their store factory to verify they
 * satisfy the full store contract — no need to write the same 20+ tests
 * from scratch.
 *
 * @example
 * ```ts
 * import { testColaborateStore } from '@colaborate/core/testing'
 * import { DrizzleStore } from '../src/index.js'
 *
 * testColaborateStore(() => new DrizzleStore(mockDb))
 * ```
 */

import { describe, expect, it } from "vitest";
import type { ColaborateStore, FeedbackCreateInput, SessionCreateInput } from "./types.js";
import { StoreNotFoundError } from "./types.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function createInput(overrides?: Partial<FeedbackCreateInput>): FeedbackCreateInput {
  return {
    projectName: "test-project",
    type: "bug",
    message: "Something is broken",
    status: "open",
    url: "https://example.com",
    viewport: "1920x1080",
    userAgent: "Mozilla/5.0",
    authorName: "Alice",
    authorEmail: "alice@test.com",
    clientId: `client-${Date.now()}-${Math.random()}`,
    mentions: "[]",
    annotations: [
      {
        cssSelector: "div.main",
        xpath: "/html/body/div",
        textSnippet: "Hello",
        elementTag: "DIV",
        elementId: "main",
        textPrefix: "before",
        textSuffix: "after",
        fingerprint: "3:1:abc",
        neighborText: "sibling",
        shape: "rectangle",
        geometry: JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 }),
        scrollX: 0,
        scrollY: 100,
        viewportW: 1920,
        viewportH: 1080,
        devicePixelRatio: 2,
      },
    ],
    ...overrides,
  };
}

function createSessionInput(overrides?: Partial<SessionCreateInput>): SessionCreateInput {
  return {
    projectName: "test-project",
    reviewerName: "Alice",
    reviewerEmail: "alice@test.com",
    notes: "Initial draft",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Conformance suite
// ---------------------------------------------------------------------------

/**
 * Run the full `ColaborateStore` conformance test suite.
 *
 * @param factory — called before each test to create a fresh, empty store instance.
 */
export function testColaborateStore(factory: () => ColaborateStore): void {
  let store: ColaborateStore;

  // Use a describe-scoped beforeEach via the factory
  const freshStore = () => {
    store = factory();
  };

  describe("ColaborateStore conformance", () => {
    // ------------------------------------------------------------------
    // createFeedback
    // ------------------------------------------------------------------

    describe("createFeedback", () => {
      it("creates a feedback and returns a FeedbackRecord", async () => {
        freshStore();
        const record = await store.createFeedback(createInput());

        expect(record.id).toBeDefined();
        expect(record.projectName).toBe("test-project");
        expect(record.type).toBe("bug");
        expect(record.message).toBe("Something is broken");
        expect(record.status).toBe("open");
        expect(record.resolvedAt).toBeNull();
        expect(record.createdAt).toBeInstanceOf(Date);
        expect(record.updatedAt).toBeInstanceOf(Date);
      });

      it("creates annotations with feedbackId reference", async () => {
        freshStore();
        const record = await store.createFeedback(createInput());

        expect(record.annotations).toHaveLength(1);
        const [ann] = record.annotations;
        expect(ann).toBeDefined();
        expect(ann?.id).toBeDefined();
        expect(ann?.feedbackId).toBe(record.id);
        expect(ann?.cssSelector).toBe("div.main");
        expect(ann?.shape).toBe("rectangle");
        expect(ann?.geometry).toBeDefined();
        const geom = JSON.parse(ann?.geometry ?? "{}");
        expect(geom).toEqual({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
        expect(ann?.elementId).toBe("main");
        expect(ann?.createdAt).toBeInstanceOf(Date);
      });

      it("sets elementId to null when undefined in input", async () => {
        freshStore();
        const input = createInput({
          annotations: [
            {
              cssSelector: "div",
              xpath: "/div",
              textSnippet: "",
              elementTag: "DIV",
              textPrefix: "",
              textSuffix: "",
              fingerprint: "1:0:x",
              neighborText: "",
              shape: "rectangle",
              geometry: JSON.stringify({ shape: "rectangle", x: 0, y: 0, w: 1, h: 1 }),
              scrollX: 0,
              scrollY: 0,
              viewportW: 1920,
              viewportH: 1080,
              devicePixelRatio: 1,
            },
          ],
        });
        const record = await store.createFeedback(input);
        expect(record.annotations[0]?.elementId).toBeNull();
      });

      it("deduplicates by clientId (idempotent)", async () => {
        freshStore();
        const input = createInput({ clientId: "same-id" });
        const first = await store.createFeedback(input);
        const second = await store.createFeedback(input);

        expect(second.id).toBe(first.id);
        const { total } = await store.getFeedbacks({ projectName: "test-project" });
        expect(total).toBe(1);
      });

      it("stores newest feedbacks first", async () => {
        freshStore();
        const a = await store.createFeedback(createInput({ message: "first" }));
        const b = await store.createFeedback(createInput({ message: "second" }));
        const { feedbacks } = await store.getFeedbacks({ projectName: "test-project" });
        expect(feedbacks[0]?.id).toBe(b.id);
        expect(feedbacks[1]?.id).toBe(a.id);
      });

      it("generates unique IDs across calls", async () => {
        freshStore();
        const a = await store.createFeedback(createInput());
        const b = await store.createFeedback(createInput());
        expect(a.id).not.toBe(b.id);
      });

      it("creates feedbacks with no annotations", async () => {
        freshStore();
        const record = await store.createFeedback(createInput({ annotations: [] }));
        expect(record.annotations).toHaveLength(0);
      });
    });

    // ------------------------------------------------------------------
    // getFeedbacks
    // ------------------------------------------------------------------

    describe("getFeedbacks", () => {
      it("returns empty array when no feedbacks", async () => {
        freshStore();
        const result = await store.getFeedbacks({ projectName: "test-project" });
        expect(result.feedbacks).toHaveLength(0);
        expect(result.total).toBe(0);
      });

      it("filters by projectName", async () => {
        freshStore();
        await store.createFeedback(createInput({ projectName: "a" }));
        await store.createFeedback(createInput({ projectName: "b" }));

        const result = await store.getFeedbacks({ projectName: "a" });
        expect(result.total).toBe(1);
        expect(result.feedbacks[0]?.projectName).toBe("a");
      });

      it("filters by type", async () => {
        freshStore();
        await store.createFeedback(createInput({ type: "bug" }));
        await store.createFeedback(createInput({ type: "question" }));

        const result = await store.getFeedbacks({ projectName: "test-project", type: "bug" });
        expect(result.feedbacks).toHaveLength(1);
        expect(result.feedbacks[0]?.type).toBe("bug");
      });

      it("filters by status", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        await store.updateFeedback(fb.id, { status: "resolved", resolvedAt: new Date() });
        await store.createFeedback(createInput());

        const result = await store.getFeedbacks({ projectName: "test-project", status: "open" });
        expect(result.feedbacks).toHaveLength(1);
      });

      it("filters by search (case-insensitive)", async () => {
        freshStore();
        await store.createFeedback(createInput({ message: "Button is broken" }));
        await store.createFeedback(createInput({ message: "Layout looks great" }));

        const result = await store.getFeedbacks({ projectName: "test-project", search: "BROKEN" });
        expect(result.feedbacks).toHaveLength(1);
        expect(result.feedbacks[0]?.message).toBe("Button is broken");
      });

      it("paginates correctly", async () => {
        freshStore();
        for (let i = 0; i < 5; i++) {
          await store.createFeedback(createInput());
        }

        const page1 = await store.getFeedbacks({ projectName: "test-project", page: 1, limit: 2 });
        expect(page1.feedbacks).toHaveLength(2);
        expect(page1.total).toBe(5);

        const page3 = await store.getFeedbacks({ projectName: "test-project", page: 3, limit: 2 });
        expect(page3.feedbacks).toHaveLength(1);
      });

      it("caps limit at 100", async () => {
        freshStore();
        for (let i = 0; i < 3; i++) {
          await store.createFeedback(createInput());
        }
        const result = await store.getFeedbacks({ projectName: "test-project", limit: 200 });
        expect(result.feedbacks).toHaveLength(3);
      });
    });

    // ------------------------------------------------------------------
    // findByClientId
    // ------------------------------------------------------------------

    describe("findByClientId", () => {
      it("returns the record when found", async () => {
        freshStore();
        const created = await store.createFeedback(createInput({ clientId: "find-me" }));
        const found = await store.findByClientId("find-me");
        expect(found).not.toBeNull();
        expect(found?.id).toBe(created.id);
      });

      it("returns null when not found", async () => {
        freshStore();
        expect(await store.findByClientId("nope")).toBeNull();
      });
    });

    // ------------------------------------------------------------------
    // updateFeedback
    // ------------------------------------------------------------------

    describe("updateFeedback", () => {
      it("updates status and resolvedAt", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        const resolvedAt = new Date();
        const updated = await store.updateFeedback(fb.id, { status: "resolved", resolvedAt });

        expect(updated.status).toBe("resolved");
        expect(updated.resolvedAt).toEqual(resolvedAt);
        expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(fb.updatedAt.getTime());
      });

      it("throws StoreNotFoundError for unknown id", async () => {
        freshStore();
        await expect(store.updateFeedback("unknown", { status: "resolved", resolvedAt: new Date() })).rejects.toThrow(
          StoreNotFoundError,
        );
      });

      it("can reopen a resolved feedback", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        await store.updateFeedback(fb.id, { status: "resolved", resolvedAt: new Date() });
        const reopened = await store.updateFeedback(fb.id, { status: "open", resolvedAt: null });
        expect(reopened.status).toBe("open");
        expect(reopened.resolvedAt).toBeNull();
      });
    });

    // ------------------------------------------------------------------
    // deleteFeedback
    // ------------------------------------------------------------------

    describe("deleteFeedback", () => {
      it("removes the feedback", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        await store.deleteFeedback(fb.id);
        const { total } = await store.getFeedbacks({ projectName: "test-project" });
        expect(total).toBe(0);
      });

      it("throws StoreNotFoundError for unknown id", async () => {
        freshStore();
        await expect(store.deleteFeedback("unknown")).rejects.toThrow(StoreNotFoundError);
      });
    });

    // ------------------------------------------------------------------
    // deleteAllFeedbacks
    // ------------------------------------------------------------------

    describe("deleteAllFeedbacks", () => {
      it("removes all feedbacks for a project but keeps others", async () => {
        freshStore();
        await store.createFeedback(createInput({ projectName: "delete-me" }));
        await store.createFeedback(createInput({ projectName: "delete-me" }));
        await store.createFeedback(createInput({ projectName: "keep-me" }));

        await store.deleteAllFeedbacks("delete-me");

        expect((await store.getFeedbacks({ projectName: "delete-me" })).total).toBe(0);
        expect((await store.getFeedbacks({ projectName: "keep-me" })).total).toBe(1);
      });

      it("is a no-op when project has no feedbacks", async () => {
        freshStore();
        await expect(store.deleteAllFeedbacks("nonexistent")).resolves.toBeUndefined();
      });
    });

    // ------------------------------------------------------------------
    // Session lifecycle
    // ------------------------------------------------------------------

    describe("createSession", () => {
      it("creates a session with status 'drafting'", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());

        expect(session.id).toBeDefined();
        expect(session.projectName).toBe("test-project");
        expect(session.reviewerName).toBe("Alice");
        expect(session.reviewerEmail).toBe("alice@test.com");
        expect(session.status).toBe("drafting");
        expect(session.submittedAt).toBeNull();
        expect(session.triagedAt).toBeNull();
        expect(session.notes).toBe("Initial draft");
        expect(session.createdAt).toBeInstanceOf(Date);
        expect(session.updatedAt).toBeInstanceOf(Date);
      });

      it("nulls out omitted optional fields", async () => {
        freshStore();
        const session = await store.createSession({ projectName: "p" });
        expect(session.reviewerName).toBeNull();
        expect(session.reviewerEmail).toBeNull();
        expect(session.notes).toBeNull();
      });

      it("generates unique IDs across calls", async () => {
        freshStore();
        const a = await store.createSession(createSessionInput());
        const b = await store.createSession(createSessionInput());
        expect(a.id).not.toBe(b.id);
      });
    });

    describe("getSession", () => {
      it("returns the session when found", async () => {
        freshStore();
        const created = await store.createSession(createSessionInput());
        const found = await store.getSession(created.id);
        expect(found?.id).toBe(created.id);
      });

      it("returns null when not found", async () => {
        freshStore();
        expect(await store.getSession("nope")).toBeNull();
      });
    });

    describe("listSessions", () => {
      it("returns sessions for a project, newest first", async () => {
        freshStore();
        const a = await store.createSession(createSessionInput({ projectName: "p", notes: "first" }));
        const b = await store.createSession(createSessionInput({ projectName: "p", notes: "second" }));
        const results = await store.listSessions("p");
        expect(results).toHaveLength(2);
        expect(results[0]?.id).toBe(b.id);
        expect(results[1]?.id).toBe(a.id);
      });

      it("filters by projectName", async () => {
        freshStore();
        await store.createSession(createSessionInput({ projectName: "a" }));
        await store.createSession(createSessionInput({ projectName: "b" }));
        const results = await store.listSessions("a");
        expect(results).toHaveLength(1);
        expect(results[0]?.projectName).toBe("a");
      });

      it("filters by status when provided", async () => {
        freshStore();
        const s1 = await store.createSession(createSessionInput());
        await store.createSession(createSessionInput());
        await store.submitSession(s1.id);

        const drafting = await store.listSessions("test-project", "drafting");
        const submitted = await store.listSessions("test-project", "submitted");
        expect(drafting).toHaveLength(1);
        expect(submitted).toHaveLength(1);
        expect(submitted[0]?.id).toBe(s1.id);
      });

      it("returns empty array when project has no sessions", async () => {
        freshStore();
        expect(await store.listSessions("nonexistent")).toEqual([]);
      });
    });

    describe("submitSession", () => {
      it("flips status to 'submitted' and stamps submittedAt", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        const before = session.updatedAt.getTime();
        const submitted = await store.submitSession(session.id);
        expect(submitted.status).toBe("submitted");
        expect(submitted.submittedAt).toBeInstanceOf(Date);
        expect(submitted.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      });

      it("throws StoreNotFoundError for unknown id", async () => {
        freshStore();
        await expect(store.submitSession("nope")).rejects.toThrow(StoreNotFoundError);
      });

      it("flips all draft feedbacks in the same session to 'open'", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        const otherSession = await store.createSession(createSessionInput());

        // 2 drafts in the target session
        await store.createFeedback(createInput({ status: "draft", sessionId: session.id, clientId: "c-a" }));
        await store.createFeedback(createInput({ status: "draft", sessionId: session.id, clientId: "c-b" }));
        // 1 draft in a different session — must NOT be touched
        await store.createFeedback(createInput({ status: "draft", sessionId: otherSession.id, clientId: "c-c" }));
        // 1 standalone draft (no session) — must NOT be touched
        await store.createFeedback(createInput({ status: "draft", clientId: "c-d" }));

        await store.submitSession(session.id);

        const { feedbacks } = await store.getFeedbacks({ projectName: "test-project" });
        const byClient = Object.fromEntries(feedbacks.map((f) => [f.clientId, f.status]));
        expect(byClient["c-a"]).toBe("open");
        expect(byClient["c-b"]).toBe("open");
        expect(byClient["c-c"]).toBe("draft");
        expect(byClient["c-d"]).toBe("draft");
      });

      it("does not flip non-draft feedbacks in the same session (e.g. already-resolved ones)", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.createFeedback(createInput({ status: "resolved", sessionId: session.id, clientId: "c-res" }));
        await store.createFeedback(createInput({ status: "draft", sessionId: session.id, clientId: "c-draft" }));
        await store.submitSession(session.id);
        const { feedbacks } = await store.getFeedbacks({ projectName: "test-project" });
        const byClient = Object.fromEntries(feedbacks.map((f) => [f.clientId, f.status]));
        expect(byClient["c-res"]).toBe("resolved");
        expect(byClient["c-draft"]).toBe("open");
      });
    });

    // ------------------------------------------------------------------
    // Extended feedback fields (session + component + source + mentions + tracker)
    // ------------------------------------------------------------------

    describe("extended feedback fields", () => {
      it("persists and returns sessionId / componentId / mentions", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        const mentions = JSON.stringify([{ kind: "user", handle: "alice" }]);
        const fb = await store.createFeedback(
          createInput({
            sessionId: session.id,
            componentId: "CheckoutButton",
            mentions,
          }),
        );
        expect(fb.sessionId).toBe(session.id);
        expect(fb.componentId).toBe("CheckoutButton");
        expect(fb.mentions).toBe(mentions);
      });

      it("defaults mentions to '[]' when omitted", async () => {
        freshStore();
        // Strip mentions from the fixture to exercise the store's default, not the fixture's explicit "[]".
        const input = createInput();
        delete (input as Partial<FeedbackCreateInput>).mentions;
        const fb = await store.createFeedback(input);
        expect(fb.mentions).toBe("[]");
      });

      it("returns null for unset sessionId / componentId / source fields", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        expect(fb.sessionId).toBeNull();
        expect(fb.componentId).toBeNull();
        expect(fb.sourceFile).toBeNull();
        expect(fb.sourceLine).toBeNull();
        expect(fb.sourceColumn).toBeNull();
        expect(fb.externalProvider).toBeNull();
        expect(fb.externalIssueId).toBeNull();
        expect(fb.externalIssueUrl).toBeNull();
      });

      it("persists sourceFile / sourceLine / sourceColumn when set", async () => {
        freshStore();
        const fb = await store.createFeedback(
          createInput({ sourceFile: "src/Button.tsx", sourceLine: 42, sourceColumn: 5 }),
        );
        expect(fb.sourceFile).toBe("src/Button.tsx");
        expect(fb.sourceLine).toBe(42);
        expect(fb.sourceColumn).toBe(5);
      });

      it("persists externalProvider / externalIssueId / externalIssueUrl when set", async () => {
        freshStore();
        const fb = await store.createFeedback(
          createInput({
            externalProvider: "github",
            externalIssueId: "123",
            externalIssueUrl: "https://github.com/x/y/issues/123",
          }),
        );
        expect(fb.externalProvider).toBe("github");
        expect(fb.externalIssueId).toBe("123");
        expect(fb.externalIssueUrl).toBe("https://github.com/x/y/issues/123");
      });
    });

    // ------------------------------------------------------------------
    // Screenshots
    // ------------------------------------------------------------------

    describe("screenshots", () => {
      const DATA_URL =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==";
      // 70-byte 1x1 red PNG. Exact bytes vary by encoder, so we assert shape not a specific hash.

      it("returns an empty list for a feedback with no screenshots", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        const list = await store.listScreenshots(fb.id);
        expect(list).toEqual([]);
      });

      it("attaches and lists a single screenshot", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        const record = await store.attachScreenshot(fb.id, DATA_URL);

        expect(record.feedbackId).toBe(fb.id);
        expect(record.id).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
        expect(record.byteSize).toBeGreaterThan(0);
        expect(record.createdAt).toBeInstanceOf(Date);
        expect(record.url).toContain(fb.id);
        expect(record.url).toContain(record.id);

        const list = await store.listScreenshots(fb.id);
        expect(list).toHaveLength(1);
        expect(list[0]?.id).toBe(record.id);
      });

      it("is idempotent on duplicate dataUrl — same id, same byteSize", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        const first = await store.attachScreenshot(fb.id, DATA_URL);
        const second = await store.attachScreenshot(fb.id, DATA_URL);

        expect(second.id).toBe(first.id);
        expect(second.byteSize).toBe(first.byteSize);

        const list = await store.listScreenshots(fb.id);
        expect(list).toHaveLength(1); // No duplicate entry.
      });

      it("scopes screenshots by feedbackId — one feedback's screenshot does not leak to another", async () => {
        freshStore();
        const a = await store.createFeedback(createInput());
        const b = await store.createFeedback(createInput());
        await store.attachScreenshot(a.id, DATA_URL);

        const listA = await store.listScreenshots(a.id);
        const listB = await store.listScreenshots(b.id);
        expect(listA).toHaveLength(1);
        expect(listB).toHaveLength(0);
      });

      it("rejects a malformed dataUrl", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput());
        await expect(store.attachScreenshot(fb.id, "not a data url")).rejects.toThrow();
        // Every impl must reject — exact message is implementation-defined.
      });
    });
  });
}
