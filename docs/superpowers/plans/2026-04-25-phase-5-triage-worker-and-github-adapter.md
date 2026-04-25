# Phase 5 — Triage Worker + GitHub Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "submit → issue" loop. When a Colaborate session is submitted, an LLM-driven triage worker reads the session bundle, groups feedbacks into 1+ GitHub issues, files them, and writes the issue URLs back onto the related feedbacks.

**Architecture:** Two new packages (`@colaborate/triage`, `@colaborate/integration-github`) + extensions to `@colaborate/core` (TrackerAdapter interface, 3 store methods, SessionBundle type) + extensions to `@colaborate/adapter-prisma` (handler opts, manual retry route, additive Prisma migration). Trigger: in-process fire-and-forget via a swappable `TriageEventBus` interface. All triage env vars optional — missing → triage skipped, submit still works.

**Tech Stack:** TypeScript (strict, exactOptionalPropertyTypes), Bun workspaces, Turborepo, tsup, Vitest, Zod, `@anthropic-ai/sdk` (new dep), Prisma (existing). No Octokit (direct fetch).

**Spec:** `docs/superpowers/specs/2026-04-25-phase-5-triage-worker-and-github-adapter.md` (commit `20da35d`)

---

## File map

### New files

| Path | Purpose |
|---|---|
| `packages/triage/package.json` | Bun workspace manifest |
| `packages/triage/tsconfig.json` | TS config |
| `packages/triage/tsup.config.ts` | Bundle config (mirrors mcp-server) |
| `packages/triage/src/index.ts` | Public exports |
| `packages/triage/src/event-bus.ts` | `TriageEventBus` interface + `InProcessEventBus` impl |
| `packages/triage/src/parse.ts` | `parseTriageOutput(text) → IssueDraft[]`, `TriageParseError`, `TriageCoverageError` |
| `packages/triage/src/bundle.ts` | `loadSessionBundle(store, sessionId)` + `geometryHint(geometryJson)` + `serializeBundle(bundle)` |
| `packages/triage/src/prompt.ts` | `buildTriagePrompt(bundle)` + `TRIAGE_SYSTEM_PROMPT` constant |
| `packages/triage/src/prompts/triage-system.md` | Cached system prompt template |
| `packages/triage/src/worker.ts` | `TriageWorker` class |
| `packages/triage/__tests__/event-bus.test.ts` | unit |
| `packages/triage/__tests__/parse.test.ts` | unit (table-driven) |
| `packages/triage/__tests__/bundle.test.ts` | unit (geometry hints + serialize + load) |
| `packages/triage/__tests__/prompt.test.ts` | unit (prompt build + cache_control shape) |
| `packages/triage/__tests__/worker.test.ts` | unit (with real MemoryStore + spied SDK + spied adapter) |
| `packages/integration-github/package.json` | Bun workspace manifest |
| `packages/integration-github/tsconfig.json` | TS config |
| `packages/integration-github/tsup.config.ts` | Bundle config |
| `packages/integration-github/src/index.ts` | Public exports |
| `packages/integration-github/src/client.ts` | `createGitHubClient` (direct fetch wrapper) |
| `packages/integration-github/src/adapter.ts` | `createGitHubAdapter` returning `TrackerAdapter` + `GitHubAdapterError` |
| `packages/integration-github/__tests__/client.test.ts` | unit (fetch spy) |
| `packages/integration-github/__tests__/adapter.test.ts` | unit (fetch spy + provider mismatch) |
| `packages/adapter-prisma/__tests__/routes-triage.test.ts` | unit (manual retry route 200/409/500) |
| `packages/adapter-prisma/__tests__/handler-triage.test.ts` | integration (real MemoryStore + spied adapter, end-to-end) |

### Modified files

| Path | Change |
|---|---|
| `packages/core/src/types.ts` | Add `"failed"` to `SESSION_STATUSES`, `failureReason: string \| null` to `SessionRecord` + `SessionResponse`, `TrackerAdapter` interface + `IssueInput`/`IssueRef`/`IssuePatch` types, `SessionBundle` type, 3 new methods on `ColaborateStore` interface, `TriageError` base class |
| `packages/core/src/index.ts` | Export new types/classes |
| `packages/core/src/schema.ts` | Add `failureReason: { type: "String", optional: true, nativeType: "Text" }` to `ColaborateSession` |
| `packages/core/src/testing.ts` | Add conformance tests for `setFeedbackExternalIssue`, `markSessionTriaged`, `markSessionFailed` |
| `packages/adapter-memory/src/index.ts` | Implement 3 new methods, init `failureReason: null` on createSession |
| `packages/adapter-localstorage/src/index.ts` | Implement 3 new methods, init `failureReason: null` on createSession |
| `packages/adapter-prisma/src/index.ts` | Implement 3 new methods, extend `HandlerOptions` with `triage?` + `eventBus?`, dispatch `POST /sessions/:id/triage` route |
| `packages/adapter-prisma/src/routes-sessions.ts` | Emit `session.submitted` after status flip, add `handleTriageSession` handler + `triage` route kind |
| `packages/adapter-prisma/src/validation.ts` | Add `sessionListQuerySchema` enum extension to include `"failed"` |
| `packages/adapter-prisma/package.json` | Add `@colaborate/triage` peer/dev dep for type imports (peer for runtime injection) |
| `apps/demo/app/api/colaborate/route.ts` | Wire `createGitHubAdapter` + `TriageWorker` + `InProcessEventBus` from env vars |
| `apps/demo/package.json` | Add `@colaborate/triage` + `@colaborate/integration-github` + `@anthropic-ai/sdk` deps |
| `package.json` (root) | Confirm Turbo picks up new packages (no edits expected — `workspaces: ["packages/*", "apps/*"]`) |
| `bun.lock` | Regenerated by `bun install` after package.json edits |
| `status.md` | Document Phase 5 completion at end |
| `todo.md` | Move Phase 5 from "Next Up" to "Completed This Session" |

---

## Build sequence

Tasks are organized so each is independently committable and testable. Where two tasks have no dependency they're noted as parallelizable (the subagent driver can dispatch them concurrently in different worktrees if desired).

```
Task 1 (core: SESSION_STATUSES + failureReason + SessionRecord)
  ↓
Task 2 (core: TrackerAdapter interface + IssueInput types + SessionBundle)
  ↓
Task 3 (core: 3 new store methods on ColaborateStore interface)
  ↓
Task 4 (core: conformance tests for 3 new methods) ──→ FAILS (no impl)
  ↓
Task 5 (memory adapter impl)         ──→ Task 4 conformance for memory passes
Task 6 (localstorage adapter impl)   ──→ Task 4 conformance for localstorage passes  [parallel with 5, 7]
Task 7 (prisma adapter impl)         ──→ Task 4 conformance for prisma passes        [parallel with 5, 6]
  ↓
Task 8 (integration-github: package skeleton)                                         [parallel with 11]
Task 9 (integration-github: client.ts + tests)
Task 10 (integration-github: adapter.ts + tests)
  ↓
Task 11 (triage: package skeleton)                                                    [parallel with 8]
Task 12 (triage: event-bus.ts + tests)
Task 13 (triage: parse.ts + tests)
Task 14 (triage: bundle.ts geometry hint + tests)
Task 15 (triage: bundle.ts loadSessionBundle + serializeBundle + tests)
Task 16 (triage: prompt.ts + system prompt + tests)
Task 17 (triage: worker.ts + tests)
  ↓
Task 18 (adapter-prisma: extend HandlerOptions, emit session.submitted, manual retry route + tests)
  ↓
Task 19 (apps/demo: wire it all)
  ↓
Task 20 (status.md + todo.md + final gates)
```

---

## Conventions baked into every task

- **Working directory** is the repo root: `/Users/brian/dev/colaborate/.claude/worktrees/objective-napier-bacb75/`
- **TDD:** every task writes tests first, runs them red, implements, runs them green, commits.
- **Test runner:** `bun run test:run -- <path>` for one file, `bun run test:run` for all 1128+.
- **Lint+typecheck after each impl:** `bun run lint && bun run check`. If lint fails, run `bun run lint:fix`. If still failing, fix manually before commit.
- **Conventional Commits:** scope = the package or area (`feat(core): ...`, `feat(triage): ...`, `feat(integration-github): ...`, `feat(adapter-prisma): ...`, `feat(demo): ...`, `docs: ...`).
- **Don't mock the database** — use `MemoryStore` for "in-memory" tests; use `vi.spyOn` only for external boundaries (Anthropic SDK, `globalThis.fetch`, the `TrackerAdapter` interface in worker tests).
- **`exactOptionalPropertyTypes`** is on. Never write `{ foo: undefined }` literally — spread conditionally: `...(value !== undefined ? { foo: value } : {})`.
- **Zod namespace import** required — see `packages/adapter-prisma/src/validation.ts:5-10`. Reuse the same pattern verbatim.
- **No Octokit, no nock** — direct `fetch` + `vi.spyOn(globalThis, "fetch")`.
- **Bun install** after every `package.json` change so workspace symlinks update before next test run.

---

### Task 1: Core — extend SESSION_STATUSES + SessionRecord with `failed` + `failureReason`

**Files:**
- Modify: `packages/core/src/types.ts` (SESSION_STATUSES, SessionRecord, SessionResponse)
- Modify: `packages/core/src/schema.ts` (`ColaborateSession` model — add `failureReason`)
- Test: `packages/core/__tests__/types-session-failed.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/core/__tests__/types-session-failed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SESSION_STATUSES, COLABORATE_MODELS } from "../src/index.js";

describe("Phase 5 schema additions", () => {
  it("SESSION_STATUSES includes 'failed'", () => {
    expect(SESSION_STATUSES).toContain("failed");
  });

  it("SESSION_STATUSES retains existing values + 'failed' (no removals)", () => {
    expect([...SESSION_STATUSES].sort()).toEqual(
      ["archived", "drafting", "failed", "submitted", "triaged"].sort(),
    );
  });

  it("ColaborateSession schema has optional failureReason text field", () => {
    const session = COLABORATE_MODELS.ColaborateSession;
    expect(session.fields).toHaveProperty("failureReason");
    const f = session.fields.failureReason as { type: string; optional: boolean; nativeType?: string };
    expect(f.type).toBe("String");
    expect(f.optional).toBe(true);
    expect(f.nativeType).toBe("Text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/core/__tests__/types-session-failed.test.ts`
Expected: FAIL — `SESSION_STATUSES does not contain "failed"` AND `failureReason` not on schema.

- [ ] **Step 3: Add `"failed"` to SESSION_STATUSES**

In `packages/core/src/types.ts`, find:
```ts
export const SESSION_STATUSES = ["drafting", "submitted", "triaged", "archived"] as const;
```
Replace with:
```ts
/** Review session lifecycle. `drafting` is the widget's local session; `submitted` is posted to the server; `triaged` means the triage worker has processed it; `failed` means the triage worker errored and the session needs manual retry; `archived` is a soft delete. */
export const SESSION_STATUSES = ["drafting", "submitted", "triaged", "failed", "archived"] as const;
```

- [ ] **Step 4: Add `failureReason` to SessionRecord and SessionResponse**

In `packages/core/src/types.ts`, find the `SessionRecord` interface and add `failureReason: string | null;` after `notes`:

```ts
export interface SessionRecord {
  id: string;
  projectName: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: SessionStatus;
  submittedAt: Date | null;
  triagedAt: Date | null;
  notes: string | null;
  /** Populated by the triage worker on `markSessionFailed`. Cleared on `markSessionTriaged`. */
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Same for `SessionResponse`:
```ts
export interface SessionResponse {
  id: string;
  projectName: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: SessionStatus;
  submittedAt: string | null;
  triagedAt: string | null;
  notes: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 5: Add `failureReason` to schema**

In `packages/core/src/schema.ts`, find the `ColaborateSession.fields` block. Add `failureReason` between `notes` and `createdAt`:

```ts
notes: { type: "String", optional: true, nativeType: "Text" },
failureReason: { type: "String", optional: true, nativeType: "Text" },
createdAt: { type: "DateTime", default: "now()" },
```

- [ ] **Step 6: Run new test → green; existing tests stay green**

Run: `bun run test:run -- packages/core/__tests__/types-session-failed.test.ts`
Expected: PASS (3 tests).

Run: `bun run test:run`
Expected: 1131 passing (1128 + 3 new). Existing tests unaffected.

Note: existing tests on adapter-memory / adapter-localstorage / adapter-prisma may now fail to compile because `SessionRecord` requires `failureReason: string | null`. That's expected — Tasks 5/6/7 will add the field initialization. For now, run only the new test file:

If full suite fails on compile errors, that's OK — we'll fix them in Tasks 5-7. Proceed only after the targeted test file passes.

Actually run the safer subset: `bun run test:run -- packages/core/`
Expected: All core tests pass (the new field is optional in schema; type narrows but adapters live in different packages).

- [ ] **Step 7: Run typecheck (expect adapters to fail — fixes come in 5/6/7)**

Run: `bun run check 2>&1 | head -30`
Expected: TypeScript errors in `adapter-memory`, `adapter-localstorage`, `adapter-prisma` (`SessionRecord.failureReason` missing). Core itself passes.

This is fine — those are fixed in subsequent tasks. Don't try to fix them now or you'll write code without tests.

- [ ] **Step 8: Commit (allow downstream typecheck failures temporarily)**

```bash
git add packages/core/src/types.ts packages/core/src/schema.ts packages/core/__tests__/types-session-failed.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add 'failed' session status + failureReason field

Extends SESSION_STATUSES enum and adds nullable failureReason text
column to ColaborateSession. Adapters land the field in subsequent
tasks — typecheck temporarily red on adapter-memory/localstorage/prisma.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

The commit is intentionally not green across the workspace — Tasks 5/6/7 fix the adapters. Per the plan's TDD discipline, the test for THIS task passes; the rest catches up immediately.

---

### Task 2: Core — TrackerAdapter interface + Issue types + SessionBundle

**Files:**
- Modify: `packages/core/src/types.ts` (append new types near end of file, before the helpers section)
- Modify: `packages/core/src/index.ts` (export new types)
- Test: `packages/core/__tests__/tracker-adapter-types.test.ts` (new — type-level smoke)

- [ ] **Step 1: Write the failing test**

Create `packages/core/__tests__/tracker-adapter-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  IssueInput,
  IssueRef,
  IssuePatch,
  TrackerAdapter,
  SessionBundle,
} from "../src/index.js";

