import type Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "@colaborate/adapter-memory";
import type { TrackerAdapter } from "@colaborate/core";
import { InProcessEventBus, TriageWorker } from "@colaborate/triage";
import { describe, expect, it, vi } from "vitest";
import { createColaborateHandler } from "../src/index.js";

function fakeAnthropic(text: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text" as const, text }],
        id: "x",
        model: "x",
        role: "assistant",
        stop_reason: "end_turn",
        stop_sequence: null,
        type: "message",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    },
  } as unknown as Anthropic;
}

function fakeAdapter(): TrackerAdapter & { createIssue: ReturnType<typeof vi.fn> } {
  const createIssue = vi.fn().mockResolvedValue({
    provider: "github",
    issueId: "1",
    issueUrl: "https://x/issues/1",
  });
  return {
    name: "github",
    createIssue,
    async updateIssue() {
      /* noop */
    },
    async linkResolve() {
      return { resolved: false };
    },
  };
}

describe("createColaborateHandler with triage", () => {
  it("end-to-end: POST /sessions/:id/submit fires triage → issue created → externalIssueUrl set → triaged", async () => {
    const store = new MemoryStore();
    const adapter = fakeAdapter();
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
    const anthropic = fakeAnthropic(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: [fb.id] }]));
    const bus = new InProcessEventBus();
    const triage = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: bus });
    triage.start();

    const handler = createColaborateHandler({ store, eventBus: bus, triage });
    const req = new Request(`https://x/api/colaborate/sessions/${session.id}/submit`, { method: "POST" });
    const res = await handler.POST(req);
    expect(res.status).toBe(200);

    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const s = await store.getSession(session.id);
        if (s?.status === "triaged" || s?.status === "failed") {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    const final = await store.getSession(session.id);
    expect(final?.status).toBe("triaged");
    expect(adapter.createIssue).toHaveBeenCalledOnce();

    const fbsOut = await store.getFeedbacks({ projectName: "p" });
    expect(fbsOut.feedbacks[0]?.externalIssueUrl).toBe("https://x/issues/1");
  });

  it("manual retry: POST /sessions/:id/triage on a failed session re-runs and triages", async () => {
    const store = new MemoryStore();
    const adapter = fakeAdapter();
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
    await store.markSessionFailed(session.id, "earlier failure");

    const anthropic = fakeAnthropic(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: [fb.id] }]));
    const bus = new InProcessEventBus();
    const triage = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: bus });
    triage.start();

    const handler = createColaborateHandler({ store, eventBus: bus, triage });
    const req = new Request(`https://x/api/colaborate/sessions/${session.id}/triage`, { method: "POST" });
    const res = await handler.POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("triaged");
  });

  it("submit without triage configured: status stays 'submitted', no errors", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });

    const handler = createColaborateHandler({ store });
    const req = new Request(`https://x/api/colaborate/sessions/${session.id}/submit`, { method: "POST" });
    const res = await handler.POST(req);
    expect(res.status).toBe(200);

    expect((await store.getSession(session.id))?.status).toBe("submitted");
  });
});
