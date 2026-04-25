# Phase 5 — Triage worker + GitHub adapter

**Date:** 2026-04-25
**Status:** Approved (brainstorming complete; awaiting plan)
**Closes spec items:** Phase 5 (`docs/superpowers/specs/2026-04-18-colaborate-design.md` lines 200–222, 275)
**Predecessors:** v0.5.1-phase-4b (commit `d096a7a`)

## Goal

Close the "submit → issue" loop. When a reviewer submits a Colaborate session, an LLM-driven triage worker reads the bundle, groups the feedbacks into 1..N actionable GitHub issues, files them, and writes the issue URLs back onto the related feedback records. After Phase 5, Colaborate is a complete one-way pipeline: reviewer draws → developer fixes.

## Non-goals

- Bidirectional sync (closing a GitHub issue does **not** resolve the feedback in v0; spec line 42).
- Linear adapter (Phase 6).
- GitHub App auth (PAT for v0; multi-tenant deferred).
- Background queues, polling workers, webhook delivery (interface allows swap; default is in-process fire-and-forget).
- Per-screenshot MCP `blob` resources for LLM vision (deferred — screenshots remain URL-only in the bundle).
- Widget UX changes — Phase 5 is purely backend.

## Decisions locked during brainstorming

| | Choice | Rationale |
|---|---|---|
| **Issue grouping** | LLM groups feedbacks into 1+ issues per session | Better signal-to-noise than 1-per-feedback; richer than 1-per-session. Per-feedback `externalIssueUrl` write-back stays meaningful. |
| **Model** | `claude-sonnet-4-6` (env-configurable via `COLABORATE_TRIAGE_MODEL`) | Sweet spot for structured-JSON-with-judgement. Haiku risks over-clustering; Opus is overkill. |
| **GitHub auth** | PAT via `GITHUB_TOKEN` env var | Single-tenant per install. Lowest OSS-user friction. App auth deferred. |
| **Trigger mechanism** | In-process, fire-and-forget, behind a `TriageEventBus` interface | No second deploy unit. Polling/webhook/queue impls drop in later without changing worker code. |
| **Crash recovery** | New session status `failed`; manual retry via `POST /sessions/:id/triage` | No automatic retry in v0. Stuck `submitted` sessions visible in `listSessions`. |
| **Coverage validation** | Fail loud if LLM drops or duplicates a feedbackId | Wrong-grouped issues are worse than a `failed` session. |
| **Write-back surface** | New dedicated `setFeedbackExternalIssue(id, {provider, issueId, issueUrl})` store method | Keeps existing `FeedbackUpdateInput` (status/resolvedAt) focused. |

## Architecture

```
                                        ┌─────────────────────────┐
  POST /api/colaborate/                  │  TriageEventBus         │
  sessions/:id/submit       ───┐         │  (in-process default)   │
                               │         └────────┬────────────────┘
                               ▼                  │ emit("session.submitted", {sessionId})
                  ┌────────────────────────┐      │
                  │  handleSubmitSession   │──────┘  (fire-and-forget)
                  │  (routes-sessions.ts)  │
                  └─────────┬──────────────┘
                            │ flips status → "submitted"
                            ▼
                  ┌─────────────────────────┐
                  │  TriageWorker           │ on("session.submitted")
                  │  (@colaborate/triage)   │
                  └─────────┬───────────────┘
                            │
                            │ 1. loadSessionBundle(store, id)
                            │ 2. anthropic.messages.create({system: cached, user: bundle})
                            │ 3. parseTriageOutput(text) → IssueDraft[]
                            │ 4. for each issue: trackerAdapter.createIssue()
                            │ 5. for each related feedback:
                            │    store.setFeedbackExternalIssue(id, {provider, issueId, issueUrl})
                            │ 6. store.markSessionTriaged(id)  (or markSessionFailed on any throw)
                            ▼
                  ┌─────────────────────────┐
                  │  TrackerAdapter         │ (interface in @colaborate/core)
                  │  └─ GitHubAdapter       │ ── REST → GitHub
                  │     (pkg integration-   │     POST /repos/{owner}/{repo}/issues
                  │      github)            │
                  └─────────────────────────┘
```

**Session status state machine** (existing `drafting | submitted | triaged | archived` extended with `failed`):