describe("Phase 5 tracker types", () => {
  it("IssueInput shape compiles", () => {
    const input: IssueInput = { title: "x", body: "y", labels: ["bug"] };
    expect(input.title).toBe("x");
  });

  it("IssueInput labels is optional", () => {
    const input: IssueInput = { title: "x", body: "y" };
    expect(input.labels).toBeUndefined();
  });

  it("IssueRef shape compiles", () => {
    const ref: IssueRef = { provider: "github", issueId: "42", issueUrl: "https://x" };
    expect(ref.provider).toBe("github");
  });

  it("IssuePatch fields are all optional", () => {
    const patch: IssuePatch = {};
    expect(patch).toEqual({});
  });

  it("TrackerAdapter interface contract", async () => {
    const stub: TrackerAdapter = {
      name: "github",
      async createIssue() { return { provider: "github", issueId: "1", issueUrl: "https://x/1" }; },
      async updateIssue() { /* noop */ },
      async linkResolve() { return { resolved: false }; },
    };
    const ref = await stub.createIssue({ title: "t", body: "b" });
    expect(ref.issueId).toBe("1");
  });

  it("SessionBundle shape compiles (smoke — full type ergonomics)", () => {
    const bundle: SessionBundle = {
      session: {
        id: "s", projectName: "p", reviewerName: null, reviewerEmail: null,
        status: "submitted", submittedAt: new Date(), triagedAt: null, notes: null,
        failureReason: null, createdAt: new Date(), updatedAt: new Date(),
      },
      feedbacks: [],
      screenshotsByFeedbackId: {},
    };
    expect(bundle.feedbacks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/core/__tests__/tracker-adapter-types.test.ts`
Expected: TypeScript errors / test load failure — `IssueInput`, `TrackerAdapter`, `SessionBundle` etc. not exported.

- [ ] **Step 3: Add types to `packages/core/src/types.ts`**

Find the section with `// Abstract Store — adapter pattern` (around line 367 after Task 1 edits). BEFORE that section, add:

```ts
// ---------------------------------------------------------------------------
// Tracker integration — Phase 5 (triage worker → external issue trackers)
// ---------------------------------------------------------------------------

/** Input for creating a tracker issue. */
export interface IssueInput {
  title: string;
  body: string;
  labels?: string[] | undefined;
}

/** Returned reference for a created tracker issue. */
export interface IssueRef {
  provider: "github" | "linear";
  /** Provider-specific id. For GitHub: the issue number as a string. */
  issueId: string;
  /** Canonical, browser-friendly URL. */
  issueUrl: string;
}

/** Patch payload for updating an existing tracker issue. All fields optional. */
export interface IssuePatch {
  state?: "open" | "closed" | undefined;
  body?: string | undefined;
  labels?: string[] | undefined;
}

/**
 * Abstract tracker adapter. Implementations live in `@colaborate/integration-github`
 * (Phase 5) and `@colaborate/integration-linear` (Phase 6+). The triage worker
 * depends on this interface, not on any specific implementation.
 */
export interface TrackerAdapter {
  readonly name: "github" | "linear";
  createIssue(input: IssueInput): Promise<IssueRef>;
  updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void>;
  /**
   * Phase 5 placeholder — used in Phase 6+ for tracker → feedback resolution sync.
   * v0 implementations return `{ resolved: false }`.
   */
  linkResolve(ref: IssueRef): Promise<{ resolved: boolean }>;
}
```

Then, AFTER the existing `ScreenshotResponse` interface, add:

```ts
/**
 * Aggregated view of a session loaded by the triage worker.
 * Built by `loadSessionBundle` in `@colaborate/triage`.
 */
export interface SessionBundle {
  session: SessionRecord;
  feedbacks: FeedbackRecord[];
  /** Map keyed by `feedbackId`. Empty array (not undefined) when a feedback has no screenshots. */
  screenshotsByFeedbackId: Record<string, ScreenshotRecord[]>;
}
```

- [ ] **Step 4: Export new types from `packages/core/src/index.ts`**

Add to the type-export block (between `SessionStatus` and the `}` close):
```ts
  IssueInput,
  IssuePatch,
  IssueRef,
  SessionBundle,
  TrackerAdapter,
```

(Keep alphabetical ordering with the existing types.)

- [ ] **Step 5: Run new test → green**

Run: `bun run test:run -- packages/core/__tests__/tracker-adapter-types.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint + typecheck core**

Run: `bun run lint`
Expected: pass.

Run: `cd packages/core && bun run check && cd ../..`
Expected: pass. (Other packages remain red until Tasks 5-7.)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts packages/core/__tests__/tracker-adapter-types.test.ts
git commit -m "$(cat <<'EOF'
feat(core): TrackerAdapter interface + IssueInput/IssueRef/IssuePatch + SessionBundle

Phase 5 building blocks. TrackerAdapter lives in core so the triage
worker depends on the interface, not on integration-github (or
integration-linear in Phase 6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Core — extend ColaborateStore interface with 3 new methods

**Files:**
- Modify: `packages/core/src/types.ts` (`ColaborateStore` interface)
- Test: covered by Task 4 (conformance)

This task is pure interface extension — no code, no test of its own. The conformance suite in Task 4 will fail until the interface is extended, so we land the interface first.

- [ ] **Step 1: Extend the ColaborateStore interface**

In `packages/core/src/types.ts`, find the `ColaborateStore` interface (around line 414 post-Task-2). After the `listScreenshots` method (currently the last one), add:

```ts
  /**
   * Persist tracker integration metadata onto a feedback record.
   * Called by the triage worker (`@colaborate/triage`) after creating an issue
   * via a `TrackerAdapter`.
   *
   * Throws `StoreNotFoundError` if `id` does not exist.
   */
  setFeedbackExternalIssue(
    id: string,
    data: { provider: string; issueId: string; issueUrl: string },
  ): Promise<FeedbackRecord>;

  /**
   * Transition a session from `submitted` or `failed` to `triaged`. Stamps
   * `triagedAt` to `now`. Clears `failureReason` to `null`.
   *
   * Throws `StoreNotFoundError` if `id` does not exist.
   * Throws `StoreValidationError` if current status ∉ {`submitted`, `failed`}.
   */
  markSessionTriaged(id: string): Promise<SessionRecord>;

  /**
   * Transition a session from `submitted` or `failed` to `failed`. Persists
   * `reason` into `failureReason`. (`failed → failed` is permitted so retry-then-
   * fail-again works.)
   *
   * Throws `StoreNotFoundError` if `id` does not exist.
   * Throws `StoreValidationError` if current status ∉ {`submitted`, `failed`}.
   */
  markSessionFailed(id: string, reason: string): Promise<SessionRecord>;
```

- [ ] **Step 2: Lint + typecheck core only**

Run: `bun run lint`
Expected: pass.

Run: `cd packages/core && bun run check && cd ../..`
Expected: pass.

(Adapters remain red. Compilation will go green for them only after Tasks 5/6/7.)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "$(cat <<'EOF'
feat(core): extend ColaborateStore with tracker write-back + session state-machine methods

Adds setFeedbackExternalIssue, markSessionTriaged, markSessionFailed.
Adapters land impls in subsequent tasks; conformance suite lands in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Core — conformance tests for the 3 new store methods

**Files:**
- Modify: `packages/core/src/testing.ts` (append a new describe block after the existing `submitSession` block)

- [ ] **Step 1: Append conformance tests**

In `packages/core/src/testing.ts`, find the closing `});` of the `describe("submitSession", () => {…})` block (around line 498). AFTER it (still inside the outer `describe("ColaborateStore conformance", …)`), insert:

```ts
    // ------------------------------------------------------------------
    // Phase 5 — tracker write-back + session state-machine
    // ------------------------------------------------------------------

    describe("setFeedbackExternalIssue", () => {
      it("persists provider/issueId/issueUrl onto an existing feedback", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput({ clientId: "c-extissue" }));
        const updated = await store.setFeedbackExternalIssue(fb.id, {
          provider: "github",
          issueId: "42",
          issueUrl: "https://github.com/owner/repo/issues/42",
        });
        expect(updated.externalProvider).toBe("github");
        expect(updated.externalIssueId).toBe("42");
        expect(updated.externalIssueUrl).toBe("https://github.com/owner/repo/issues/42");
      });

      it("returns the full FeedbackRecord (with annotations)", async () => {
        freshStore();
        const fb = await store.createFeedback(createInput({ clientId: "c-extissue-rec" }));
        const updated = await store.setFeedbackExternalIssue(fb.id, {
          provider: "github", issueId: "1", issueUrl: "https://x/1",
        });
        expect(updated.id).toBe(fb.id);
        expect(updated.annotations).toHaveLength(1);
      });

      it("throws StoreNotFoundError for unknown id", async () => {
        freshStore();
        await expect(
          store.setFeedbackExternalIssue("nope", { provider: "github", issueId: "1", issueUrl: "https://x/1" }),
        ).rejects.toThrow(StoreNotFoundError);
      });
    });

    describe("markSessionTriaged", () => {
      it("transitions submitted → triaged + stamps triagedAt + clears failureReason", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.submitSession(session.id);
        const triaged = await store.markSessionTriaged(session.id);
        expect(triaged.status).toBe("triaged");
        expect(triaged.triagedAt).toBeInstanceOf(Date);
        expect(triaged.failureReason).toBeNull();
      });

      it("transitions failed → triaged (retry success path)", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.submitSession(session.id);
        await store.markSessionFailed(session.id, "anthropic: rate limit");
        const triaged = await store.markSessionTriaged(session.id);
        expect(triaged.status).toBe("triaged");
        expect(triaged.failureReason).toBeNull();
      });

      it("throws StoreNotFoundError for unknown id", async () => {
        freshStore();
        await expect(store.markSessionTriaged("nope")).rejects.toThrow(StoreNotFoundError);
      });

      it("throws StoreValidationError when current status is 'drafting'", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await expect(store.markSessionTriaged(session.id)).rejects.toThrow(StoreValidationError);
      });

      it("throws StoreValidationError when current status is 'triaged' (idempotent guard)", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.submitSession(session.id);
        await store.markSessionTriaged(session.id);
        await expect(store.markSessionTriaged(session.id)).rejects.toThrow(StoreValidationError);
      });
    });

    describe("markSessionFailed", () => {
      it("transitions submitted → failed + persists reason", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.submitSession(session.id);
        const failed = await store.markSessionFailed(session.id, "anthropic: 429");
        expect(failed.status).toBe("failed");
        expect(failed.failureReason).toBe("anthropic: 429");
      });

      it("permits failed → failed (retry-then-fail)", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.submitSession(session.id);
        await store.markSessionFailed(session.id, "first");
        const second = await store.markSessionFailed(session.id, "second");
        expect(second.status).toBe("failed");
        expect(second.failureReason).toBe("second");
      });

      it("throws StoreNotFoundError for unknown id", async () => {
        freshStore();
        await expect(store.markSessionFailed("nope", "reason")).rejects.toThrow(StoreNotFoundError);
      });

      it("throws StoreValidationError when current status is 'drafting'", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await expect(store.markSessionFailed(session.id, "reason")).rejects.toThrow(StoreValidationError);
      });

      it("throws StoreValidationError when current status is 'triaged'", async () => {
        freshStore();
        const session = await store.createSession(createSessionInput());
        await store.submitSession(session.id);
        await store.markSessionTriaged(session.id);
        await expect(store.markSessionFailed(session.id, "reason")).rejects.toThrow(StoreValidationError);
      });
    });
```

Also at the top of the file, add `StoreValidationError` to the existing import:
```ts
import { StoreNotFoundError, StoreValidationError } from "./types.js";
```

- [ ] **Step 2: Don't run conformance yet — adapter impls land next**

If you ran the conformance now, all 3 adapters would fail compilation (the new methods aren't on Memory/LocalStorage/Prisma yet) AND all 3 sets of conformance tests would fail. Skip the test run — Tasks 5/6/7 will land impls; we'll confirm conformance green at the end of Task 7.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/testing.ts
git commit -m "$(cat <<'EOF'
test(core): conformance suite covers setFeedbackExternalIssue + mark{Triaged,Failed}

11 new tests across 3 describe blocks. Will be auto-run against
Memory/LocalStorage/Prisma stores via testColaborateStore() — 33 net new
test assertions across all adapters.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: MemoryStore — implement 3 new methods

**Files:**
- Modify: `packages/adapter-memory/src/index.ts` (init failureReason on createSession; add setFeedbackExternalIssue, markSessionTriaged, markSessionFailed)

- [ ] **Step 1: Add `failureReason: null` to createSession**

In `packages/adapter-memory/src/index.ts`, find `async createSession(...)` (around line 195). Add `failureReason: null,` between `notes` and `createdAt` in the SessionRecord literal:

```ts
    const record: SessionRecord = {
      id: this.generateId(),
      projectName: data.projectName,
      reviewerName: data.reviewerName ?? null,
      reviewerEmail: data.reviewerEmail ?? null,
      status: "drafting",
      submittedAt: null,
      triagedAt: null,
      notes: data.notes ?? null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
```

- [ ] **Step 2: Implement the 3 new methods**

In the same file, find the `listScreenshots` method (current last method). AFTER the closing `}` of `listScreenshots`, add:

```ts
  async setFeedbackExternalIssue(
    id: string,
    data: { provider: string; issueId: string; issueUrl: string },
  ): Promise<FeedbackRecord> {
    const fb = this.feedbacks.find((f) => f.id === id);
    if (!fb) throw new StoreNotFoundError();
    fb.externalProvider = data.provider;
    fb.externalIssueId = data.issueId;
    fb.externalIssueUrl = data.issueUrl;
    fb.updatedAt = new Date();
    return fb;
  }

  async markSessionTriaged(id: string): Promise<SessionRecord> {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) throw new StoreNotFoundError();
    if (session.status !== "submitted" && session.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as triaged from status '${session.status}' (expected 'submitted' or 'failed')`,
      );
    }
    const now = new Date();
    session.status = "triaged";
    session.triagedAt = now;
    session.failureReason = null;
    session.updatedAt = now;
    return session;
  }

  async markSessionFailed(id: string, reason: string): Promise<SessionRecord> {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) throw new StoreNotFoundError();
    if (session.status !== "submitted" && session.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as failed from status '${session.status}' (expected 'submitted' or 'failed')`,
      );
    }
    session.status = "failed";
    session.failureReason = reason;
    session.updatedAt = new Date();
    return session;
  }
```

- [ ] **Step 3: Run conformance tests for memory**

Run: `bun run test:run -- packages/adapter-memory/`
Expected: All conformance tests pass, including the 11 new ones from Task 4 (3 setFeedbackExternalIssue + 5 markSessionTriaged + 5 markSessionFailed = 13 newly passing for memory).

- [ ] **Step 4: Lint + typecheck**

Run: `bun run lint && cd packages/adapter-memory && bun run check && cd ../..`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-memory/src/index.ts
git commit -m "$(cat <<'EOF'
feat(adapter-memory): setFeedbackExternalIssue + markSession{Triaged,Failed}

Phase 5 store methods. Initializes failureReason: null on createSession.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: LocalStorageStore — implement 3 new methods

**Files:**
- Modify: `packages/adapter-localstorage/src/index.ts`

- [ ] **Step 1: Read the existing structure**

Read `packages/adapter-localstorage/src/index.ts` and locate (a) `createSession` (b) the last method in the class (likely `listScreenshots`) (c) imports.

- [ ] **Step 2: Add StoreValidationError to imports**

Find the existing import line `import { ..., StoreNotFoundError, ... } from "@colaborate/core";`. Add `StoreValidationError` alphabetically.

- [ ] **Step 3: Add `failureReason: null` to createSession**

In `createSession`, find the `SessionRecord` literal being persisted. Add `failureReason: null,` between `notes` and `createdAt` (mirror Task 5 Step 1).

- [ ] **Step 4: Implement the 3 new methods**

After `listScreenshots`, add (mirrors Memory impl but reads/writes through localStorage's existing helpers):

```ts
  async setFeedbackExternalIssue(
    id: string,
    data: { provider: string; issueId: string; issueUrl: string },
  ): Promise<FeedbackRecord> {
    const feedbacks = this.readFeedbacks();
    const idx = feedbacks.findIndex((f) => f.id === id);
    if (idx === -1) throw new StoreNotFoundError();
    const updated: FeedbackRecord = {
      ...feedbacks[idx]!,
      externalProvider: data.provider,
      externalIssueId: data.issueId,
      externalIssueUrl: data.issueUrl,
      updatedAt: new Date(),
    };
    feedbacks[idx] = updated;
    this.writeFeedbacks(feedbacks);
    return updated;
  }

  async markSessionTriaged(id: string): Promise<SessionRecord> {
    const sessions = this.readSessions();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new StoreNotFoundError();
    const session = sessions[idx]!;
    if (session.status !== "submitted" && session.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as triaged from status '${session.status}' (expected 'submitted' or 'failed')`,
      );
    }
    const now = new Date();
    const updated: SessionRecord = {
      ...session,
      status: "triaged",
      triagedAt: now,
      failureReason: null,
      updatedAt: now,
    };
    sessions[idx] = updated;
    this.writeSessions(sessions);
    return updated;
  }

  async markSessionFailed(id: string, reason: string): Promise<SessionRecord> {
    const sessions = this.readSessions();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new StoreNotFoundError();
    const session = sessions[idx]!;
    if (session.status !== "submitted" && session.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as failed from status '${session.status}' (expected 'submitted' or 'failed')`,
      );
    }
    const updated: SessionRecord = {
      ...session,
      status: "failed",
      failureReason: reason,
      updatedAt: new Date(),
    };
    sessions[idx] = updated;
    this.writeSessions(sessions);
    return updated;
  }
