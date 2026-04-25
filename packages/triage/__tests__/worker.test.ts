import type Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "@colaborate/adapter-memory";
import type { TrackerAdapter } from "@colaborate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InProcessEventBus } from "../src/event-bus.js";
import { TriageWorker } from "../src/worker.js";

function makeStubAdapter(): TrackerAdapter & {
  createIssue: ReturnType<typeof vi.fn>;
  updateIssue: ReturnType<typeof vi.fn>;
  linkResolve: ReturnType<typeof vi.fn>;
} {
  return {
    name: "github",
    createIssue: vi.fn().mockImplementation(async (input: { title: string }) => ({
      provider: "github" as const,
      issueId: `${Math.floor(Math.random() * 1000)}`,
      issueUrl: `https://x/issues/${input.title.slice(0, 5)}`,
    })),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    linkResolve: vi.fn().mockResolvedValue({ resolved: false }),
  };
}

function makeAnthropicSpy() {
  const create = vi.fn();
  return { messages: { create } } as unknown as Anthropic;
}

async function seedSubmittedSession(store: MemoryStore, count = 3) {
  const session = await store.createSession({ projectName: "p" });
  const fbs = [];
  for (let i = 0; i < count; i++) {
    fbs.push(
      await store.createFeedback({
        projectName: "p",
        type: "bug",
        message: `m${i}`,
        status: "draft",
        url: "https://x",
        viewport: "1280x720",
        userAgent: "ua",
        authorName: `A${i}`,
        authorEmail: `a${i}@x`,
        clientId: `c-${i}`,
        sessionId: session.id,
        annotations: [],
      }),
    );
  }
  await store.submitSession(session.id);
  return { session: await store.getSession(session.id), feedbacks: fbs };
}

function fakeAnthropicResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    id: "msg_x",
    model: "claude-sonnet-4-6",
    role: "assistant",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

