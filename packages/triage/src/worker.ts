import type Anthropic from "@anthropic-ai/sdk";
import type { ColaborateStore, IssueRef, TrackerAdapter } from "@colaborate/core";
import { projectFeedback, serializeBundle } from "./bundle.js";
import type { TriageEventBus, TriageEventHandler } from "./event-bus.js";
import { type IssueDraft, parseTriageOutput } from "./parse.js";
import { TRIAGE_SYSTEM_PROMPT } from "./prompt.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface TriageWorkerOptions {
  store: ColaborateStore;
  anthropic: Anthropic;
  trackerAdapter: TrackerAdapter;
  eventBus: TriageEventBus;
  /** Override the Anthropic model. Defaults to `claude-sonnet-4-6`. */
  model?: string;
}

/**
 * Outcome of a triage attempt. Either `triaged` (everything worked) or `failed`
 * (with a `failureReason` of the form `<source>: <details>`).
 */
export interface TriageResult {
  status: "triaged" | "failed";
  failureReason: string | null;
}

/**
 * The triage worker. Subscribes to `session.submitted` on the event bus; runs
 * `triageSession` synchronously when called directly (used by the manual retry
 * HTTP route). Idempotent: repeated calls on a session that's already triaged
 * (or in any non-{submitted,failed} state) abort cleanly.
 */
export class TriageWorker {
  private store: ColaborateStore;
  private anthropic: Anthropic;
  private trackerAdapter: TrackerAdapter;
  private eventBus: TriageEventBus;
  private model: string;
  private busHandler: TriageEventHandler<"session.submitted"> | null = null;

  constructor(opts: TriageWorkerOptions) {
    this.store = opts.store;
    this.anthropic = opts.anthropic;
    this.trackerAdapter = opts.trackerAdapter;
    this.eventBus = opts.eventBus;
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  /** Subscribe to `session.submitted` so `submitSession` triggers triage automatically. */
  start(): void {
    if (this.busHandler) return;
    this.busHandler = (payload: { sessionId: string }) => {
      void this.triageSession(payload.sessionId).catch((err) => {
        console.error(`[colaborate/triage] uncaught in event handler for ${payload.sessionId}:`, err);
      });
    };
    this.eventBus.on("session.submitted", this.busHandler);
  }

  /** Unsubscribe. Safe to call when not started. */
  stop(): void {
    if (this.busHandler) {
      this.eventBus.off("session.submitted", this.busHandler);
      this.busHandler = null;
    }
  }

  /**
   * Run triage on a session. Idempotent — aborts if status is not in
   * {`submitted`, `failed`}. Returns the outcome (status + failureReason).
   *
   * On retry from `failed`, already-linked feedbacks are excluded from the LLM
   * input. If all feedbacks are already linked, immediately marks triaged
   * without calling the LLM.
   */
  async triageSession(sessionId: string): Promise<TriageResult> {
    const session = await this.store.getSession(sessionId);
    if (!session) return { status: "failed", failureReason: "session not found" };
    if (session.status !== "submitted" && session.status !== "failed") {
      return {
        status: session.status === "triaged" ? "triaged" : "failed",
        failureReason: session.failureReason,
      };
    }

    const all = await this.store.getFeedbacks({ projectName: session.projectName });
    const sessionFeedbacks = all.feedbacks.filter((f) => f.sessionId === sessionId);
    const unlinked = sessionFeedbacks.filter((f) => !f.externalIssueUrl);

    if (sessionFeedbacks.length === 0) {
      const updated = await this.store.markSessionTriaged(sessionId);
      return { status: "triaged", failureReason: updated.failureReason };
    }

    if (unlinked.length === 0) {
      const updated = await this.store.markSessionTriaged(sessionId);
      return { status: "triaged", failureReason: updated.failureReason };
    }

    // ----- Step 1: Anthropic call -----
    let llmText: string;
    try {
      const projected = await Promise.all(
        unlinked.map(async (fb) => projectFeedback(fb, await this.store.listScreenshots(fb.id))),
      );
      const userText = serializeBundle({ session, feedbacks: projected });
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: [{ type: "text", text: TRIAGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        return await this.fail(sessionId, "anthropic: response had no text content block");
      }
      llmText = block.text;
    } catch (err) {
      return await this.fail(sessionId, `anthropic: ${errorMsg(err)}`);
    }

    // ----- Step 2: parse + coverage -----
    let issues: IssueDraft[];
    try {
      issues = parseTriageOutput(
        llmText,
        unlinked.map((f) => f.id),
      );
    } catch (err) {
      return await this.fail(sessionId, `parse: ${errorMsg(err)}`);
    }

    // ----- Step 3: createIssue per issue, write back per related id -----
    let created = 0;
    for (const issue of issues) {
      let ref: IssueRef;
      try {
        ref = await this.trackerAdapter.createIssue({
          title: issue.title,
          body: issue.body,
          ...(issue.labels !== undefined ? { labels: issue.labels } : {}),
        });
      } catch (err) {
        return await this.fail(sessionId, `github: created ${created} of ${issues.length}, then: ${errorMsg(err)}`);
      }
      created++;
      for (const fbId of issue.relatedFeedbackIds) {
        try {
          await this.store.setFeedbackExternalIssue(fbId, {
            provider: ref.provider,
            issueId: ref.issueId,
            issueUrl: ref.issueUrl,
          });
        } catch (err) {
          return await this.fail(
            sessionId,
            `github: created ${created} of ${issues.length}, then write-back failed: ${errorMsg(err)}`,
          );
        }
      }
    }

    const updated = await this.store.markSessionTriaged(sessionId);
    return { status: "triaged", failureReason: updated.failureReason };
  }

  private async fail(sessionId: string, reason: string): Promise<TriageResult> {
    try {
      const updated = await this.store.markSessionFailed(sessionId, reason);
      return { status: "failed", failureReason: updated.failureReason };
    } catch (err) {
      console.error(`[colaborate/triage] markSessionFailed itself failed for ${sessionId}:`, err);
      return { status: "failed", failureReason: reason };
    }
  }
}

function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