```

If LocalStorage's existing pattern uses different helper names (e.g. `loadSessions`/`saveSessions`), use those instead. The pattern is: read all, mutate by id, write all.

- [ ] **Step 5: Run conformance + commit**

Run: `bun run test:run -- packages/adapter-localstorage/`
Expected: All conformance tests pass (new 11 + existing).

Run: `bun run lint && cd packages/adapter-localstorage && bun run check && cd ../..`

```bash
git add packages/adapter-localstorage/src/index.ts
git commit -m "$(cat <<'EOF'
feat(adapter-localstorage): setFeedbackExternalIssue + markSession{Triaged,Failed}

Phase 5 store methods. Mirrors MemoryStore semantics through the
read-mutate-write localStorage helpers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: PrismaStore — implement 3 new methods

**Files:**
- Modify: `packages/adapter-prisma/src/index.ts` (PrismaStore class)

- [ ] **Step 1: Add `StoreValidationError` to imports if not already present**

Check the existing import block at the top of `packages/adapter-prisma/src/index.ts`. `StoreValidationError` is already imported (Phase 4b). No change needed.

- [ ] **Step 2: Add the 3 methods to PrismaStore**

Find the closing `}` of `PrismaStore.listScreenshots` (around line 328). AFTER it (still inside the `PrismaStore` class), add:

```ts
  async setFeedbackExternalIssue(
    id: string,
    data: { provider: string; issueId: string; issueUrl: string },
  ): Promise<FeedbackRecord> {
    try {
      return (await this.prisma.colaborateFeedback.update({
        where: { id },
        data: {
          externalProvider: data.provider,
          externalIssueId: data.issueId,
          externalIssueUrl: data.issueUrl,
        },
        include: INCLUDE_ANNOTATIONS,
      })) as FeedbackRecord;
    } catch (error) {
      if (isStoreNotFound(error)) throw new StoreNotFoundError();
      throw error;
    }
  }

  async markSessionTriaged(id: string): Promise<SessionRecord> {
    const current = (await this.prisma.colaborateSession.findUnique({ where: { id } })) as
      | { status: string }
      | null;
    if (!current) throw new StoreNotFoundError();
    if (current.status !== "submitted" && current.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as triaged from status '${current.status}' (expected 'submitted' or 'failed')`,
      );
    }
    return (await this.prisma.colaborateSession.update({
      where: { id },
      data: { status: "triaged", triagedAt: new Date(), failureReason: null },
    })) as SessionRecord;
  }

  async markSessionFailed(id: string, reason: string): Promise<SessionRecord> {
    const current = (await this.prisma.colaborateSession.findUnique({ where: { id } })) as
      | { status: string }
      | null;
    if (!current) throw new StoreNotFoundError();
    if (current.status !== "submitted" && current.status !== "failed") {
      throw new StoreValidationError(
        `Cannot mark session as failed from status '${current.status}' (expected 'submitted' or 'failed')`,
      );
    }
    return (await this.prisma.colaborateSession.update({
      where: { id },
      data: { status: "failed", failureReason: reason },
    })) as SessionRecord;
  }
```

- [ ] **Step 3: Verify `ColaboratePrismaClient` type covers what's needed**

The minimal Prisma type at `packages/adapter-prisma/src/index.ts:84` already includes `colaborateSession.findUnique` and `update`, and `colaborateFeedback.update`. No change needed.

- [ ] **Step 4: Run conformance + lint + check**

The existing PrismaStore conformance test uses a fake Prisma client. Find it (likely `packages/adapter-prisma/__tests__/handler.test.ts` or a similar file) — if conformance is run against a fake `ColaboratePrismaClient`, the fake will need to handle the new `update` data shape. Check `packages/adapter-prisma/__tests__/fixtures.ts` and the handler tests; if there's a `MockPrismaClient` class, extend it to support `failureReason` in update payloads + the new `findUnique({ where: { id } })` for sessions.

If no PrismaStore conformance test exists yet (Prisma adapter doesn't run `testColaborateStore` because of the Prisma client requirement), the conformance suite isn't auto-applied — see how `packages/adapter-prisma/__tests__/handler.test.ts` exercises the store. Add explicit Prisma-specific tests in a new file `packages/adapter-prisma/__tests__/prisma-store-phase5.test.ts` that uses a hand-rolled minimal fake matching `ColaboratePrismaClient`:

```ts
import { describe, expect, it } from "vitest";
import { StoreNotFoundError, StoreValidationError } from "@colaborate/core";
import { PrismaStore, type ColaboratePrismaClient } from "../src/index.js";

function makeFakePrisma(): ColaboratePrismaClient {
  const sessions = new Map<string, { id: string; status: string; failureReason: string | null; triagedAt: Date | null }>();
  const feedbacks = new Map<string, { id: string; externalProvider: string | null; externalIssueId: string | null; externalIssueUrl: string | null; annotations: unknown[] }>();
  return {
    colaborateFeedback: {
      create: async () => { throw new Error("not used in this test"); },
      findMany: async () => [],
      findUnique: async () => null,
      update: async (args: unknown) => {
        const a = args as { where: { id: string }; data: Record<string, unknown> };
        const fb = feedbacks.get(a.where.id);
        if (!fb) { const e = new Error("not found"); (e as { code?: string }).code = "P2025"; throw e; }
        Object.assign(fb, a.data);
        return { ...fb, annotations: [] };
      },
      updateMany: async () => ({ count: 0 }),
      delete: async () => ({}),
      deleteMany: async () => ({}),
      count: async () => 0,
    },
    colaborateSession: {
      create: async () => { throw new Error("not used"); },
      findUnique: async (args: unknown) => sessions.get((args as { where: { id: string } }).where.id) ?? null,
      findMany: async () => [],
      update: async (args: unknown) => {
        const a = args as { where: { id: string }; data: Record<string, unknown> };
        const s = sessions.get(a.where.id);
        if (!s) { const e = new Error("not found"); (e as { code?: string }).code = "P2025"; throw e; }
        Object.assign(s, a.data);
        return s;
      },
    },
    $transaction: async () => [],
    // @ts-expect-error — test shim sets state directly
    __seedSession(s: { id: string; status: string; failureReason?: string | null; triagedAt?: Date | null }) {
      sessions.set(s.id, { id: s.id, status: s.status, failureReason: s.failureReason ?? null, triagedAt: s.triagedAt ?? null });
    },
    // @ts-expect-error — test shim sets state directly
    __seedFeedback(f: { id: string }) {
      feedbacks.set(f.id, { id: f.id, externalProvider: null, externalIssueId: null, externalIssueUrl: null, annotations: [] });
    },
  } as ColaboratePrismaClient;
}

describe("PrismaStore Phase 5 methods", () => {
  it("setFeedbackExternalIssue persists fields", async () => {
    const prisma = makeFakePrisma();
    (prisma as unknown as { __seedFeedback: (f: { id: string }) => void }).__seedFeedback({ id: "fb1" });
    const store = new PrismaStore(prisma);
    const updated = await store.setFeedbackExternalIssue("fb1", { provider: "github", issueId: "1", issueUrl: "https://x/1" });
    expect(updated.externalProvider).toBe("github");
    expect(updated.externalIssueUrl).toBe("https://x/1");
  });

  it("setFeedbackExternalIssue throws StoreNotFoundError on Prisma P2025", async () => {
    const prisma = makeFakePrisma();
    const store = new PrismaStore(prisma);
    await expect(store.setFeedbackExternalIssue("nope", { provider: "github", issueId: "1", issueUrl: "https://x" }))
      .rejects.toThrow(StoreNotFoundError);
  });

  it("markSessionTriaged: submitted → triaged + clears failureReason", async () => {
    const prisma = makeFakePrisma();
    (prisma as unknown as { __seedSession: (s: { id: string; status: string; failureReason?: string }) => void })
      .__seedSession({ id: "s1", status: "submitted", failureReason: "old reason" });
    const store = new PrismaStore(prisma);
    const triaged = await store.markSessionTriaged("s1");
    expect(triaged.status).toBe("triaged");
    expect(triaged.failureReason).toBeNull();
  });

  it("markSessionTriaged: throws StoreValidationError when status='drafting'", async () => {
    const prisma = makeFakePrisma();
    (prisma as unknown as { __seedSession: (s: { id: string; status: string }) => void })
      .__seedSession({ id: "s1", status: "drafting" });
    const store = new PrismaStore(prisma);
    await expect(store.markSessionTriaged("s1")).rejects.toThrow(StoreValidationError);
  });

  it("markSessionFailed: submitted → failed + persists reason", async () => {
    const prisma = makeFakePrisma();
    (prisma as unknown as { __seedSession: (s: { id: string; status: string }) => void })
      .__seedSession({ id: "s1", status: "submitted" });
    const store = new PrismaStore(prisma);
    const failed = await store.markSessionFailed("s1", "anthropic: 429");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("anthropic: 429");
  });

  it("markSessionFailed: failed → failed permitted (retry-then-fail)", async () => {
    const prisma = makeFakePrisma();
    (prisma as unknown as { __seedSession: (s: { id: string; status: string }) => void })
      .__seedSession({ id: "s1", status: "failed" });
    const store = new PrismaStore(prisma);
    const failed = await store.markSessionFailed("s1", "second");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("second");
  });
});
```

Run: `bun run test:run -- packages/adapter-prisma/__tests__/prisma-store-phase5.test.ts`
Expected: 6 passing.

Run: `bun run test:run`
Expected: all 1128 + new tests pass. The Memory + LocalStorage conformance now covers the 11 Phase 5 conformance assertions × 2 adapters = 22 net new tests. Plus 6 prisma-specific = 28+. Plus Task 1 (3) + Task 2 (6) = ~37 new total. Total around 1165.

- [ ] **Step 5: Lint + check**

Run: `bun run lint && bun run check`
Expected: all green now (Tasks 1-7 closed the typecheck loop).

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-prisma/src/index.ts packages/adapter-prisma/__tests__/prisma-store-phase5.test.ts
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): setFeedbackExternalIssue + markSession{Triaged,Failed}

Pre-fetches session for status validation (raises StoreValidationError
on illegal transitions). Maps Prisma P2025 → StoreNotFoundError.
Adds 6 hand-rolled fake-Prisma unit tests; full conformance is exercised
indirectly via Memory/LocalStorage conformance suites.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `@colaborate/integration-github` — package skeleton

**Files:**
- Create: `packages/integration-github/package.json`
- Create: `packages/integration-github/tsconfig.json`
- Create: `packages/integration-github/tsup.config.ts`
- Create: `packages/integration-github/src/index.ts`
- Create: `packages/integration-github/__tests__/.gitkeep`

- [ ] **Step 1: Create directory + package.json**

Run: `mkdir -p packages/integration-github/src packages/integration-github/__tests__`

Create `packages/integration-github/package.json`:

```json
{
  "name": "@colaborate/integration-github",
  "version": "0.0.0",
  "description": "GitHub TrackerAdapter for Colaborate — direct fetch, no Octokit",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup && node ../../scripts/fix-dts.mjs dist",
    "check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "keywords": ["colaborate", "github", "tracker", "adapter", "feedback"],
  "author": "Develotype <bdoud@develotype.com>",
  "license": "MIT",
  "homepage": "https://github.com/Jabberwockyjib/colaborate",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Jabberwockyjib/colaborate.git",
    "directory": "packages/integration-github"
  },
  "bugs": { "url": "https://github.com/Jabberwockyjib/colaborate/issues" },
  "publishConfig": { "access": "public" },
  "peerDependencies": {
    "@colaborate/core": "workspace:*"
  },
  "devDependencies": {
    "@colaborate/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Match the mcp-server tsconfig pattern. Create `packages/integration-github/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "__tests__/**/*"]
}
```

If the base tsconfig path differs, mirror what `packages/mcp-server/tsconfig.json` uses verbatim.

- [ ] **Step 3: Create tsup.config.ts**

Create `packages/integration-github/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: ["@colaborate/core"],
});
```

- [ ] **Step 4: Create stub `src/index.ts`**

Create `packages/integration-github/src/index.ts`:

```ts
// Public exports — populated in Tasks 9-10.
export {};
```

- [ ] **Step 5: Run `bun install` to register the workspace**

Run: `bun install`
Expected: `+ @colaborate/integration-github@workspace:packages/integration-github` listed.

- [ ] **Step 6: Verify build, check, lint pass on the empty package**

Run: `bun run build` (turbo will build the new package)
Expected: 9/9 packages build.

Run: `bun run check`
Expected: 12/12 check tasks pass.

Run: `bun run lint`
Expected: clean.

Run: `bun run test:run`
Expected: still 1165+ tests pass (no new tests yet).

- [ ] **Step 7: Commit**

```bash
git add packages/integration-github/ bun.lock
git commit -m "$(cat <<'EOF'
feat(integration-github): package skeleton

Empty workspace with package.json, tsconfig, tsup config. Implementation
lands in Tasks 9-10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `@colaborate/integration-github` — `client.ts` (direct fetch wrapper)

**Files:**
- Create: `packages/integration-github/src/client.ts`
- Create: `packages/integration-github/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/integration-github/__tests__/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubAdapterError } from "../src/client.js";

const TOKEN = "ghp_test_token";
const REPO = "owner/repo";

describe("createGitHubClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("createIssue POSTs to /repos/{owner}/{name}/issues with correct headers + body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ number: 42, html_url: "https://github.com/owner/repo/issues/42" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    const result = await client.createIssue({ title: "T", body: "B", labels: ["bug"] });
    expect(result).toEqual({ number: 42, html_url: "https://github.com/owner/repo/issues/42" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: "T", body: "B", labels: ["bug"] });
  });

  it("createIssue throws GitHubAdapterError on non-2xx with status + body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Bad credentials", { status: 401 }),
    );
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    try {
      await client.createIssue({ title: "T", body: "B" });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubAdapterError);
      expect((err as GitHubAdapterError).status).toBe(401);
      expect((err as GitHubAdapterError).body).toContain("Bad credentials");
    }
  });

  it("updateIssue PATCHes /repos/{owner}/{name}/issues/{number}", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }));
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    await client.updateIssue(42, { state: "closed" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues/42");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ state: "closed" });
  });

  it("updateIssue throws GitHubAdapterError on 422 (validation)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Validation failed" }), { status: 422 }),
    );
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    await expect(client.updateIssue(1, { state: "open" })).rejects.toBeInstanceOf(GitHubAdapterError);
  });

  it("throws on invalid repo format", () => {
    expect(() => createGitHubClient({ token: TOKEN, repo: "no-slash" })).toThrow(/Invalid repo/);
  });

  it("network failure bubbles through (not wrapped)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    await expect(client.createIssue({ title: "T", body: "B" })).rejects.toThrow("ENOTFOUND");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/integration-github/__tests__/client.test.ts`