```
drafting ──submit──► submitted ──worker success──► triaged
                         │
                         └─worker fail──► failed ──manual retry──► (retry pipeline)
```

### Schema changes — additive only, no new tables

- `ColaborateSession.status` — adds `"failed"` to `SESSION_STATUSES` enum
- `ColaborateSession.failureReason` — **new nullable text column**, populated on `markSessionFailed`, cleared on `markSessionTriaged`. Visible in `SessionRecord` for debugging.
- `ColaborateFeedback.externalProvider` / `externalIssueId` / `externalIssueUrl` — already in schema since Phase 1b; Phase 5 just starts writing to them.

One small additive Prisma migration in `packages/adapter-prisma`. No data backfill required.

## Packages

### New: `@colaborate/triage`

```
packages/triage/
├── package.json          deps: @anthropic-ai/sdk, @colaborate/core
├── src/
│   ├── index.ts          public exports
│   ├── worker.ts         TriageWorker class
│   ├── event-bus.ts      TriageEventBus interface + InProcessEventBus impl
│   ├── prompt.ts         buildTriagePrompt(bundle) → {system, user}
│   ├── parse.ts          parseTriageOutput(text) → IssueDraft[]
│   ├── bundle.ts         loadSessionBundle(store, sessionId) → SessionBundle
│   └── prompts/
│       └── triage-system.md
└── __tests__/
```

**Public exports:**
- `TriageWorker` — `new TriageWorker({ store, anthropic, trackerAdapter, eventBus, model? })`. Methods: `start()`, `stop()`, `triageSession(sessionId): Promise<TriageResult>` (manual retry).
- `TriageEventBus`, `InProcessEventBus`
- `TriageResult`, `TriageError`, `TriageParseError`, `TriageCoverageError`
- `IssueDraft`, `SessionBundle`

### New: `@colaborate/integration-github`

```
packages/integration-github/
├── package.json          deps: @colaborate/core (peer)
├── src/
│   ├── index.ts          createGitHubAdapter(opts) → TrackerAdapter
│   ├── adapter.ts        TrackerAdapter implementation
│   └── client.ts         direct fetch wrapper (no Octokit)
└── __tests__/
```

**Public exports:**
- `createGitHubAdapter({ token, repo: "owner/name" }) → TrackerAdapter`
- `GitHubAdapterError extends Error` — `{ status: number, body: string }`

### Extended: `@colaborate/core`

1. **`TrackerAdapter` interface** + `IssueInput` / `IssueRef` / `IssuePatch` types:
   ```ts
   interface TrackerAdapter {
     readonly name: "github" | "linear";
     createIssue(input: IssueInput): Promise<IssueRef>;
     updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void>;
     linkResolve(ref: IssueRef): Promise<{ resolved: boolean }>;
   }
   ```
2. **New `ColaborateStore` methods:**
   - `setFeedbackExternalIssue(id, { provider, issueId, issueUrl }): Promise<FeedbackRecord>` — throws `StoreNotFoundError`.
   - `markSessionTriaged(id): Promise<SessionRecord>` — transitions from {`submitted`, `failed`} → `triaged`. Throws `StoreNotFoundError`. Throws `StoreValidationError` if current status ∉ {`submitted`, `failed`} (prevents double-triage of an already-`triaged` or `archived` session). Clears `failureReason` to null.
   - `markSessionFailed(id, reason: string): Promise<SessionRecord>` — transitions from {`submitted`, `failed`} → `failed` + persists `failureReason`. Same throw contract. (`failed → failed` is permitted so retry-then-fail-again works.)
3. **`SessionBundle` type** — `{ session: SessionRecord, feedbacks: FeedbackRecord[], screenshotsByFeedbackId: Record<string, ScreenshotRecord[]> }`.
4. **`SESSION_STATUSES`** extended with `"failed"`.

All 3 adapters (Memory, LocalStorage, Prisma) implement the new methods. Conformance suite in `core/src/testing.ts` extended.

### Extended: `@colaborate/adapter-prisma`