describe("TriageWorker", () => {
  let store: MemoryStore;
  let adapter: ReturnType<typeof makeStubAdapter>;
  let anthropic: Anthropic;
  let bus: InProcessEventBus;
  let worker: TriageWorker;

  beforeEach(() => {
    store = new MemoryStore();
    adapter = makeStubAdapter();
    anthropic = makeAnthropicSpy();
    bus = new InProcessEventBus();
    worker = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: bus });
    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it("triageSession: happy path → creates issues + sets externalIssueUrl + flips to triaged", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 3);
    const ids = feedbacks.map((f) => f.id);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(
        JSON.stringify([
          { title: "Group A", body: "B", relatedFeedbackIds: ids.slice(0, 2) },
          { title: "Single B", body: "B", relatedFeedbackIds: ids.slice(2) },
        ]),
      ),
    );

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("triaged");
    expect(adapter.createIssue).toHaveBeenCalledTimes(2);

    const updated = await store.getSession(session!.id);
    expect(updated?.status).toBe("triaged");
    expect(updated?.failureReason).toBeNull();

    const fbsOut = await store.getFeedbacks({ projectName: "p" });
    for (const id of ids) {
      const fb = fbsOut.feedbacks.find((f) => f.id === id);
      expect(fb?.externalProvider).toBe("github");
      expect(fb?.externalIssueUrl).toMatch(/^https:\/\/x\/issues\//);
    }
  });

  it("triageSession: anthropic API error → markSessionFailed with 'anthropic:' reason", async () => {
    const { session } = await seedSubmittedSession(store, 1);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("rate limit"));

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toMatch(/^anthropic:/i);

    const updated = await store.getSession(session!.id);
    expect(updated?.status).toBe("failed");
  });

  it("triageSession: parse error → markSessionFailed with 'parse:' reason", async () => {
    const { session } = await seedSubmittedSession(store, 1);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse("Sorry, I can't help with that."),
    );

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toMatch(/^parse:/i);
  });

  it("triageSession: github error mid-batch → markSessionFailed with 'github: created N of M' + partial writes preserved", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 3);
    const ids = feedbacks.map((f) => f.id);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(
        JSON.stringify([
          { title: "T1", body: "B", relatedFeedbackIds: [ids[0]!] },
          { title: "T2", body: "B", relatedFeedbackIds: [ids[1]!, ids[2]!] },
        ]),
      ),
    );
    adapter.createIssue
      .mockImplementationOnce(async () => ({ provider: "github", issueId: "1", issueUrl: "https://x/issues/1" }))
      .mockImplementationOnce(async () => {
        throw new Error("502 Bad Gateway");
      });

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toMatch(/^github: created 1 of 2/i);

    const fbsOut = await store.getFeedbacks({ projectName: "p" });
    expect(fbsOut.feedbacks.find((f) => f.id === ids[0])?.externalIssueUrl).toBe("https://x/issues/1");
    expect(fbsOut.feedbacks.find((f) => f.id === ids[1])?.externalIssueUrl).toBeNull();
  });

  it("triageSession: idempotent — second call when status is 'triaged' aborts cleanly", async () => {
    const { session } = await seedSubmittedSession(store, 1);
    const ids = [(await store.getFeedbacks({ projectName: "p" })).feedbacks[0]!.id];
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeAnthropicResponse(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ids }])),
    );
    await worker.triageSession(session!.id);

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("triaged");
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it("triageSession: retry-from-failed skips already-linked feedbacks", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 3);
    const ids = feedbacks.map((f) => f.id);

    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(
        JSON.stringify([
          { title: "T1", body: "B", relatedFeedbackIds: [ids[0]!] },
          { title: "T2", body: "B", relatedFeedbackIds: [ids[1]!, ids[2]!] },
        ]),
      ),
    );
    adapter.createIssue
      .mockImplementationOnce(async () => ({ provider: "github", issueId: "1", issueUrl: "https://x/issues/1" }))
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      });
    await worker.triageSession(session!.id);
    expect((await store.getSession(session!.id))?.status).toBe("failed");

    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(JSON.stringify([{ title: "Retry", body: "B", relatedFeedbackIds: [ids[1]!, ids[2]!] }])),
    );
    adapter.createIssue.mockImplementationOnce(async () => ({
      provider: "github",
      issueId: "2",
      issueUrl: "https://x/issues/2",
    }));
    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("triaged");
    expect(adapter.createIssue).toHaveBeenCalledTimes(3);

    const fbsOut = await store.getFeedbacks({ projectName: "p" });
    expect(fbsOut.feedbacks.find((f) => f.id === ids[1])?.externalIssueUrl).toBe("https://x/issues/2");
  });

  it("triageSession: all feedbacks already linked → markSessionTriaged immediately, no LLM call", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 2);
    const ids = feedbacks.map((f) => f.id);
    for (const id of ids) {
      await store.setFeedbackExternalIssue(id, { provider: "github", issueId: "1", issueUrl: "https://x/issues/1" });
    }
    await store.markSessionFailed(session!.id, "earlier");

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("triaged");
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(adapter.createIssue).not.toHaveBeenCalled();
  });

  it("event bus subscription: emit('session.submitted') triggers triageSession", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 1);
    const ids = feedbacks.map((f) => f.id);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ids }])),
    );

    const triagePromise = new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const s = await store.getSession(session!.id);
        if (s?.status === "triaged") {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });
    bus.emit("session.submitted", { sessionId: session!.id });
    await triagePromise;

    expect((await store.getSession(session!.id))?.status).toBe("triaged");
  });

  it("uses default model 'claude-sonnet-4-6' when not overridden", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 1);
    const ids = feedbacks.map((f) => f.id);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ids }])),
    );
    await worker.triageSession(session!.id);
    const args = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { model: string };
    expect(args.model).toBe("claude-sonnet-4-6");
  });

  it("respects model override", async () => {
    worker.stop();
    worker = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: bus, model: "claude-haiku-4-5" });
    worker.start();
    const { session, feedbacks } = await seedSubmittedSession(store, 1);
    const ids = feedbacks.map((f) => f.id);
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ids }])),
    );
    await worker.triageSession(session!.id);
    const args = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { model: string };
    expect(args.model).toBe("claude-haiku-4-5");
  });
});