Expected: FAIL — module `../src/client.js` not found.

- [ ] **Step 3: Implement `client.ts`**

Create `packages/integration-github/src/client.ts`:

```ts
/**
 * Thin GitHub REST client. Two endpoints, no Octokit, no transitive deps.
 *
 * Auth: PAT via `Authorization: Bearer <token>`. App auth deferred to Phase 7+.
 */

export interface GitHubCreateIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubCreateIssueResponse {
  number: number;
  html_url: string;
}

export interface GitHubUpdateIssuePatch {
  state?: "open" | "closed";
  body?: string;
  labels?: string[];
}

export interface GitHubClient {
  createIssue(input: GitHubCreateIssueInput): Promise<GitHubCreateIssueResponse>;
  updateIssue(number: number, patch: GitHubUpdateIssuePatch): Promise<void>;
}

/**
 * Error raised when the GitHub API returns a non-2xx response.
 * `status` is the HTTP status code; `body` is the verbatim response body
 * (so the triage worker can persist it into `failureReason`).
 */
export class GitHubAdapterError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "GitHubAdapterError";
    this.status = status;
    this.body = body;
  }
}

const REPO_RE = /^([A-Za-z0-9][A-Za-z0-9-_.]*)\/([A-Za-z0-9][A-Za-z0-9-_.]*)$/;

export function createGitHubClient(opts: { token: string; repo: string }): GitHubClient {
  const m = REPO_RE.exec(opts.repo);
  if (!m) throw new Error(`Invalid repo: ${opts.repo} (expected "owner/name")`);
  const [, owner, name] = m as unknown as [string, string, string];

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  return {
    async createIssue(input) {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          ...(input.labels !== undefined ? { labels: input.labels } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new GitHubAdapterError(
          `GitHub createIssue failed: ${res.status} ${res.statusText}`,
          res.status,
          body,
        );
      }
      return (await res.json()) as GitHubCreateIssueResponse;
    },

    async updateIssue(number, patch) {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${number}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new GitHubAdapterError(
          `GitHub updateIssue failed: ${res.status} ${res.statusText}`,
          res.status,
          body,
        );
      }
    },
  };
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Replace `packages/integration-github/src/index.ts` with:

```ts
export type {
  GitHubClient,
  GitHubCreateIssueInput,
  GitHubCreateIssueResponse,
  GitHubUpdateIssuePatch,
} from "./client.js";
export { createGitHubClient, GitHubAdapterError } from "./client.js";
```

- [ ] **Step 5: Run test → green**

Run: `bun run test:run -- packages/integration-github/__tests__/client.test.ts`
Expected: PASS (6 tests).

Run: `bun run lint && cd packages/integration-github && bun run check && cd ../..`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/integration-github/src/client.ts packages/integration-github/src/index.ts packages/integration-github/__tests__/client.test.ts
git commit -m "$(cat <<'EOF'
feat(integration-github): GitHubClient — direct fetch wrapper

POST /issues + PATCH /issues/{n}. No Octokit. GitHubAdapterError
captures status + verbatim response body for triage failureReason.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `@colaborate/integration-github` — `adapter.ts` (TrackerAdapter impl)

**Files:**
- Create: `packages/integration-github/src/adapter.ts`
- Create: `packages/integration-github/__tests__/adapter.test.ts`
- Modify: `packages/integration-github/src/index.ts` (add adapter exports)

- [ ] **Step 1: Write the failing test**

Create `packages/integration-github/__tests__/adapter.test.ts`:

```ts
import type { IssueRef } from "@colaborate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubAdapter } from "../src/adapter.js";

const TOKEN = "ghp_test";
const REPO = "owner/repo";

describe("createGitHubAdapter", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("name is 'github'", () => {
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    expect(adapter.name).toBe("github");
  });

  it("createIssue maps client response → IssueRef", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ number: 7, html_url: "https://github.com/owner/repo/issues/7" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref = await adapter.createIssue({ title: "x", body: "y" });
    expect(ref).toEqual({
      provider: "github",
      issueId: "7",
      issueUrl: "https://github.com/owner/repo/issues/7",
    });
  });

  it("updateIssue calls underlying client with parsed number", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }));
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref: IssueRef = { provider: "github", issueId: "42", issueUrl: "x" };
    await adapter.updateIssue(ref, { state: "closed" });
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues/42");
  });

  it("updateIssue throws on provider mismatch (no fetch made)", async () => {
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref: IssueRef = { provider: "linear", issueId: "1", issueUrl: "x" };
    await expect(adapter.updateIssue(ref, { state: "closed" })).rejects.toThrow(/provider mismatch/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("linkResolve always returns { resolved: false } in v0", async () => {
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref: IssueRef = { provider: "github", issueId: "1", issueUrl: "x" };
    expect(await adapter.linkResolve(ref)).toEqual({ resolved: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/integration-github/__tests__/adapter.test.ts`
Expected: FAIL — `../src/adapter.js` not found.

- [ ] **Step 3: Implement `adapter.ts`**

Create `packages/integration-github/src/adapter.ts`:

```ts
import type { IssueInput, IssuePatch, IssueRef, TrackerAdapter } from "@colaborate/core";
import { createGitHubClient } from "./client.js";

/**
 * Build a GitHub-backed `TrackerAdapter`.
 *
 * Auth: PAT via `token`. Repo: `"owner/name"` shape.
 *
 * @example
 * ```ts
 * import { createGitHubAdapter } from "@colaborate/integration-github";
 * const adapter = createGitHubAdapter({ token: process.env.GITHUB_TOKEN!, repo: "myorg/myrepo" });
 * ```
 */
export function createGitHubAdapter(opts: { token: string; repo: string }): TrackerAdapter {
  const client = createGitHubClient(opts);
  return {
    name: "github",

    async createIssue(input: IssueInput): Promise<IssueRef> {
      const created = await client.createIssue({
        title: input.title,
        body: input.body,
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
      });
      return {
        provider: "github",
        issueId: String(created.number),
        issueUrl: created.html_url,
      };
    },

    async updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void> {
      if (ref.provider !== "github") {
        throw new Error(`GitHubAdapter.updateIssue: provider mismatch — got '${ref.provider}', expected 'github'`);
      }
      const number = Number(ref.issueId);
      if (!Number.isInteger(number)) {
        throw new Error(`GitHubAdapter.updateIssue: invalid issueId '${ref.issueId}' (expected integer string)`);
      }
      await client.updateIssue(number, {
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
      });
    },

    // Phase 5 placeholder — Phase 6+ may implement bidirectional sync.
    async linkResolve(): Promise<{ resolved: boolean }> {
      return { resolved: false };
    },
  };
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Replace `packages/integration-github/src/index.ts` with:

```ts
export { createGitHubAdapter } from "./adapter.js";
export type {
  GitHubClient,
  GitHubCreateIssueInput,
  GitHubCreateIssueResponse,
  GitHubUpdateIssuePatch,
} from "./client.js";
export { createGitHubClient, GitHubAdapterError } from "./client.js";
```

- [ ] **Step 5: Run test + lint + check**

Run: `bun run test:run -- packages/integration-github/__tests__/`
Expected: 11 tests pass (6 client + 5 adapter).

Run: `bun run lint && bun run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/integration-github/src/adapter.ts packages/integration-github/src/index.ts packages/integration-github/__tests__/adapter.test.ts
git commit -m "$(cat <<'EOF'
feat(integration-github): createGitHubAdapter — TrackerAdapter impl

Maps the thin client to the @colaborate/core TrackerAdapter interface.
Provider-mismatch in updateIssue throws synchronously without making
a fetch call. linkResolve returns {resolved:false} in v0 (Phase 6+
may implement bidirectional sync).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `@colaborate/triage` — package skeleton

**Files:**
- Create: `packages/triage/package.json`
- Create: `packages/triage/tsconfig.json`
- Create: `packages/triage/tsup.config.ts`
- Create: `packages/triage/src/index.ts`
- Create: `packages/triage/src/prompts/.gitkeep`

- [ ] **Step 1: mkdir + package.json**

Run: `mkdir -p packages/triage/src/prompts packages/triage/__tests__`

Create `packages/triage/package.json`:

```json
{
  "name": "@colaborate/triage",
  "version": "0.0.0",
  "description": "LLM-driven triage worker for Colaborate — turns sessions into tracker issues",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup && node ../../scripts/fix-dts.mjs dist",
    "check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "keywords": ["colaborate", "triage", "anthropic", "claude", "feedback"],
  "author": "Develotype <bdoud@develotype.com>",
  "license": "MIT",
  "homepage": "https://github.com/Jabberwockyjib/colaborate",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Jabberwockyjib/colaborate.git",
    "directory": "packages/triage"
  },
  "bugs": { "url": "https://github.com/Jabberwockyjib/colaborate/issues" },
  "publishConfig": { "access": "public" },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",
    "zod": "^3.24.0"
  },
  "peerDependencies": {
    "@colaborate/core": "workspace:*"
  },
  "devDependencies": {
    "@colaborate/adapter-memory": "workspace:*",
    "@colaborate/core": "workspace:*"
  }
}
```

- [ ] **Step 2: tsconfig.json**

Create `packages/triage/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "__tests__/**/*"]
}
```

If the base path differs, mirror `packages/mcp-server/tsconfig.json` exactly.

- [ ] **Step 3: tsup.config.ts**

Create `packages/triage/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: ["@colaborate/core"],
  loader: { ".md": "text" },
});
```

(`.md` text loader is needed so the system prompt template can be `import`ed as a string in Task 16.)

- [ ] **Step 4: stub `src/index.ts`**

Create `packages/triage/src/index.ts`:

```ts
// Public exports — populated in Tasks 12-17.
export {};
```

- [ ] **Step 5: bun install + sanity gates**

Run: `bun install`
Expected: `+ @colaborate/triage@workspace:packages/triage` + `+ @anthropic-ai/sdk@<version>`.

Run: `bun run build`
Expected: 10/10 packages build.

Run: `bun run check`
Expected: 13/13 check tasks pass.

Run: `bun run lint`
Expected: clean.

Run: `bun run test:run`
Expected: still 1165+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/triage/ bun.lock
git commit -m "$(cat <<'EOF'
feat(triage): package skeleton + @anthropic-ai/sdk dep

Empty workspace. tsup configured with .md text loader so the system
prompt template can be import'd as a string. Implementation lands in
Tasks 12-17.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `@colaborate/triage` — `event-bus.ts`

**Files:**
- Create: `packages/triage/src/event-bus.ts`
- Create: `packages/triage/__tests__/event-bus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/triage/__tests__/event-bus.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { InProcessEventBus, type TriageEventBus, type TriageEvents } from "../src/event-bus.js";

describe("InProcessEventBus", () => {
  it("subscribers receive emitted events", () => {
    const bus: TriageEventBus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on("session.submitted", handler);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("multiple subscribers all fire on emit", () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("session.submitted", a);
    bus.on("session.submitted", b);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("off removes a specific handler", () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("session.submitted", a);
    bus.on("session.submitted", b);
    bus.off("session.submitted", a);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("emit with no subscribers is a no-op (no throw)", () => {
    const bus = new InProcessEventBus();
    expect(() => bus.emit("session.submitted", { sessionId: "s1" })).not.toThrow();
  });

  it("handler exceptions do not block other handlers (caught + logged)", () => {
    const bus = new InProcessEventBus();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = vi.fn(() => { throw new Error("handler boom"); });
    const b = vi.fn();
    bus.on("session.submitted", a);
    bus.on("session.submitted", b);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(b).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("TriageEvents type exposes session.submitted with sessionId", () => {
    // Compile-time assertion — if TriageEvents drifts this test won't compile.
    const ev: TriageEvents["session.submitted"] = { sessionId: "x" };
    expect(ev.sessionId).toBe("x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/triage/__tests__/event-bus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `event-bus.ts`**

Create `packages/triage/src/event-bus.ts`:

```ts
/**
 * Event bus for triage events. The default in-process implementation is fine for
 * single-deploy v0; a polling/webhook/queue implementation can drop in later
 * without changing `TriageWorker` or the HTTP route.
 */

/** Event payload map. Add events here; the bus is type-checked against this map. */
export interface TriageEvents {
  "session.submitted": { sessionId: string };
}

export type TriageEventName = keyof TriageEvents;

export type TriageEventHandler<E extends TriageEventName> = (payload: TriageEvents[E]) => void;

export interface TriageEventBus {
  on<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void;
  off<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void;
  emit<E extends TriageEventName>(event: E, payload: TriageEvents[E]): void;
}

/**
 * In-process EventEmitter-style bus. Synchronous emit — handlers run in the
 * caller's stack, exceptions are caught + logged so one bad handler can't
 * stop another.
 */
export class InProcessEventBus implements TriageEventBus {
  // biome-ignore lint/suspicious/noExplicitAny: handler set is heterogeneous by event name
  private handlers: Map<TriageEventName, Set<(payload: any) => void>> = new Map();

  on<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (p: unknown) => void);
  }

  off<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void {
    this.handlers.get(event)?.delete(handler as (p: unknown) => void);
  }

  emit<E extends TriageEventName>(event: E, payload: TriageEvents[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[colaborate/triage] handler for '${event}' threw:`, err);
      }
    }
  }
}
```

- [ ] **Step 4: Update `index.ts` exports**

Replace `packages/triage/src/index.ts`:

```ts
export {
  InProcessEventBus,
  type TriageEventBus,
  type TriageEventHandler,
  type TriageEventName,
  type TriageEvents,
} from "./event-bus.js";
```

- [ ] **Step 5: Run test → green**

Run: `bun run test:run -- packages/triage/__tests__/event-bus.test.ts`
Expected: 6 passing.

- [ ] **Step 6: Lint + check + commit**

Run: `bun run lint && cd packages/triage && bun run check && cd ../..`
Expected: pass.

```bash
git add packages/triage/src/event-bus.ts packages/triage/src/index.ts packages/triage/__tests__/event-bus.test.ts
git commit -m "$(cat <<'EOF'
feat(triage): TriageEventBus interface + InProcessEventBus impl

Synchronous emit; handler exceptions are caught + logged so one bad
subscriber can't stop another. Polling/webhook/queue impls can drop
in later behind the same interface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `@colaborate/triage` — `parse.ts` (LLM output parsing + coverage check)

**Files:**
- Create: `packages/triage/src/parse.ts`
- Create: `packages/triage/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing test (table-driven)**

Create `packages/triage/__tests__/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseTriageOutput, TriageCoverageError, TriageParseError } from "../src/parse.js";

const KNOWN_IDS = ["fb-1", "fb-2", "fb-3"];

describe("parseTriageOutput", () => {
  it("accepts clean JSON array", () => {
    const text = JSON.stringify([
      { title: "Fix A", body: "B", relatedFeedbackIds: ["fb-1", "fb-2"] },
      { title: "Fix B", body: "C", relatedFeedbackIds: ["fb-3"] },
    ]);
    const issues = parseTriageOutput(text, KNOWN_IDS);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.title).toBe("Fix A");
    expect(issues[0]!.relatedFeedbackIds).toEqual(["fb-1", "fb-2"]);
  });

  it("accepts markdown-fenced JSON", () => {
    const text = "```json\n" + JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2", "fb-3"] },
    ]) + "\n```";
    const issues = parseTriageOutput(text, KNOWN_IDS);
    expect(issues).toHaveLength(1);
  });

  it("accepts JSON with prose preamble", () => {
    const text = "Here are the issues I extracted:\n\n" + JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2", "fb-3"] },
    ]);
    const issues = parseTriageOutput(text, KNOWN_IDS);
    expect(issues).toHaveLength(1);
  });

  it("preserves optional labels / componentId / sourceFile", () => {
    const text = JSON.stringify([
      {
        title: "T", body: "B",
        labels: ["bug", "ui"],
        componentId: "PricingCard",
        sourceFile: "components/pricing/Card.tsx",
        relatedFeedbackIds: ["fb-1", "fb-2", "fb-3"],
      },
    ]);
    const [issue] = parseTriageOutput(text, KNOWN_IDS);
    expect(issue!.labels).toEqual(["bug", "ui"]);
    expect(issue!.componentId).toBe("PricingCard");
    expect(issue!.sourceFile).toBe("components/pricing/Card.tsx");
  });

  it("throws TriageParseError on malformed JSON", () => {
    expect(() => parseTriageOutput("{not json", KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageParseError when no array found in text", () => {
    expect(() => parseTriageOutput("Sorry, I can't help with that.", KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageParseError when issue is missing required fields", () => {
    const text = JSON.stringify([{ title: "no body or relatedFeedbackIds" }]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageParseError when relatedFeedbackIds is empty", () => {
    const text = JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: [] }]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageCoverageError when an input id is dropped", () => {
    const text = JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2"] }, // missing fb-3
    ]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageCoverageError);
  });

  it("throws TriageCoverageError when an id is duplicated across issues", () => {
    const text = JSON.stringify([
      { title: "T1", body: "B", relatedFeedbackIds: ["fb-1", "fb-2"] },
      { title: "T2", body: "B", relatedFeedbackIds: ["fb-2", "fb-3"] }, // fb-2 dup
    ]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageCoverageError);
  });

  it("throws TriageCoverageError when an unknown id appears", () => {
    const text = JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2", "fb-3", "fb-99"] },
    ]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageCoverageError);
  });

  it("TriageParseError carries raw text for debugging", () => {
    try {
      parseTriageOutput("nope", KNOWN_IDS);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TriageParseError);
      expect((err as TriageParseError).rawText).toBe("nope");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/triage/__tests__/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parse.ts`**

Create `packages/triage/src/parse.ts`:

```ts
import * as zod from "zod";

// Same dual-CJS/ESM Zod workaround as the rest of the repo (see adapter-prisma/src/validation.ts).
const z: typeof zod.z = ("z" in zod ? zod.z : zod) as typeof zod.z;

/**
 * Validated shape of a single issue emitted by the triage LLM.
 */
export interface IssueDraft {
  title: string;
  body: string;
  labels?: string[];
  componentId?: string;
  sourceFile?: string;
  relatedFeedbackIds: string[];
}

const issueSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  labels: z.array(z.string().min(1).max(50)).max(20).optional(),
  componentId: z.string().min(1).max(200).optional(),
  sourceFile: z.string().min(1).max(2000).optional(),
  relatedFeedbackIds: z.array(z.string().min(1)).min(1),
});
const issuesSchema = z.array(issueSchema).min(1);

/**
 * Raised when the LLM output cannot be parsed into a valid issue array.
 * Carries the raw text so the caller can persist it into `failureReason` for debugging.
 */
export class TriageParseError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = "TriageParseError";
    this.rawText = rawText;
  }
}

/**
 * Raised when the parsed issues don't form an exact partition of the input feedbackIds —
 * either an id is dropped, duplicated, or unknown.
 */
export class TriageCoverageError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = "TriageCoverageError";
    this.rawText = rawText;
  }
}

