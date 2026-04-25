import type Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "@colaborate/adapter-memory";
import type { TrackerAdapter } from "@colaborate/core";
import { InProcessEventBus, TriageWorker } from "@colaborate/triage";
import { describe, expect, it, vi } from "vitest";
import { handleTriageSession, matchSessionRoute } from "../src/routes-sessions.js";

function makeAdapter(): TrackerAdapter {
  return {
    name: "github",
    async createIssue(input) {
      return { provider: "github", issueId: "1", issueUrl: `https://x/issues/1#${input.title.slice(0, 3)}` };
    },
    async updateIssue() {
      /* noop */
    },
    async linkResolve() {
      return { resolved: false };
    },
  };
}

function fakeAnthropic(text: string) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text" as const, text }],
    id: "x",
    model: "x",
    role: "assistant",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  return { messages: { create } } as unknown as Anthropic;
}

describe("matchSessionRoute — triage kind", () => {
  it("matches POST /api/colaborate/sessions/:id/triage", () => {
    expect(matchSessionRoute("/api/colaborate/sessions/abc/triage", "POST")).toEqual({ kind: "triage", id: "abc" });
  });

  it("does not match GET on the triage path", () => {
    expect(matchSessionRoute("/api/colaborate/sessions/abc/triage", "GET")).toBeNull();
  });
});

describe("handleTriageSession", () => {
  it("returns 200 + updated SessionRecord on success", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    const fb = await store.createFeedback({
      projectName: "p",
      type: "bug",
      message: "x",
      status: "draft",
      url: "https://x",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "A",
      authorEmail: "a@x",
      clientId: "c1",
      sessionId: session.id,
      annotations: [],
    });
    await store.submitSession(session.id);
    const adapter = makeAdapter();
    const anthropic = fakeAnthropic(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: [fb.id] }]));
    const worker = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: new InProcessEventBus() });

    const res = await handleTriageSession(store, session.id, worker);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("triaged");
  });

  it("returns 409 when session status is 'drafting'", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    const adapter = makeAdapter();
    const worker = new TriageWorker({
      store,
      anthropic: fakeAnthropic("[]"),
      trackerAdapter: adapter,
      eventBus: new InProcessEventBus(),
    });

    const res = await handleTriageSession(store, session.id, worker);
    expect(res.status).toBe(409);
  });

  it("returns 404 when session does not exist", async () => {
    const store = new MemoryStore();
    const adapter = makeAdapter();
    const worker = new TriageWorker({
      store,
      anthropic: fakeAnthropic("[]"),
      trackerAdapter: adapter,
      eventBus: new InProcessEventBus(),
    });

    const res = await handleTriageSession(store, "nope", worker);
    expect(res.status).toBe(404);
  });

  it("returns 500 when worker reports failed status", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    await store.createFeedback({
      projectName: "p",
      type: "bug",
      message: "x",
      status: "draft",
      url: "https://x",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "A",
      authorEmail: "a@x",
      clientId: "c2",
      sessionId: session.id,
      annotations: [],
    });
    await store.submitSession(session.id);
    const adapter = makeAdapter();
    const anthropic = fakeAnthropic("not json at all");
    const worker = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: new InProcessEventBus() });

    const res = await handleTriageSession(store, session.id, worker);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/parse:/i);
  });

  it("returns 503 when no worker is configured", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    await store.submitSession(session.id);

    const res = await handleTriageSession(store, session.id, null);
    expect(res.status).toBe(503);
  });
});