- `createColaborateHandler` gains `triage?: TriageWorker` and `eventBus?: TriageEventBus` options. When both provided, the handler subscribes the worker to the bus.
- New route: `POST /api/colaborate/sessions/:id/triage`
  - 409 if session status ∉ {`submitted`, `failed`}
  - For `failed`: re-runs the pipeline. Worker checks `feedback.externalIssueUrl` first — already-linked feedbacks are skipped, only unlinked ones produce issues.
  - For stuck `submitted`: same path.
  - 200 + updated `SessionRecord` on success; 500 + reason on worker failure (sync — manual retry is a synchronous call to `worker.triageSession(id)` so the user sees errors).
- `handleSubmitSession` calls `eventBus?.emit("session.submitted", { sessionId })` after the status flip.
- Prisma migration: adds `failureReason String?` column to `ColaborateSession`.

### Wiring (host app — `apps/demo/app/api/colaborate/route.ts`)

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createGitHubAdapter } from "@colaborate/integration-github";
import { TriageWorker, InProcessEventBus } from "@colaborate/triage";

const trackerAdapter = process.env.GITHUB_TOKEN && process.env.COLABORATE_GITHUB_REPO
  ? createGitHubAdapter({ token: process.env.GITHUB_TOKEN, repo: process.env.COLABORATE_GITHUB_REPO })
  : undefined;

const bus = new InProcessEventBus();
const triage = trackerAdapter && process.env.ANTHROPIC_API_KEY
  ? new TriageWorker({
      store,
      anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      trackerAdapter,
      eventBus: bus,
      ...(process.env.COLABORATE_TRIAGE_MODEL ? { model: process.env.COLABORATE_TRIAGE_MODEL } : {}),
    })
  : undefined;

if (triage) triage.start();