/**
 * Parse the LLM output into a validated `IssueDraft[]`.
 *
 * Steps:
 *   1. Strip prose / markdown fences using the outermost `[...]` extractor.
 *   2. JSON.parse — wrap failure in TriageParseError.
 *   3. Zod validation against issueSchema array — wrap in TriageParseError.
 *   4. Coverage check: every `knownFeedbackIds` entry appears in exactly one issue's
 *      `relatedFeedbackIds`, and no foreign id leaks in. Wrap in TriageCoverageError.
 */
export function parseTriageOutput(text: string, knownFeedbackIds: readonly string[]): IssueDraft[] {
  const arrayText = extractOutermostArray(text);
  if (!arrayText) {
    throw new TriageParseError("LLM output contains no JSON array", text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TriageParseError(`JSON.parse failed: ${msg}`, text);
  }
  const result = issuesSchema.safeParse(parsed);
  if (!result.success) {
    throw new TriageParseError(
      `LLM output failed schema validation: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      text,
    );
  }
  const issues = result.data as IssueDraft[];

  // Coverage check
  const seen = new Set<string>();
  const known = new Set(knownFeedbackIds);
  const dups: string[] = [];
  const unknownIds: string[] = [];
  for (const issue of issues) {
    for (const id of issue.relatedFeedbackIds) {
      if (!known.has(id)) {
        unknownIds.push(id);
        continue;
      }
      if (seen.has(id)) {
        dups.push(id);
        continue;
      }
      seen.add(id);
    }
  }
  const dropped = [...known].filter((id) => !seen.has(id));
  if (dropped.length || dups.length || unknownIds.length) {
    const parts: string[] = [];
    if (dropped.length) parts.push(`dropped: [${dropped.join(", ")}]`);
    if (dups.length) parts.push(`duplicated: [${dups.join(", ")}]`);
    if (unknownIds.length) parts.push(`unknown: [${unknownIds.join(", ")}]`);
    throw new TriageCoverageError(
      `LLM output does not partition input feedbackIds — ${parts.join("; ")}`,
      text,
    );
  }

  return issues;
}

/** Find the outermost `[...]` array in arbitrary text, returning the raw substring or null. */
function extractOutermostArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  // Scan forward, tracking depth, ignoring brackets inside strings.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
```

- [ ] **Step 4: Update `index.ts` exports**

Append to `packages/triage/src/index.ts`:

```ts
export type { IssueDraft } from "./parse.js";
export { parseTriageOutput, TriageCoverageError, TriageParseError } from "./parse.js";
```

- [ ] **Step 5: Run test → green**

Run: `bun run test:run -- packages/triage/__tests__/parse.test.ts`
Expected: 12 passing.

- [ ] **Step 6: Lint + check + commit**

Run: `bun run lint && cd packages/triage && bun run check && cd ../..`
Expected: pass.

```bash
git add packages/triage/src/parse.ts packages/triage/src/index.ts packages/triage/__tests__/parse.test.ts
git commit -m "$(cat <<'EOF'
feat(triage): parseTriageOutput + TriageParseError + TriageCoverageError

Strips prose/markdown fences, JSON.parse, Zod-validates each issue,
then enforces exact-partition coverage of input feedbackIds.
Raw LLM text is carried on both error classes for debugging.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: `@colaborate/triage` — `bundle.ts` (geometry hint helper)

**Files:**
- Create: `packages/triage/src/bundle.ts` (start with the geometry hint export only)
- Create: `packages/triage/__tests__/bundle.test.ts` (geometry tests for now; load tests in Task 15)

- [ ] **Step 1: Write the failing test**

Create `packages/triage/__tests__/bundle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { geometryHint } from "../src/bundle.js";

describe("geometryHint", () => {
  it("rectangle → 'rectangle covering …% × …% of the anchor'", () => {
    const json = JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
    expect(geometryHint(json)).toBe("rectangle covering 50% × 30% of the anchor");
  });

  it("circle → 'circle (rx=…%, ry=…%)'", () => {
    const json = JSON.stringify({ shape: "circle", cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.15 });
    expect(geometryHint(json)).toBe("circle (rx=20%, ry=15%)");
  });

  it("arrow → 'arrow from (…,…) to (…,…)'", () => {
    const json = JSON.stringify({ shape: "arrow", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7, headSize: 12 });
    expect(geometryHint(json)).toBe("arrow from (10%, 20%) to (80%, 70%)");
  });

  it("line → 'line from (…,…) to (…,…)'", () => {
    const json = JSON.stringify({ shape: "line", x1: 0.0, y1: 0.5, x2: 1.0, y2: 0.5 });
    expect(geometryHint(json)).toBe("line from (0%, 50%) to (100%, 50%)");
  });

  it("textbox → 'textbox: \"…\"'", () => {
    const json = JSON.stringify({
      shape: "textbox", x: 0.1, y: 0.1, w: 0.3, h: 0.1, text: "Looks off here", fontSize: 14,
    });
    expect(geometryHint(json)).toBe('textbox: "Looks off here"');
  });

  it("textbox truncates long text to 80 chars + ellipsis", () => {
    const long = "a".repeat(100);
    const json = JSON.stringify({ shape: "textbox", x: 0, y: 0, w: 1, h: 1, text: long, fontSize: 12 });
    expect(geometryHint(json)).toBe(`textbox: "${"a".repeat(80)}…"`);
  });

  it("freehand → 'freehand stroke (N points)'", () => {
    const json = JSON.stringify({
      shape: "freehand",
      points: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]],
      strokeWidth: 3,
    });
    expect(geometryHint(json)).toBe("freehand stroke (3 points)");
  });

  it("invalid JSON → 'unknown geometry'", () => {
    expect(geometryHint("{not json")).toBe("unknown geometry");
  });

  it("unrecognized shape → 'unknown geometry'", () => {
    const json = JSON.stringify({ shape: "polygon", points: [] });
    expect(geometryHint(json)).toBe("unknown geometry");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/triage/__tests__/bundle.test.ts`
Expected: FAIL — module `../src/bundle.js` not found.

- [ ] **Step 3: Implement `bundle.ts` with `geometryHint` only (loadSessionBundle in Task 15)**

Create `packages/triage/src/bundle.ts`:

```ts
import type { Geometry } from "@colaborate/core";

const TEXTBOX_MAX_TEXT = 80;

/**
 * Convert a serialized `Geometry` JSON string into a short English phrase
 * suitable for an LLM prompt. Far cheaper than serializing raw fractions and
 * far easier for the model to reason about.
 *
 * Returns `"unknown geometry"` on any parse failure (fail-soft — geometry hint
 * is decoration, not load-bearing data).
 */
export function geometryHint(geometryJson: string): string {
  let g: Geometry;
  try {
    g = JSON.parse(geometryJson) as Geometry;
  } catch {
    return "unknown geometry";
  }
  switch (g.shape) {
    case "rectangle":
      return `rectangle covering ${pct(g.w)} × ${pct(g.h)} of the anchor`;
    case "circle":
      return `circle (rx=${pct(g.rx)}, ry=${pct(g.ry)})`;
    case "arrow":
      return `arrow from (${pct(g.x1)}, ${pct(g.y1)}) to (${pct(g.x2)}, ${pct(g.y2)})`;
    case "line":
      return `line from (${pct(g.x1)}, ${pct(g.y1)}) to (${pct(g.x2)}, ${pct(g.y2)})`;
    case "textbox": {
      const text = g.text.length > TEXTBOX_MAX_TEXT ? `${g.text.slice(0, TEXTBOX_MAX_TEXT)}…` : g.text;
      return `textbox: "${text}"`;
    }
    case "freehand":
      return `freehand stroke (${g.points.length} points)`;
    default:
      return "unknown geometry";
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
```

- [ ] **Step 4: Update `index.ts` exports**

Append to `packages/triage/src/index.ts`:

```ts
export { geometryHint } from "./bundle.js";
```

- [ ] **Step 5: Run test → green**

Run: `bun run test:run -- packages/triage/__tests__/bundle.test.ts`
Expected: 9 passing.

- [ ] **Step 6: Lint + check + commit**

Run: `bun run lint && cd packages/triage && bun run check && cd ../..`

```bash
git add packages/triage/src/bundle.ts packages/triage/src/index.ts packages/triage/__tests__/bundle.test.ts
git commit -m "$(cat <<'EOF'
feat(triage): geometryHint — short English geometry phrases for prompts

Per-shape one-liners. Far cheaper for the LLM than raw fractions.
Fails soft to "unknown geometry" so a single bad annotation can't
break the prompt build.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `@colaborate/triage` — `bundle.ts` (loadSessionBundle + serializeBundle)

**Files:**
- Modify: `packages/triage/src/bundle.ts` (append `loadSessionBundle` + `serializeBundle` + `BundleFeedbackInput`)
- Modify: `packages/triage/__tests__/bundle.test.ts` (append load + serialize tests)
- Modify: `packages/triage/src/index.ts` (export new types/functions)

- [ ] **Step 1: Write the failing tests**

Append to `packages/triage/__tests__/bundle.test.ts`:

```ts
import { MemoryStore } from "@colaborate/adapter-memory";
import { loadSessionBundle, serializeBundle, type BundleFeedbackInput } from "../src/bundle.js";

describe("loadSessionBundle", () => {
  it("loads session + feedbacks + screenshots keyed by feedbackId", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    const fbA = await store.createFeedback({
      projectName: "p", type: "bug", message: "A", status: "open",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: "Alice", authorEmail: "a@x", clientId: "c-a",
      sessionId: session.id, annotations: [],
    });
    const fbB = await store.createFeedback({
      projectName: "p", type: "bug", message: "B", status: "open",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: "Bob", authorEmail: "b@x", clientId: "c-b",
      sessionId: session.id, annotations: [],
    });
    // unrelated feedback (different session)
    await store.createFeedback({
      projectName: "p", type: "bug", message: "Z", status: "open",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: "Other", authorEmail: "o@x", clientId: "c-z",
      annotations: [],
    });

    // Tiny PNG (1x1 transparent — official PNG bytes, base64-encoded)
    const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    await store.attachScreenshot(fbA.id, `data:image/png;base64,${PNG_1x1}`);

    const bundle = await loadSessionBundle(store, session.id);
    expect(bundle.session.id).toBe(session.id);
    expect(bundle.feedbacks.map((f) => f.id).sort()).toEqual([fbA.id, fbB.id].sort());
    expect(bundle.screenshotsByFeedbackId[fbA.id]).toHaveLength(1);
    expect(bundle.screenshotsByFeedbackId[fbB.id]).toEqual([]);
    // Unrelated feedback NOT in bundle
    expect(bundle.feedbacks.find((f) => f.clientId === "c-z")).toBeUndefined();
  });

  it("throws when session does not exist", async () => {
    const store = new MemoryStore();
    await expect(loadSessionBundle(store, "nope")).rejects.toThrow(/session not found/i);
  });
});

describe("serializeBundle", () => {
  it("emits a JSON string with stable shape", () => {
    const session = {
      id: "s1", projectName: "p",
      reviewerName: "Alice", reviewerEmail: null,
      status: "submitted" as const,
      submittedAt: new Date("2026-04-25T10:00:00Z"),
      triagedAt: null, notes: null, failureReason: null,
      createdAt: new Date("2026-04-25T09:00:00Z"),
      updatedAt: new Date("2026-04-25T10:00:00Z"),
    };
    const feedbacks: BundleFeedbackInput[] = [
      {
        id: "fb-1", message: "header is too low contrast", authorName: "Alice",
        componentId: "Header", sourceFile: "components/Header.tsx", sourceLine: 12,
        url: "https://app/", viewport: "1280x720",
        annotations: [
          { shape: "rectangle", geometry: JSON.stringify({ shape: "rectangle", x: 0, y: 0, w: 0.5, h: 0.1 }) },
        ],
        screenshots: ["/api/colaborate/feedbacks/fb-1/screenshots/abc"],
      },
    ];
    const text = serializeBundle({ session, feedbacks });
    const parsed = JSON.parse(text);
    expect(parsed.session.id).toBe("s1");
    expect(parsed.feedbacks).toHaveLength(1);
    expect(parsed.feedbacks[0].id).toBe("fb-1");
    expect(parsed.feedbacks[0].geometryHint).toMatch(/rectangle/);
    expect(parsed.feedbacks[0].screenshots).toEqual(["/api/colaborate/feedbacks/fb-1/screenshots/abc"]);
  });

  it("omits null/undefined feedback fields cleanly", () => {
    const session = {
      id: "s1", projectName: "p", reviewerName: null, reviewerEmail: null,
      status: "submitted" as const,
      submittedAt: new Date(), triagedAt: null, notes: null, failureReason: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const feedbacks: BundleFeedbackInput[] = [
      {
        id: "fb-1", message: "x", authorName: "A",
        componentId: null, sourceFile: null, sourceLine: null,
        url: "https://app/", viewport: "1280x720",
        annotations: [], screenshots: [],
      },
    ];
    const text = serializeBundle({ session, feedbacks });
    const parsed = JSON.parse(text);
    expect(parsed.feedbacks[0]).not.toHaveProperty("componentId");
    expect(parsed.feedbacks[0]).not.toHaveProperty("sourceFile");
    expect(parsed.feedbacks[0]).not.toHaveProperty("geometryHint");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run -- packages/triage/__tests__/bundle.test.ts`
Expected: FAIL on the new describes — `loadSessionBundle`/`serializeBundle`/`BundleFeedbackInput` not exported.

- [ ] **Step 3: Implement load + serialize**

Append to `packages/triage/src/bundle.ts`:

```ts
import type {
  AnnotationRecord,
  ColaborateStore,
  FeedbackRecord,
  ScreenshotRecord,
  SessionBundle,
  SessionRecord,
} from "@colaborate/core";

/** What the LLM sees per feedback in the prompt body. */
export interface BundleFeedbackInput {
  id: string;
  message: string;
  authorName: string;
  componentId: string | null | undefined;
  sourceFile: string | null | undefined;
  sourceLine: number | null | undefined;
  url: string;
  viewport: string;
  annotations: Array<{ shape: string; geometry: string }>;
  screenshots: string[]; // urls
}

/**
 * Load a session and all its associated data (feedbacks, screenshots) from a `ColaborateStore`.
 *
 * Throws `Error` if the session does not exist (wrapper around `getSession` returning null).
 * Screenshots are returned as a map keyed by feedbackId — feedbacks with no screenshots
 * map to an empty array (never undefined).
 */
export async function loadSessionBundle(store: ColaborateStore, sessionId: string): Promise<SessionBundle> {
  const session: SessionRecord | null = await store.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const all = await store.getFeedbacks({ projectName: session.projectName });
  const feedbacks = all.feedbacks.filter((f: FeedbackRecord) => f.sessionId === sessionId);
  const screenshotsByFeedbackId: Record<string, ScreenshotRecord[]> = {};
  for (const fb of feedbacks) {
    screenshotsByFeedbackId[fb.id] = await store.listScreenshots(fb.id);
  }
  return { session, feedbacks, screenshotsByFeedbackId };
}

/**
 * Serialize a session bundle into the deterministic-JSON user message that the
 * triage LLM will see. Drops null/undefined fields for prompt cleanliness.
 *
 * Accepts the bundle in two shapes:
 *   - The `SessionBundle` from `loadSessionBundle` (keyed by FeedbackRecord)
 *   - A pre-projected shape with `BundleFeedbackInput[]` (used by tests + worker)
 */
export function serializeBundle(input: {
  session: SessionRecord;
  feedbacks: BundleFeedbackInput[];
}): string {
  const out = {
    session: {
      id: input.session.id,
      projectName: input.session.projectName,
      createdAt: input.session.createdAt.toISOString(),
      ...(input.session.reviewerName ? { reviewerName: input.session.reviewerName } : {}),
      ...(input.session.notes ? { notes: input.session.notes } : {}),
    },
    feedbacks: input.feedbacks.map((f) => {
      const firstAnn = f.annotations[0];
      return {
        id: f.id,
        message: f.message,
        authorName: f.authorName,
        ...(f.componentId ? { componentId: f.componentId } : {}),
        ...(f.sourceFile ? { sourceFile: f.sourceFile } : {}),
        ...(f.sourceLine != null ? { sourceLine: f.sourceLine } : {}),
        url: f.url,
        viewport: f.viewport,
        ...(firstAnn ? { shape: firstAnn.shape, geometryHint: geometryHint(firstAnn.geometry) } : {}),
        ...(f.screenshots.length ? { screenshots: f.screenshots } : {}),
      };
    }),
  };
  return JSON.stringify(out, null, 2);
}

/** Project a `FeedbackRecord` (+ its screenshots) into the LLM-facing shape. */
export function projectFeedback(fb: FeedbackRecord, screenshots: ScreenshotRecord[]): BundleFeedbackInput {
  return {
    id: fb.id,
    message: fb.message,
    authorName: fb.authorName,
    componentId: fb.componentId,
    sourceFile: fb.sourceFile,
    sourceLine: fb.sourceLine,
    url: fb.url,
    viewport: fb.viewport,
    annotations: fb.annotations.map((a: AnnotationRecord) => ({ shape: a.shape, geometry: a.geometry })),
    screenshots: screenshots.map((s) => s.url),
  };
}
```

- [ ] **Step 4: Update `index.ts` exports**

Append to `packages/triage/src/index.ts`:

```ts
export {
  type BundleFeedbackInput,
  loadSessionBundle,
  projectFeedback,
  serializeBundle,
} from "./bundle.js";
```

- [ ] **Step 5: Run tests → green**

Run: `bun run test:run -- packages/triage/__tests__/bundle.test.ts`
Expected: 12 passing (9 from Task 14 + 2 load + 2 serialize = 13; adjust if test count differs).

Run: `bun run lint && cd packages/triage && bun run check && cd ../..`

- [ ] **Step 6: Commit**

```bash
git add packages/triage/src/bundle.ts packages/triage/src/index.ts packages/triage/__tests__/bundle.test.ts
git commit -m "$(cat <<'EOF'
feat(triage): loadSessionBundle + serializeBundle + projectFeedback

loadSessionBundle wraps getSession + getFeedbacks + per-feedback
listScreenshots into a single SessionBundle. serializeBundle emits the
deterministic JSON user message; projectFeedback turns a FeedbackRecord
+ its screenshots into the prompt-facing BundleFeedbackInput.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: `@colaborate/triage` — `prompt.ts` + system prompt template

**Files:**
- Create: `packages/triage/src/prompts/triage-system.md`
- Create: `packages/triage/src/prompt.ts`
- Create: `packages/triage/__tests__/prompt.test.ts`
- Modify: `packages/triage/src/index.ts`

- [ ] **Step 1: Author the system prompt template**

Create `packages/triage/src/prompts/triage-system.md`:

```markdown
# Role

You are a triage assistant for the Colaborate visual feedback tool. You receive a feedback session — multiple visual annotations a reviewer drew on a web page — and emit GitHub issues that a developer can act on.

# Output contract

Return ONLY a JSON array of issues. No prose. No markdown. No code fences. Schema:

```
[
  {
    "title": string,                         // imperative, < 80 chars, "Fix X" not "X is broken"
    "body": string,                          // GitHub-flavored markdown, < 4000 chars
    "labels"?: string[],                     // optional, lowercase, e.g. ["bug", "ui"]
    "componentId"?: string,                  // primary component this issue affects
    "sourceFile"?: string,                   // primary source file
    "relatedFeedbackIds": string[]           // ALL feedback ids this issue covers, required, non-empty
  }
]
```

# Grouping rules

- One issue per actionable problem, NOT one issue per feedback.
- Group feedbacks when they share componentId, sourceFile, OR describe the same root cause.
- A feedback that doesn't fit any group still produces its own issue.
- Every input feedback MUST appear in exactly ONE issue's relatedFeedbackIds. No drops, no duplicates.

# Title conventions

- Imperative voice: "Fix Header contrast", "Add empty state to PricingCard".
- Avoid "Bug:" / "Issue:" / "Fixme:" prefixes — let the issue tracker categorize via labels.
- ≤ 80 characters.

# Body conventions

Structured markdown:

- Lead with one sentence of context.
- `## Reviewer notes` — quote each feedback message verbatim, attributed by author name.
- `## Component` — componentId + sourceFile:line if known.
- `## Screenshots` — markdown links: `- [screenshot 1](url)`.
- `## Geometry` — short summary of shape + page coordinates (debug aid).

# Examples

## Example 1 — single-feedback issue

Input:
```
{
  "session": { "id": "s1", "projectName": "parkland", "createdAt": "2026-04-25T10:00:00Z" },
  "feedbacks": [
    {
      "id": "fb-1",
      "message": "the price is cut off on mobile",
      "authorName": "Brian",
      "componentId": "PricingCard",
      "sourceFile": "components/pricing/Card.tsx",
      "sourceLine": 42,
      "url": "https://parkland.dev/pricing",
      "viewport": "375x812",
      "shape": "rectangle",
      "geometryHint": "rectangle covering 50% × 30% of the anchor",
      "screenshots": ["https://col.dev/api/.../screenshots/abc"]
    }
  ]
}
```

Output:
```
[
  {
    "title": "Fix PricingCard price clipping on mobile (375px)",
    "body": "Reviewer reported the price is cut off in the 375px-wide layout.\n\n## Reviewer notes\n\n- @Brian: \"the price is cut off on mobile\"\n\n## Component\n\nPricingCard — `components/pricing/Card.tsx:42`\n\n## Screenshots\n\n- [annotated viewport](https://col.dev/api/.../screenshots/abc)\n\n## Geometry\n\nrectangle covering 50% × 30% of the .price div on `https://parkland.dev/pricing`",
    "labels": ["bug", "mobile"],
    "componentId": "PricingCard",
    "sourceFile": "components/pricing/Card.tsx",
    "relatedFeedbackIds": ["fb-1"]
  }
]
```

## Example 2 — grouped issue

Input:
```
{
  "session": { "id": "s2", "projectName": "parkland", "createdAt": "2026-04-25T10:00:00Z" },
  "feedbacks": [
    { "id": "fb-1", "message": "header contrast is bad", "authorName": "Alice", "componentId": "Header", "url": "https://parkland.dev/", "viewport": "1280x720" },
    { "id": "fb-2", "message": "I can barely read the menu items", "authorName": "Bob", "componentId": "Header", "url": "https://parkland.dev/", "viewport": "1280x720" },
    { "id": "fb-3", "message": "footer link styling looks off", "authorName": "Alice", "componentId": "Footer", "url": "https://parkland.dev/", "viewport": "1280x720" }
  ]
}
```

Output:
```
[
  {
    "title": "Fix Header contrast / readability",
    "body": "Two reviewers flagged poor contrast in the Header.\n\n## Reviewer notes\n\n- @Alice: \"header contrast is bad\"\n- @Bob: \"I can barely read the menu items\"\n\n## Component\n\nHeader",
    "labels": ["bug", "a11y"],
    "componentId": "Header",
    "relatedFeedbackIds": ["fb-1", "fb-2"]
  },
  {
    "title": "Tweak Footer link styling",
    "body": "Reviewer noted Footer link styling looks off.\n\n## Reviewer notes\n\n- @Alice: \"footer link styling looks off\"\n\n## Component\n\nFooter",
    "labels": ["polish"],
    "componentId": "Footer",
    "relatedFeedbackIds": ["fb-3"]
  }
]
```
```

- [ ] **Step 2: Write the failing test**

Create `packages/triage/__tests__/prompt.test.ts`:

```ts
import type { SessionRecord } from "@colaborate/core";
import { describe, expect, it } from "vitest";
import { type BundleFeedbackInput } from "../src/bundle.js";
import { buildTriagePrompt, TRIAGE_SYSTEM_PROMPT } from "../src/prompt.js";

const session: SessionRecord = {
  id: "s1", projectName: "p",
  reviewerName: null, reviewerEmail: null,
  status: "submitted",
  submittedAt: new Date("2026-04-25T10:00:00Z"),
  triagedAt: null, notes: null, failureReason: null,
  createdAt: new Date("2026-04-25T09:00:00Z"),
  updatedAt: new Date("2026-04-25T10:00:00Z"),
};

const fb: BundleFeedbackInput = {
  id: "fb-1", message: "x", authorName: "A",
  componentId: null, sourceFile: null, sourceLine: null,
  url: "https://x", viewport: "1280x720",
  annotations: [], screenshots: [],
};

describe("buildTriagePrompt", () => {
  it("returns { system: [{type:'text', text, cache_control}], user: string }", () => {
    const p = buildTriagePrompt({ session, feedbacks: [fb] });
    expect(p.system).toEqual([
      { type: "text", text: TRIAGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ]);
    expect(typeof p.user).toBe("string");
    expect(p.user).toContain("fb-1");
  });

  it("system text contains the JSON output contract heading", () => {
    expect(TRIAGE_SYSTEM_PROMPT).toContain("Output contract");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("relatedFeedbackIds");
  });

  it("system text contains at least 2 worked examples", () => {
    expect(TRIAGE_SYSTEM_PROMPT).toContain("Example 1");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("Example 2");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:run -- packages/triage/__tests__/prompt.test.ts`
Expected: FAIL — `../src/prompt.js` not found.

- [ ] **Step 4: Implement `prompt.ts`**

Create `packages/triage/src/prompt.ts`:

```ts
import { type BundleFeedbackInput, serializeBundle } from "./bundle.js";
import type { SessionRecord } from "@colaborate/core";
// Markdown imported as text via tsup's `loader: { ".md": "text" }` config.
import TRIAGE_SYSTEM_PROMPT_RAW from "./prompts/triage-system.md";

export const TRIAGE_SYSTEM_PROMPT: string = TRIAGE_SYSTEM_PROMPT_RAW as unknown as string;

/** System block used in the Anthropic call — `cache_control: ephemeral` keeps the template warm for 5 minutes. */
export interface TriageSystemBlock {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
}

export interface BuiltTriagePrompt {
  system: TriageSystemBlock[];
  user: string;
}

/** Compose the system + user messages for an Anthropic `messages.create` call. */
export function buildTriagePrompt(input: {
  session: SessionRecord;
  feedbacks: BundleFeedbackInput[];
}): BuiltTriagePrompt {
  return {
    system: [{ type: "text", text: TRIAGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    user: serializeBundle(input),
  };
}
```

- [ ] **Step 5: Vitest needs the same `.md` text loader**

Vitest by default doesn't run tsup's loader config. Add a tiny `vitest.config.ts` override at the package level if absent — but check first whether the root `vitest.config.ts` already has a workspace/match config that handles raw imports.

If the root `vitest.config.ts` doesn't handle `?raw` / text imports, modify the import in `prompt.ts` to use Vite's `?raw` query syntax (which Vitest supports natively):

```ts
import TRIAGE_SYSTEM_PROMPT_RAW from "./prompts/triage-system.md?raw";
```

Then update `tsup.config.ts` to declare the `?raw` query loader. Or, simpler: drop the markdown import entirely and inline the prompt as a TypeScript string literal in `prompt.ts`. Pick whichever produces green tests AND a green `bun run build`.

**Recommendation:** start with `?raw` — it's the most portable. If Vitest still complains, fall back to inlining the prompt.

If inlining is needed: change `prompt.ts` to:

```ts
export const TRIAGE_SYSTEM_PROMPT = `# Role

You are a triage assistant for the Colaborate visual feedback tool. ...
` as const;
```

(Paste the full template content from `triage-system.md` between the backticks.)

- [ ] **Step 6: Run test → green**

Run: `bun run test:run -- packages/triage/__tests__/prompt.test.ts`
Expected: 3 passing.

Run: `bun run build`
Expected: 10/10 packages build (the triage package's tsup must produce dist that includes the inlined prompt).

- [ ] **Step 7: Update `index.ts` exports**

Append to `packages/triage/src/index.ts`:

```ts
export { buildTriagePrompt, type BuiltTriagePrompt, TRIAGE_SYSTEM_PROMPT, type TriageSystemBlock } from "./prompt.js";
```

- [ ] **Step 8: Lint + check + commit**

Run: `bun run lint && bun run check`

```bash
git add packages/triage/src/prompt.ts packages/triage/src/prompts/triage-system.md packages/triage/src/index.ts packages/triage/__tests__/prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(triage): TRIAGE_SYSTEM_PROMPT + buildTriagePrompt

System block with cache_control: ephemeral so every triage call after
the first warm hit (within 5 minutes) is much cheaper. User message
is the deterministic JSON bundle. Two worked few-shot examples cover
single-feedback and grouped-feedback cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: `@colaborate/triage` — `worker.ts` (the TriageWorker class)

**Files:**
- Create: `packages/triage/src/worker.ts`
- Create: `packages/triage/__tests__/worker.test.ts`
- Modify: `packages/triage/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/triage/__tests__/worker.test.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
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
  // Build a partial that satisfies what the worker reads (`.messages.create`).
  return { messages: { create } } as unknown as Anthropic;
}

async function seedSubmittedSession(store: MemoryStore, count = 3) {
  const session = await store.createSession({ projectName: "p" });
  const fbs = [];
  for (let i = 0; i < count; i++) {
    fbs.push(await store.createFeedback({
      projectName: "p", type: "bug", message: `m${i}`, status: "draft",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: `A${i}`, authorEmail: `a${i}@x`, clientId: `c-${i}`,
      sessionId: session.id, annotations: [],
    }));
  }
  await store.submitSession(session.id);
  return { session: await store.getSession(session.id), feedbacks: fbs };
}

function fakeAnthropicResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    id: "msg_x", model: "claude-sonnet-4-6", role: "assistant",
    stop_reason: "end_turn", stop_sequence: null, type: "message",
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
      fakeAnthropicResponse(JSON.stringify([
        { title: "Group A", body: "B", relatedFeedbackIds: ids.slice(0, 2) },
        { title: "Single B", body: "B", relatedFeedbackIds: ids.slice(2) },
      ])),
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
      fakeAnthropicResponse(JSON.stringify([
        { title: "T1", body: "B", relatedFeedbackIds: [ids[0]!] },
        { title: "T2", body: "B", relatedFeedbackIds: [ids[1]!, ids[2]!] },
      ])),
    );
    // First createIssue succeeds, second throws
    adapter.createIssue
      .mockImplementationOnce(async () => ({ provider: "github", issueId: "1", issueUrl: "https://x/issues/1" }))
      .mockImplementationOnce(async () => { throw new Error("502 Bad Gateway"); });

    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toMatch(/^github: created 1 of 2/i);

    const fbsOut = await store.getFeedbacks({ projectName: "p" });
    expect(fbsOut.feedbacks.find((f) => f.id === ids[0])?.externalIssueUrl).toBe("https://x/issues/1");
    expect(fbsOut.feedbacks.find((f) => f.id === ids[1])?.externalIssueUrl).toBeNull();
  });

  it("triageSession: idempotent — concurrent call when status is 'triaged' aborts cleanly", async () => {
    const { session } = await seedSubmittedSession(store, 1);
    const ids = [(await store.getFeedbacks({ projectName: "p" })).feedbacks[0]!.id];
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeAnthropicResponse(JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ids }])),
    );
    await worker.triageSession(session!.id); // → triaged

    const result = await worker.triageSession(session!.id); // already triaged
    expect(result.status).toBe("triaged");
    // Second call must not have called Anthropic again
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it("triageSession: retry-from-failed skips already-linked feedbacks", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 3);
    const ids = feedbacks.map((f) => f.id);

    // First triage: 1 succeeds, 2 fail
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(JSON.stringify([
        { title: "T1", body: "B", relatedFeedbackIds: [ids[0]!] },
        { title: "T2", body: "B", relatedFeedbackIds: [ids[1]!, ids[2]!] },
      ])),
    );
    adapter.createIssue
      .mockImplementationOnce(async () => ({ provider: "github", issueId: "1", issueUrl: "https://x/issues/1" }))
      .mockImplementationOnce(async () => { throw new Error("boom"); });
    await worker.triageSession(session!.id);
    expect((await store.getSession(session!.id))?.status).toBe("failed");

    // Retry: only ids[1] + ids[2] should be in the bundle (ids[0] already linked)
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeAnthropicResponse(JSON.stringify([
        { title: "Retry", body: "B", relatedFeedbackIds: [ids[1]!, ids[2]!] },
      ])),
    );
    adapter.createIssue.mockImplementationOnce(async () => ({
      provider: "github", issueId: "2", issueUrl: "https://x/issues/2",
    }));
    const result = await worker.triageSession(session!.id);
    expect(result.status).toBe("triaged");
    expect(adapter.createIssue).toHaveBeenCalledTimes(3); // 1 first attempt + 1 failed + 1 retry success

    const fbsOut = await store.getFeedbacks({ projectName: "p" });
    expect(fbsOut.feedbacks.find((f) => f.id === ids[1])?.externalIssueUrl).toBe("https://x/issues/2");
  });

  it("triageSession: all feedbacks already linked → markSessionTriaged immediately, no LLM call", async () => {
    const { session, feedbacks } = await seedSubmittedSession(store, 2);
    const ids = feedbacks.map((f) => f.id);
    for (const id of ids) {
      await store.setFeedbackExternalIssue(id, { provider: "github", issueId: "1", issueUrl: "https://x/issues/1" });
    }
    // Force into failed for retry path
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
        if (s?.status === "triaged") { clearInterval(interval); resolve(); }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run -- packages/triage/__tests__/worker.test.ts`
Expected: FAIL — `../src/worker.js` not found.

- [ ] **Step 3: Implement `worker.ts`**

Create `packages/triage/src/worker.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { ColaborateStore, FeedbackRecord, IssueRef, SessionRecord, TrackerAdapter } from "@colaborate/core";
import { type BundleFeedbackInput, projectFeedback, serializeBundle } from "./bundle.js";
import type { TriageEventBus, TriageEventHandler } from "./event-bus.js";
import { TriageCoverageError, TriageParseError, parseTriageOutput } from "./parse.js";
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
      // Fire-and-forget. Errors are caught + logged; status flip handles persistence.
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
      // Already triaged (or drafting / archived) — return current state, don't reprocess.
      return {
        status: session.status === "triaged" ? "triaged" : "failed",
        failureReason: session.failureReason,
      };
    }

    // Load feedbacks for this session
    const all = await this.store.getFeedbacks({ projectName: session.projectName });
    const sessionFeedbacks = all.feedbacks.filter((f) => f.sessionId === sessionId);
    const unlinked = sessionFeedbacks.filter((f) => !f.externalIssueUrl);

    if (sessionFeedbacks.length === 0) {
      // No feedbacks — vacuous success
      const updated = await this.store.markSessionTriaged(sessionId);
      return { status: "triaged", failureReason: updated.failureReason };
    }

    if (unlinked.length === 0) {
      // Retry path with everything already linked
      const updated = await this.store.markSessionTriaged(sessionId);
      return { status: "triaged", failureReason: updated.failureReason };
    }

    // ----- Step 1: Anthropic call ---------------------------------------
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

    // ----- Step 2: parse + coverage -------------------------------------
    let issues;
    try {
      issues = parseTriageOutput(llmText, unlinked.map((f) => f.id));
    } catch (err) {
      const tag = err instanceof TriageParseError || err instanceof TriageCoverageError ? "parse" : "parse";
      return await this.fail(sessionId, `${tag}: ${errorMsg(err)}`);
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
        return await this.fail(
          sessionId,
          `github: created ${created} of ${issues.length}, then: ${errorMsg(err)}`,
        );
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
      // Marking-failed itself failed (e.g. session got archived mid-flight). Log + return synthetic result.
      console.error(`[colaborate/triage] markSessionFailed itself failed for ${sessionId}:`, err);
      return { status: "failed", failureReason: reason };
    }
  }
}

