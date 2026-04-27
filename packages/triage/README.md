# @colaborate/triage

LLM-driven triage worker for [Colaborate](https://github.com/Jabberwockyjib/colaborate). On session submit, reads the bundle, calls Anthropic to group feedbacks into one or more tracker issues, and writes them via a `TrackerAdapter` (e.g. [`@colaborate/integration-github`](../integration-github)).

Shipped in **Phase 5** (`v0.6.0-phase-5`).

## Install

```bash
npm install @colaborate/triage @colaborate/core @anthropic-ai/sdk
# plus a TrackerAdapter — currently only:
npm install @colaborate/integration-github
```

`@colaborate/core` is a peer dep. `@anthropic-ai/sdk` is a runtime dep.

## Quick start

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createColaborateHandler } from "@colaborate/adapter-prisma";
import { createGitHubAdapter } from "@colaborate/integration-github";
import { InProcessEventBus, TriageWorker } from "@colaborate/triage";

const trackerAdapter = createGitHubAdapter({
  token: process.env.GITHUB_TOKEN!,
  repo: process.env.COLABORATE_GITHUB_REPO!, // "owner/name"
});

const eventBus = new InProcessEventBus();

const worker = new TriageWorker({
  store,                                  // any ColaborateStore
  anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  trackerAdapter,
  eventBus,
  // optional:
  model: process.env.COLABORATE_TRIAGE_MODEL, // default "claude-sonnet-4-6"
});

worker.start(); // subscribe to session.submitted

export const { GET, POST, PATCH, DELETE, OPTIONS } = createColaborateHandler({
  store,
  eventBus,
  triage: worker,
});
```

When `submitSession` runs, the handler emits `session.submitted` on the event bus; the worker handles it fire-and-forget in the same Node process. No second deploy unit.

## Lifecycle and state machine

```
        ┌─────────────┐  submitSession   ┌─────────────┐
   ──▶  │  drafting   │  ─────────────▶  │  submitted  │
        └─────────────┘                  └──────┬──────┘
                                                │ triageSession
                                                ▼
                                ┌─────────┐  ✓  ┌─────────────┐
                                │ triaged │ ◀── │  (success)  │
                                └─────────┘     └─────────────┘
                                      ▲                │ ✗
                                      │  retry succeeds│
                                ┌─────┴─────┐          ▼
                                │  failed   │  ◀───────┘
                                └───────────┘
```

The store enforces this with `markSessionTriaged` / `markSessionFailed`. Only `submitted | failed → triaged | failed` transitions are allowed; anything else throws `StoreValidationError`.

`triageSession` is **idempotent**:

- If the session is already `triaged` (or in any non-{`submitted`, `failed`} state), it returns immediately without calling the LLM.
- On retry from `failed`, feedbacks that already have an `externalIssueUrl` are filtered out. If all feedbacks are already linked, the session is marked `triaged` without an LLM call.

## Failure modes

When triage fails, `markSessionFailed` records a `failureReason` with one of these `<source>:` prefixes:

| Prefix | Meaning |
|---|---|
| `anthropic: <msg>` | The Anthropic call threw, or returned no text content block. |
| `parse: <msg>` | The LLM output didn't parse, OR coverage validation failed (an input feedback id was dropped, duplicated, or an unknown id appeared in `relatedFeedbackIds`). |
| `github: created N of M, then: <msg>` | Partial progress. N issues were filed and linked back to feedbacks before the (N+1)th create or write-back failed. Retry will skip the already-linked feedbacks. |
| `session not found` | The session id passed to `triageSession` doesn't exist. |
| Plain status string | Caller invoked `triageSession` on a session in an unexpected state — the result echoes that state. |

Manual retry hits the failure trail forward: another `submitted | failed` attempt that succeeds clears the `failureReason` and flips status to `triaged`.

## Manual retry route

`createColaborateHandler({ triage: worker })` registers `POST /api/colaborate/sessions/:id/triage`. Calls `worker.triageSession(id)` synchronously (the caller waits for the Anthropic round-trip).

| Status | Meaning |
|---|---|
| 200 | Triage finished. Body: `{ status: "triaged" \| "failed", failureReason: string \| null }`. |
| 404 | No session with that id. |
| 409 | Session is in a non-{`submitted`, `failed`} state (e.g. still `drafting`). |
| 500 | Worker reported `failed`. Body includes `failureReason`. |
| 503 | No `triage` worker configured on the handler. |

## Prompt design

- The system block (`TRIAGE_SYSTEM_PROMPT`, ~3K tokens) carries the output contract and two worked few-shot examples. It's sent with `cache_control: { type: "ephemeral" }` so successive triages within a 5-minute window hit the prompt cache.
- The user message is deterministic JSON via `serializeBundle`. `geometryHint` turns each annotation's geometry into a short English phrase (e.g. `"rectangle covering 50% × 30% of the anchor"`) instead of raw fractions, which the model handles better.
- Output contract: a JSON array, no prose, no fences. `parseTriageOutput` is defensive — it extracts the outermost `[…]` even if the model wraps it.
- **Strict coverage validation:** every input feedback id must appear in exactly one issue's `relatedFeedbackIds`. Drops, duplicates, or unknown ids raise `TriageCoverageError` and the session goes to `failed`. Fail loud beats silent wrong-grouping.

## Event bus

`TriageEventBus` is the abstraction; `InProcessEventBus` is the only impl shipped with v0. The interface exists so polling, webhook, or queue impls can drop in later when a second deploy unit becomes worthwhile.

```ts
interface TriageEventBus {
  on<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void;
  off<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void;
  emit<E extends TriageEventName>(event: E, payload: TriageEvents[E]): void;
}

type TriageEvents = {
  "session.submitted": { sessionId: string };
};
```

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required** at construction. Triage is silently disabled if missing in `apps/demo`. |
| `COLABORATE_TRIAGE_MODEL` | `claude-sonnet-4-6` | Override via `model` option or env. |

The worker itself takes no env vars — `apps/demo/src/app/api/colaborate/route.ts` reads them and hands the worker concrete instances.

## Public exports

```ts
// Worker
export { TriageWorker, type TriageResult, type TriageWorkerOptions }

// Event bus
export { InProcessEventBus, type TriageEventBus, type TriageEventHandler,
         type TriageEventName, type TriageEvents }

// Parser
export { parseTriageOutput, TriageParseError, TriageCoverageError, type IssueDraft }

// Bundle helpers (for custom prompt templates)
export { loadSessionBundle, projectFeedback, serializeBundle, geometryHint,
         type BundleFeedbackInput }

// Prompt
export { TRIAGE_SYSTEM_PROMPT, buildTriagePrompt,
         type BuiltTriagePrompt, type TriageSystemBlock }
```

## Open follow-ups

- **Auto-retry on transient errors.** Current behavior is manual-retry only. Backoff for `anthropic: 429` / `github: 5xx` would close most failure classes without operator action.
- **Vision via per-screenshot MCP `blob` resources.** Triage currently sends screenshot URLs only; spec sanctions base64 inline.
- **Polling / webhook / queue event-bus impls.** Interface in place; only `InProcessEventBus` ships.
- **GitHub App auth.** PAT is single-tenant. The `TrackerAdapter` interface insulates the worker from the auth model, so the adapter swap is the only change needed.

## License

MIT.