const handler = createColaborateHandler({ store, eventBus: bus, triage, /* ...existing opts */ });
```

All triage env vars optional. Missing any → triage skipped, session submit still works (status flips to `submitted` and stays there).

## Triage worker internals

### Anthropic call

```ts
const response = await this.anthropic.messages.create({
  model: this.model,
  max_tokens: 4096,
  system: [
    {
      type: "text",
      text: TRIAGE_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [
    { role: "user", content: serializeBundle(bundle) },
  ],
});
```

Cache always-on. ~3K cached tokens in the system prompt (template + JSON contract + few-shot examples). 5-min TTL — within a multi-session triage burst, every call after the first is a cache hit. Single-session deployments don't benefit from cross-call caching but the always-on policy costs nothing extra.

### System prompt template (`prompts/triage-system.md`)

Three blocks: role, output contract (JSON schema), grouping rules + body conventions, 2–3 worked few-shot examples. Full template authored during implementation.

### User message (`bundle.ts → serializeBundle`)

JSON, deterministic ordering:

```json
{
  "session": { "id": "...", "projectName": "parkland", "createdAt": "..." },
  "feedbacks": [
    {
      "id": "...",
      "message": "the price is cut off on mobile",
      "authorName": "Brian",
      "componentId": "PricingCard",
      "sourceFile": "components/pricing/Card.tsx",
      "sourceLine": 42,
      "shape": "rectangle",
      "geometryHint": "covers most of the .price div",
      "url": "https://parkland.dev/pricing",
      "viewport": "375x812",
      "screenshots": ["https://colaborate.dev/api/.../screenshots/abc123"]
    }
  ]
}
```

`geometryHint` is a short English phrase, not raw fractions. Geometry derivation lives in `bundle.ts` with unit tests for each shape.

### Output parsing (`parse.ts`)

1. Strip leading/trailing prose using regex finding the outermost `[…]` array.
2. `JSON.parse` — failure → `TriageParseError` with raw text.
3. Validate against Zod schema mirroring the contract.
4. Coverage check: every input `feedbackId` appears in exactly one issue's `relatedFeedbackIds`. Mismatch → `TriageCoverageError` (no partial-success — fail the session, surface to user via manual retry).

### Error handling

| Failure | Outcome | Status |
|---|---|---|
| Anthropic API error | Caught, `markSessionFailed(id, "anthropic: <msg>")` | `failed` |
| Parse / coverage error | Caught, `markSessionFailed(id, "parse: <msg>")` | `failed` |
| GitHub API error mid-batch | Persist `externalIssueUrl` for already-created issues; `markSessionFailed(id, "github: created N of M, then: <msg>")` | `failed` (partial) |
| Worker process crash | Session stuck on `submitted` (no retry). Visible in `listSessions(status="submitted")`. | `submitted` (stuck) |
| Concurrent `triageSession()` call | Idempotent: re-fetch status, abort if not in {`submitted`, `failed`}. | unchanged |

### Manual retry

`POST /api/colaborate/sessions/:id/triage` calls `worker.triageSession(id)` synchronously (so caller sees errors). Worker:
- Re-runs Anthropic call from scratch (no caching of LLM output across retries — the bundle may have changed if feedbacks were edited).
- Per-feedback skip: if `feedback.externalIssueUrl != null`, exclude from the LLM input. Only unlinked feedbacks become new issues. (Avoids duplicate issues on a partial-failure retry.)
- If all feedbacks are already linked, immediately `markSessionTriaged` and return.

## GitHub adapter internals

### Client

Direct `fetch`, two endpoints, ~80 LOC:

```ts
POST   https://api.github.com/repos/{owner}/{name}/issues
PATCH  https://api.github.com/repos/{owner}/{name}/issues/{number}
```

Headers: `Authorization: Bearer ${token}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.

Errors → `GitHubAdapterError` with `status` + raw response body.

### Adapter

Maps `TrackerAdapter` interface to client calls. `linkResolve` returns `{ resolved: false }` always in v0 (interface compatibility for Phase 6+).

## Testing

| Layer | Approach |
|---|---|
| Triage worker | Real `MemoryStore`, `vi.spyOn(anthropic.messages, "create")` returning fixture JSON |
| Prompt parsing | Table-driven: clean JSON, fenced JSON, JSON with prose, malformed JSON, coverage mismatch |
| Bundle geometry hints | Unit tests per shape (`rectangle → "covers..."` etc.) |
| GitHub adapter | `vi.spyOn(globalThis, "fetch")` — happy + 401/404/422/network/provider-mismatch |
| Store conformance | `core/src/testing.ts` extended for `setFeedbackExternalIssue`, `markSessionTriaged`, `markSessionFailed`. Auto-runs against all 3 adapters. |
| HTTP routes | `routes-sessions.ts` test for `POST /sessions/:id/triage` — 200 / 409 / 500 paths |
| Integration | Real `MemoryStore` + spy on `trackerAdapter.createIssue` → submit a session → assert issue created + `externalIssueUrl` set + session `triaged` |

**Skipped:** Playwright E2E. Phase 5 has no widget surface.

**Expected test count:** ~1128 → ~1180+ (triage worker + GitHub adapter + conformance + route handler + integration).

## Configuration

| Env var | Required? | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | If using triage | — | Worker → Claude |
| `GITHUB_TOKEN` | If using triage | — | Worker → GitHub |
| `COLABORATE_GITHUB_REPO` | If using triage | — | `owner/name` issue target |
| `COLABORATE_TRIAGE_MODEL` | No | `claude-sonnet-4-6` | Override model |

If any of the first three are missing, triage is silently skipped — session submit still works, status stays `submitted`.

## Success criteria

1. Reviewer drafts session w/ N feedbacks → submits → 1+ GitHub issues appear at the configured repo within ~10 seconds.
2. Each related feedback has `externalIssueUrl` pointing at its issue.
3. Session status flips `submitted → triaged` on success, `submitted → failed` on any worker error with reason captured in `failureReason`.
4. `POST /sessions/:id/triage` resumes correctly from `failed`, skipping already-linked feedbacks.
5. All gates green: `bun run build`, `bun run check`, `bun run test:run` (~1180+), `bun run lint`.
6. Manual smoke test against real GitHub before Phase 7 dogfood.

## Deferred to Phase 6+

- Linear adapter (Phase 6) — drops in beside `integration-github`, same `TrackerAdapter` interface
- Bidirectional sync (issue closed → feedback resolved) — explicitly excluded per master spec line 42
- Polling / webhook / queue event-bus implementations (interface exists, no impls beyond `InProcessEventBus`)
- Per-screenshot MCP `blob` resources for LLM vision (Phase 4b chip #2)
- GitHub App auth (PAT sufficient for v0; app auth if multi-tenant materializes)
- Per-screenshot embedding in user message (URL-only for now to keep context windows sane)
- Auto-retry on transient errors (manual retry only in v0)

## Open items at end of brainstorm

None blocking. Few-shot example wording will be authored during implementation; not a design decision.