function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

- [ ] **Step 4: Update `index.ts` exports**

Append to `packages/triage/src/index.ts`:

```ts
export { TriageWorker, type TriageResult, type TriageWorkerOptions } from "./worker.js";
```

- [ ] **Step 5: Run test → green**

Run: `bun run test:run -- packages/triage/__tests__/worker.test.ts`
Expected: 9 passing.

Run: `bun run test:run`
Expected: ~1190+ tests pass (5 prior triage + 9 worker = ~14 added in Tasks 12-17, plus all the foundation work).

- [ ] **Step 6: Lint + check + build + commit**

Run: `bun run lint && bun run check && bun run build`
Expected: all pass.

```bash
git add packages/triage/src/worker.ts packages/triage/src/index.ts packages/triage/__tests__/worker.test.ts
git commit -m "$(cat <<'EOF'
feat(triage): TriageWorker — happy path + retry + 5 failure modes

start() subscribes to session.submitted; triageSession is the manual
retry entry point. Failure modes: anthropic, parse, github (with
'created N of M' partial-progress reason). Retry path skips already
linked feedbacks; all-linked → immediate markTriaged with no LLM call.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: `@colaborate/adapter-prisma` — emit `session.submitted` + manual retry route

**Files:**
- Modify: `packages/adapter-prisma/package.json` (add `@colaborate/triage` peer + dev dep)
- Modify: `packages/adapter-prisma/src/routes-sessions.ts` (extend `SessionRoute` with `triage` kind, add `handleTriageSession`, accept event-bus + worker via parameter)
- Modify: `packages/adapter-prisma/src/validation.ts` (extend session list schema enum to include `failed`)
- Modify: `packages/adapter-prisma/src/index.ts` (extend `HandlerOptions` with `triage?` + `eventBus?`, dispatch new route, emit on submit)
- Create: `packages/adapter-prisma/__tests__/routes-triage.test.ts` (route-level unit tests)
- Create: `packages/adapter-prisma/__tests__/handler-triage.test.ts` (integration test through `createColaborateHandler`)

- [ ] **Step 1: Add the workspace dep**

Edit `packages/adapter-prisma/package.json` — add to `peerDependencies`:

```json
"peerDependencies": {
  "@colaborate/core": "workspace:*",
  "@colaborate/triage": "workspace:*"
},
```

And to `devDependencies`:

```json
"@colaborate/triage": "workspace:*",
```

(Mark `@colaborate/triage` as `peerDependenciesMeta.optional` if the package supports it, so consumers without triage don't get install warnings:

```json
"peerDependenciesMeta": {
  "@colaborate/triage": { "optional": true }
}
```
)

Run: `bun install`
Expected: workspace symlink created.

- [ ] **Step 2: Extend `validation.ts` for `failed` status**

In `packages/adapter-prisma/src/validation.ts`, find:
```ts
export const sessionListQuerySchema = z.object({
  projectName: z.string().min(1).max(200),
  status: z.enum(["drafting", "submitted", "triaged", "archived"] as const).optional(),
});
```
Replace the status enum to include `"failed"`:
```ts
status: z.enum(["drafting", "submitted", "triaged", "failed", "archived"] as const).optional(),
```

- [ ] **Step 3: Write the failing test for the manual retry route handler**

Create `packages/adapter-prisma/__tests__/routes-triage.test.ts`:

```ts
import { MemoryStore } from "@colaborate/adapter-memory";
import { TriageWorker, InProcessEventBus } from "@colaborate/triage";
import type { TrackerAdapter } from "@colaborate/core";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { handleTriageSession, matchSessionRoute } from "../src/routes-sessions.js";

function makeAdapter(): TrackerAdapter {
  return {
    name: "github",
    async createIssue(input) {
      return { provider: "github", issueId: "1", issueUrl: `https://x/issues/1#${input.title.slice(0,3)}` };
    },
    async updateIssue() { /* noop */ },
    async linkResolve() { return { resolved: false }; },
  };
}

function fakeAnthropic(text: string) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text" as const, text }],
    id: "x", model: "x", role: "assistant",
    stop_reason: "end_turn", stop_sequence: null, type: "message",
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
      projectName: "p", type: "bug", message: "x", status: "draft",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: "A", authorEmail: "a@x", clientId: "c1", sessionId: session.id, annotations: [],
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
    const worker = new TriageWorker({ store, anthropic: fakeAnthropic("[]"), trackerAdapter: adapter, eventBus: new InProcessEventBus() });

    const res = await handleTriageSession(store, session.id, worker);
    expect(res.status).toBe(409);
  });

  it("returns 404 when session does not exist", async () => {
    const store = new MemoryStore();
    const adapter = makeAdapter();
    const worker = new TriageWorker({ store, anthropic: fakeAnthropic("[]"), trackerAdapter: adapter, eventBus: new InProcessEventBus() });

    const res = await handleTriageSession(store, "nope", worker);
    expect(res.status).toBe(404);
  });

  it("returns 500 when worker reports failed status", async () => {
    const store = new MemoryStore();
    const session = await store.createSession({ projectName: "p" });
    await store.submitSession(session.id);
    const adapter = makeAdapter();
    const anthropic = fakeAnthropic("not json at all"); // forces parse failure
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun run test:run -- packages/adapter-prisma/__tests__/routes-triage.test.ts`
Expected: FAIL — `handleTriageSession` not exported, `triage` kind missing from `matchSessionRoute`.

- [ ] **Step 5: Implement handler + route extension**

Modify `packages/adapter-prisma/src/routes-sessions.ts`:

a. Extend the `SessionRoute` union:
```ts
export type SessionRoute =
  | { kind: "create" }
  | { kind: "submit"; id: string }
  | { kind: "triage"; id: string }
  | { kind: "list" }
  | { kind: "get"; id: string };
```

b. In `matchSessionRoute`, find the existing 2-segment branch:
```ts
if (segments.length === 2 && segments[0] && segments[1] === "submit") {
  if (method === "POST") return { kind: "submit", id: segments[0] };
  return null;
}
```
AFTER it, add:
```ts
if (segments.length === 2 && segments[0] && segments[1] === "triage") {
  if (method === "POST") return { kind: "triage", id: segments[0] };
  return null;
}
```

c. After `handleSubmitSession`, add `handleTriageSession`. Note the `worker` parameter type uses the public `TriageWorker` re-exported from `@colaborate/triage` (peer dep):

```ts
export async function handleTriageSession(
  store: ColaborateStore,
  id: string,
  worker: { triageSession(id: string): Promise<{ status: "triaged" | "failed"; failureReason: string | null }> } | null,
): Promise<Response> {
  const session = await store.getSession(id);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.status !== "submitted" && session.status !== "failed") {
    return Response.json(
      { error: `Cannot triage session in status '${session.status}'` },
      { status: 409 },
    );
  }
  if (!worker) {
    return Response.json({ error: "Triage worker not configured" }, { status: 503 });
  }
  try {
    const result = await worker.triageSession(id);
    if (result.status === "failed") {
      return Response.json(
        { error: result.failureReason ?? "Triage failed" },
        { status: 500 },
      );
    }
    const updated = await store.getSession(id);
    return Response.json(updated, { status: 200 });
  } catch (err) {
    console.error("[colaborate] handleTriageSession unexpected error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

d. Modify `handleSubmitSession` to accept an optional event-bus and emit on success:

```ts
export async function handleSubmitSession(
  store: ColaborateStore,
  id: string,
  eventBus?: { emit(event: "session.submitted", payload: { sessionId: string }): void } | null,
): Promise<Response> {
  try {
    const record = await store.submitSession(id);
    eventBus?.emit("session.submitted", { sessionId: id });
    return Response.json(record, { status: 200 });
  } catch (error) {
    if (isStoreNotFoundLike(error)) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    throw error;
  }
}
```

(The structural type for the bus avoids importing from `@colaborate/triage` here — keeps the file's import surface small.)

- [ ] **Step 6: Wire into `createColaborateHandler`**

In `packages/adapter-prisma/src/index.ts`:

a. Extend `HandlerOptions`:
```ts
  /**
   * Optional triage worker. When provided, the manual retry route
   * `POST /api/colaborate/sessions/:id/triage` becomes available.
   */
  triage?: { triageSession(id: string): Promise<{ status: "triaged" | "failed"; failureReason: string | null }> } | undefined;
  /**
   * Optional event bus. When provided, `handleSubmitSession` emits
   * `session.submitted` after the status flip — wire a `TriageWorker` to
   * the same bus to get fire-and-forget triage on submit.
   */
  eventBus?: { emit(event: "session.submitted", payload: { sessionId: string }): void } | undefined;
```

b. Destructure in the function header:
```ts
export function createColaborateHandler({
  prisma,
  store: providedStore,
  apiKey,
  publicEndpoints = apiKey ? ["POST", "OPTIONS"] : undefined,
  allowedOrigins,
  sourcemapStore: providedSourcemapStore,
  sourcemapStorePath,
  screenshotStore: providedScreenshotStore,
  screenshotStorePath,
  screenshotMaxBytes = DEFAULT_SCREENSHOT_MAX_BYTES,
  triage,
  eventBus,
}: HandlerOptions): ColaborateHandler {
```

c. In the POST handler, find the existing session-route handling block (around line 573). Update the inline dispatch:
```ts
        if (sessionRoute.kind === "submit") {
          return withCors(await handleSubmitSession(store, sessionRoute.id, eventBus), corsHeaders);
        }
        if (sessionRoute.kind === "triage") {
          return withCors(await handleTriageSession(store, sessionRoute.id, triage ?? null), corsHeaders);
        }
```

Make sure `handleTriageSession` is imported at the top of the file alongside `handleSubmitSession`.

- [ ] **Step 7: Write the integration test**

Create `packages/adapter-prisma/__tests__/handler-triage.test.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "@colaborate/adapter-memory";
import { InProcessEventBus, TriageWorker } from "@colaborate/triage";
import type { TrackerAdapter } from "@colaborate/core";
import { describe, expect, it, vi } from "vitest";
import { createColaborateHandler } from "../src/index.js";

function fakeAnthropic(text: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text" as const, text }],
        id: "x", model: "x", role: "assistant",
        stop_reason: "end_turn", stop_sequence: null, type: "message",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    },
  } as unknown as Anthropic;
}

function fakeAdapter(): TrackerAdapter & { createIssue: ReturnType<typeof vi.fn> } {
  const createIssue = vi.fn().mockResolvedValue({
    provider: "github", issueId: "1", issueUrl: "https://x/issues/1",
  });
  return {
    name: "github",
    createIssue,
    async updateIssue() { /* noop */ },
    async linkResolve() { return { resolved: false }; },
  };
}

describe("createColaborateHandler with triage", () => {
  it("end-to-end: POST /sessions/:id/submit fires triage → issue created → externalIssueUrl set → triaged", async () => {
    const store = new MemoryStore();
    const adapter = fakeAdapter();
    const session = await store.createSession({ projectName: "p" });
    const fb = await store.createFeedback({
      projectName: "p", type: "bug", message: "x", status: "draft",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: "A", authorEmail: "a@x", clientId: "c1", sessionId: session.id, annotations: [],
    });
    const anthropic = fakeAnthropic(JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: [fb.id] },
    ]));
    const bus = new InProcessEventBus();
    const triage = new TriageWorker({ store, anthropic, trackerAdapter: adapter, eventBus: bus });
    triage.start();

    const handler = createColaborateHandler({ store, eventBus: bus, triage });
    const req = new Request(`https://x/api/colaborate/sessions/${session.id}/submit`, { method: "POST" });
    const res = await handler.POST(req);
    expect(res.status).toBe(200);

    // Wait for fire-and-forget triage to complete
    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const s = await store.getSession(session.id);
        if (s?.status === "triaged" || s?.status === "failed") { clearInterval(interval); resolve(); }
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
      projectName: "p", type: "bug", message: "x", status: "draft",
      url: "https://x", viewport: "1280x720", userAgent: "ua",
      authorName: "A", authorEmail: "a@x", clientId: "c1", sessionId: session.id, annotations: [],
    });
    await store.submitSession(session.id);
    await store.markSessionFailed(session.id, "earlier failure");

    const anthropic = fakeAnthropic(JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: [fb.id] },
    ]));
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

    const handler = createColaborateHandler({ store }); // no triage, no eventBus
    const req = new Request(`https://x/api/colaborate/sessions/${session.id}/submit`, { method: "POST" });
    const res = await handler.POST(req);
    expect(res.status).toBe(200);

    expect((await store.getSession(session.id))?.status).toBe("submitted");
  });
});
```

- [ ] **Step 8: Run all triage-related tests + full suite**

Run: `bun run test:run -- packages/adapter-prisma/__tests__/routes-triage.test.ts packages/adapter-prisma/__tests__/handler-triage.test.ts`
Expected: 8 tests pass (5 routes + 3 handler).

Run: `bun run test:run`
Expected: ~1200+ tests pass total (1128 baseline + ~70 new across Tasks 1-18).

- [ ] **Step 9: Lint + check + build**

Run: `bun run lint && bun run check && bun run build`
Expected: all pass. 10/10 build, 13/13 check, biome clean.

- [ ] **Step 10: Commit**

```bash
git add packages/adapter-prisma/package.json packages/adapter-prisma/src/routes-sessions.ts packages/adapter-prisma/src/validation.ts packages/adapter-prisma/src/index.ts packages/adapter-prisma/__tests__/routes-triage.test.ts packages/adapter-prisma/__tests__/handler-triage.test.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): emit session.submitted + manual retry route

Adds triage? + eventBus? options to createColaborateHandler.
handleSubmitSession emits session.submitted after the status flip.
New POST /api/colaborate/sessions/:id/triage route for manual retry —
returns 200/409/404/500/503 depending on session state and worker
availability.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: `apps/demo` — wire triage worker + GitHub adapter from env vars

**Files:**
- Modify: `apps/demo/package.json` (deps)
- Modify: `apps/demo/app/api/colaborate/route.ts` (wire it up)

- [ ] **Step 1: Add deps**

In `apps/demo/package.json`, append to `dependencies`:

```json
"@colaborate/integration-github": "workspace:*",
"@colaborate/triage": "workspace:*",
"@anthropic-ai/sdk": "^0.40.0",
```

(Use the same version as `packages/triage/package.json` — keep them aligned.)

Run: `bun install`

- [ ] **Step 2: Read the existing route file**

Run `cat apps/demo/app/api/colaborate/route.ts` and locate the `createColaborateHandler` call.

- [ ] **Step 3: Add the wiring**

At the top of `apps/demo/app/api/colaborate/route.ts`, add imports:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createGitHubAdapter } from "@colaborate/integration-github";
import { InProcessEventBus, TriageWorker } from "@colaborate/triage";
```

Above the existing `createColaborateHandler({...})` call, add the wiring block:

```ts
const trackerAdapter = process.env.GITHUB_TOKEN && process.env.COLABORATE_GITHUB_REPO
  ? createGitHubAdapter({
      token: process.env.GITHUB_TOKEN,
      repo: process.env.COLABORATE_GITHUB_REPO,
    })
  : undefined;

const triageBus = new InProcessEventBus();
const triageWorker = trackerAdapter && process.env.ANTHROPIC_API_KEY
  ? new TriageWorker({
      store,
      anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      trackerAdapter,
      eventBus: triageBus,
      ...(process.env.COLABORATE_TRIAGE_MODEL ? { model: process.env.COLABORATE_TRIAGE_MODEL } : {}),
    })
  : undefined;

if (triageWorker) triageWorker.start();
```

(If the existing file doesn't already create a `store` variable explicitly, add `const store = new MemoryStore()` or similar — match what the existing demo uses. Check `apps/demo/app/api/colaborate/route.ts` to see the pattern.)

Then extend the existing `createColaborateHandler({...})` call by spreading two more options:

```ts
const handler = createColaborateHandler({
  store,
  // ... existing opts
  ...(triageBus ? { eventBus: triageBus } : {}),
  ...(triageWorker ? { triage: triageWorker } : {}),
});
```

- [ ] **Step 4: Build + sanity gates**

Run: `bun run build`
Expected: `@colaborate/demo:build` passes (Next.js build), 10/10 packages build.

Run: `bun run check`
Expected: 13/13 pass.

Run: `bun run lint`
Expected: clean.

Run: `bun run test:run`
Expected: ~1200+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/demo/package.json apps/demo/app/api/colaborate/route.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(demo): wire TriageWorker + GitHub adapter from env vars

GITHUB_TOKEN + COLABORATE_GITHUB_REPO + ANTHROPIC_API_KEY all required
to enable triage; missing any → triage is skipped and submit still
works. COLABORATE_TRIAGE_MODEL optionally overrides the default
claude-sonnet-4-6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: status.md + todo.md + final gates

**Files:**
- Modify: `status.md` (append Phase 5 section, bump current state)
- Modify: `todo.md` (move Phase 5 from "Next Up" → "Completed This Session")

- [ ] **Step 1: Run full gates one more time as the source of truth**

Run: `bun run lint && bun run check && bun run test:run && bun run build`
Expected: lint clean, check 13/13, test ~1200+ passing, build 10/10. Capture the actual test count for status.md.

- [ ] **Step 2: Append Phase 5 to status.md**

Open `status.md`. Add row to the "What's landed" table:

```
| **Phase 5** — Triage worker + GitHub adapter (in-process fire-and-forget on `session.submitted`, LLM-grouped GH issues, manual retry) | ✅ | `<final SHA>` | `v0.6.0-phase-5` |
```

(Replace `<final SHA>` with the actual head SHA. Tag will be created in Step 5.)

Then bump the "Current main branch state" block to the new test counts. Add a "What Phase 5 shipped" section near the top of the body (mirror the format of "What Phase 4b shipped"). Keep it factual: list the two new packages, the 3 new store methods, the new route, the env vars, the test count delta.

- [ ] **Step 3: Update todo.md**

Move the "Phase 5" line from "Next Up" → "Completed This Session". Add the tag and SHA. Also remove the now-resolved 4b chips that landed in commits `72fa3f5` and `d096a7a` from "Phase 4b follow-ups" if they're still listed there (the StoreValidationError 400 mapping + env-configurable cap).

- [ ] **Step 4: Commit docs**

```bash
git add status.md todo.md
git commit -m "$(cat <<'EOF'
docs: status.md + todo.md for Phase 5 completion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Tag**

```bash
git tag v0.6.0-phase-5
```

(Don't push — let the user push when ready, same pattern as Phase 4b.)

- [ ] **Step 6: Print a summary for the user**

Output the final shape:
- Test count: ~1128 baseline → ~1200+ (capture actual)
- Build: 10/10 packages
- Tag: `v0.6.0-phase-5`
- New packages: `@colaborate/triage`, `@colaborate/integration-github`
- New env vars to configure: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `COLABORATE_GITHUB_REPO`, optional `COLABORATE_TRIAGE_MODEL`
- Manual smoke test sketch:
  ```bash
  export ANTHROPIC_API_KEY=...
  export GITHUB_TOKEN=...
  export COLABORATE_GITHUB_REPO=Jabberwockyjib/colaborate
  bun run dev   # start demo
  # Open http://localhost:3000, draw 3 annotations, submit session
  # Within ~10s, check https://github.com/Jabberwockyjib/colaborate/issues
  ```

Phase 5 is complete when: a real session submitted against a real Anthropic key + real GitHub PAT produces real GitHub issues at `Jabberwockyjib/colaborate`, with `externalIssueUrl` populated on each related feedback, and session status = `triaged`.

---

## Spec coverage matrix

| Spec section | Tasks |
|---|---|
| `SESSION_STATUSES` adds `failed` | Task 1 |
| `SessionRecord.failureReason` column | Task 1 |
| `TrackerAdapter` interface + `IssueInput`/`IssueRef`/`IssuePatch` | Task 2 |
| `SessionBundle` type | Task 2 |
| `setFeedbackExternalIssue` / `markSessionTriaged` / `markSessionFailed` (interface) | Task 3 |
| Conformance suite extended | Task 4 |
| Memory adapter impl | Task 5 |
| LocalStorage adapter impl | Task 6 |
| Prisma adapter impl + state transitions | Task 7 |
| `@colaborate/integration-github` package + `createGitHubAdapter` | Tasks 8-10 |
| `@colaborate/triage` package + `TriageEventBus` + `InProcessEventBus` | Tasks 11-12 |
| `parseTriageOutput` + parse/coverage errors | Task 13 |
| `geometryHint` per shape | Task 14 |
| `loadSessionBundle` + `serializeBundle` | Task 15 |
| `TRIAGE_SYSTEM_PROMPT` + `buildTriagePrompt` (cache_control: ephemeral) | Task 16 |
| `TriageWorker` (happy path + 5 error modes + retry skip-already-linked) | Task 17 |
| `handleSubmitSession` emits `session.submitted` | Task 18 |
| `POST /api/colaborate/sessions/:id/triage` manual retry route | Task 18 |
| `createColaborateHandler` accepts `triage?` + `eventBus?` | Task 18 |
| `apps/demo` wires it from env vars (all opt-in) | Task 19 |
| status.md + todo.md updated; final gates green | Task 20 |

