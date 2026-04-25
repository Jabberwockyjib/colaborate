# Colaborate — Phase 4a: Sourcemap uploader CLI + ingest/resolver endpoints + widget dev-mode source capture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the sourcemap half of Phase 4. Three layers land together:
1. A **backend sourcemap store + ingest + resolver** (`@colaborate/adapter-prisma` + a new `SourcemapStore` interface in `@colaborate/core`). Two new API-key-authed HTTP routes: `POST /api/colaborate/sourcemaps` (ingest) and `POST /api/colaborate/resolve-source` (resolve bundled line/col → original file/line/col via `@jridgewell/trace-mapping`).
2. A **CLI command** `colaborate upload-sourcemaps --project <name> --env <env> --dir <dir>` that globs `.map` files, hashes each, gzips, POSTs to the ingest endpoint with bearer auth.
3. A **widget-side dev-mode source capture**: a new `dom/source.ts` module walks React fiber on the annotated element and extracts `_debugSource.{fileName, lineNumber, columnNumber}` when available. Those fields ride a new `source` sibling on the annotator's `AnnotationComplete` event and are attached to the feedback POST as three new optional wire fields (`sourceFile`, `sourceLine`, `sourceColumn`) on `FeedbackPayload`. The server-side Zod schema + handler accept them and pass through to the store (the storage column already exists since Phase 1b). Fails open — widget never blocks submit on resolution failure.

**Architecture:**
- **`SourcemapStore` is a NEW sibling interface in `@colaborate/core`**, *not* an extension of `ColaborateStore`. `ColaborateStore` remains focused on user-facing feedback/session data; `SourcemapStore` models deploy-pipeline artefacts. Memory/LocalStorage adapters never need to implement it, keeping their surface small. Only `@colaborate/adapter-prisma` ships an implementation (`FsSourcemapStore`, filesystem-backed).
- **`FsSourcemapStore` lives in `@colaborate/adapter-prisma`** rather than in a new package. Rationale: it's a thin wrapper over `node:fs/promises` (~150 LOC); a dedicated workspace package is overkill for the current scope. Exposed as an additional named export from the adapter-prisma main entry. No Prisma tables are added — source maps live on the filesystem under `$SOURCEMAP_STORE_PATH/{projectName}/{env}/{hash}.map` with a sibling `index.json` for the `{hash, filename, uploadedAt}` metadata.
- **Resolver is a pure function** (`resolveSource(mapContent, line, column)` → `{ source, line, column } | null`) using `@jridgewell/trace-mapping`'s `TraceMap` + `originalPositionFor`. It has no FS side effects — the store loads the `.map` content, the resolver resolves. This keeps the resolver unit-testable without any tmpdir ceremony.
- **Upload CLI uses gzip.** Source maps compress ~4-10×. Content-Encoding: gzip on the request; server decompresses via `node:zlib.gunzipSync` before hashing + storing. Hash is of the *decompressed* content so a gzip-level-change doesn't invalidate dedup.
- **Both new HTTP routes always require API key auth.** Neither is a widget-public path — `POST /api/colaborate/sourcemaps` is a deploy-pipeline call, `POST /api/colaborate/resolve-source` is an internal service call (future triage worker, future prod resolver). Auth posture matches Phase 2's session routes: `apiKey`-set ⇒ 401 without `Authorization: Bearer {apiKey}`; `apiKey`-unset ⇒ public (dev convenience). The widget does NOT call the resolver in Phase 4a.
- **Widget source capture is fiber-only.** React 16.14+/17/18 store jsx-dev source info on each fiber as `_debugSource = { fileName, lineNumber, columnNumber }` in development builds. A tiny walker (`walkFiber(element)` → `{ file, line, column } | null`) reads the `__reactFiber$...` property on a DOM node and climbs to find `_debugSource`. If absent (prod build, no React, custom bundler stripping) → returns `null` → feedback POST omits source fields. No backend round-trip from the widget in v0.
- **Wire format addition is backward-compatible.** `FeedbackPayload.sourceFile|Line|Column` are all optional; existing anonymous widget POSTs continue to validate. Server Zod schema accepts them; the existing `createFeedback` handler passes them through (the store input already has the fields since Phase 1b — they were just always undefined).
- **No MCP server changes.** Phase 3's `get_session` / `colaborate://session/{id}` resource already return `feedback[]` — each feedback now naturally carries populated `sourceFile/Line/Column` when the widget captured them. The "Phase 4 limitation" language about screenshots stays (those land in Phase 4b).

**Tech Stack:**
- `@jridgewell/trace-mapping@^0.3.25` (new runtime dep in `@colaborate/adapter-prisma`). Small (~5 KB minified + gzip), zero runtime deps, canonical sourcemap reader used by rollup/esbuild/terser.
- `fast-glob@^3.3.2` (new devDep-at-runtime in `@colaborate/cli`). Portable glob for finding `.map` files. Chosen over `node:fs/promises.readdir({ recursive: true })` because of Node 18.0-18.16 support.
- `node:zlib` (`gzipSync` / `gunzipSync`) — built-in, no dep.
- `node:crypto` (`createHash`) — built-in, no dep.
- `zod@^3.24` (already in repo) — new validation schemas.
- Same TypeScript strict / tsup / biome / Turborepo setup as sibling packages.

**Source spec:** `docs/superpowers/specs/2026-04-18-colaborate-design.md`
- § Sourcemap uploader (line 223)
- § Widget changes → Source resolution (line 166/171)
- § Backend additions → Deployment (line 236) — `SOURCEMAP_STORE_PATH` env var

**Prereq:** Phase 3 complete (`v0.4.0-phase-3`, commit `3be214a`). Current `main` has **993 unit + 109 E2E green** (2 mobile skips), biome clean (201 files), all 11 check tasks green, 8/8 build.

**Baseline to protect:** 993 unit + 109 E2E (+2 skip) green; biome clean; all 11 check tasks green. No regressions in any existing package. Final unit count should be approximately 993 + ~50 new Vitest tests ≈ 1040-1050.

**Out of scope (explicit — do not touch):**
- Screenshot ingest pipeline, `attach_screenshot` MCP tool, widget screenshot capture → **Phase 4b**.
- Widget calling the resolver endpoint in production (requires prod stack-frame story — babel plugin or event-handler stack capture) → post-v0 / dedicated phase.
- Triage worker, GitHub adapter, Linear adapter → Phases 5 + 6.
- OAuth 2.1 + PKCE on HTTP routes → Phase 7.
- `externalIssueUrl` write-through on `resolve_feedback` → Phase 6.
- Do not touch `packages/mcp-server` (Phase 3's surface stays frozen — Phase 4b adds screenshots to session bundles).
- Do not touch `packages/triage`, `packages/integration-*` (don't exist yet).
- Do not add a Prisma model for sourcemaps — FS-only in v0.
- Do not add `SourcemapStore` methods to `ColaborateStore`. They are separate.

---

## File Structure Overview

| Path | Action | Responsibility |
|---|---|---|
| `packages/core/src/sourcemap-store.ts` | **Create** | `SourcemapStore` interface + `SourcemapRecord` + `SourcemapPutInput` + `ResolveSourceInput` / `ResolveSourceResult` types. Pure types — no runtime code. |
| `packages/core/src/index.ts` | **Modify** | Re-export new sourcemap types from the package entry. |
| `packages/core/__tests__/sourcemap-store.test.ts` | **Create** | Type-level round-trip test — instantiate a minimal in-memory `SourcemapStore` stub, exercise each method, assert shapes. Proves the interface is self-consistent. |
| `packages/adapter-prisma/package.json` | **Modify** | Add `@jridgewell/trace-mapping` dependency. |
| `packages/adapter-prisma/src/sourcemap-hash.ts` | **Create** | Pure helper: `hashSourcemapContent(content: string \| Buffer): string` — SHA-256 hex digest of the decompressed map body. |
| `packages/adapter-prisma/src/sourcemap-resolver.ts` | **Create** | Pure helper: `resolveSource(mapContent, line, column)` → `{ source, line, column } \| null`. Wraps `@jridgewell/trace-mapping`. |
| `packages/adapter-prisma/src/fs-sourcemap-store.ts` | **Create** | `FsSourcemapStore implements SourcemapStore` — FS-backed implementation. Writes under a configurable root; maintains `{projectName}/{env}/index.json` metadata. |
| `packages/adapter-prisma/src/routes-sourcemaps.ts` | **Create** | HTTP handlers: `handleUploadSourcemap(request, store)` + `handleResolveSource(request, store)` + `matchSourcemapRoute(pathname, method)` route matcher. Mirrors the `routes-sessions.ts` pattern. |
| `packages/adapter-prisma/src/validation.ts` | **Modify** | Add `sourcemapUploadSchema` + `resolveSourceSchema` Zod schemas + explicit input interfaces + type-level asserts (matches the existing pattern). Also append three optional fields to `feedbackCreateSchema`. |
| `packages/adapter-prisma/src/index.ts` | **Modify** | Wire `matchSourcemapRoute` into `POST`; instantiate a default `FsSourcemapStore` when `sourcemapStore` option not provided; add `sourcemapStore` + `sourcemapStorePath` to `HandlerOptions`; pass `sourceFile/Line/Column` through from `feedbackCreateSchema` into `store.createFeedback`. Export `FsSourcemapStore`, `resolveSource`, `hashSourcemapContent`. |
| `packages/adapter-prisma/__tests__/sourcemap-hash.test.ts` | **Create** | Unit tests for the hash helper (deterministic, gzip-insensitive). |
| `packages/adapter-prisma/__tests__/sourcemap-resolver.test.ts` | **Create** | Unit tests for the resolver using a tiny hand-rolled source map fixture. |
| `packages/adapter-prisma/__tests__/fs-sourcemap-store.test.ts` | **Create** | Unit tests for `FsSourcemapStore` using `os.tmpdir()` — put/get/resolve round-trip, overwrite semantics, missing hash returns null. |
| `packages/adapter-prisma/__tests__/routes-sourcemaps.test.ts` | **Create** | Unit tests for the upload + resolve HTTP handlers. Covers happy path, 400 invalid body, 401 without bearer, gzip decode. |
| `packages/adapter-prisma/__tests__/handler-sourcemaps.test.ts` | **Create** | Integration: `createColaborateHandler({ store, sourcemapStore, apiKey })` → POST sourcemap → POST resolve-source → expect hit. Proves the route is wired into the top-level handler. |
| `packages/adapter-prisma/__tests__/handler-post-source-fields.test.ts` | **Create** | Regression: POST feedback with `sourceFile/Line/Column` set → persisted on the returned record. Existing no-source path still works. |
| `packages/cli/package.json` | **Modify** | Add `fast-glob` + `@colaborate/adapter-prisma` (for `hashSourcemapContent`) to deps. |
| `packages/cli/tsup.config.ts` | **Modify** | Add `@colaborate/adapter-prisma` + `fast-glob` to `noExternal` so the CLI stays self-contained. |
| `packages/cli/src/commands/upload-sourcemaps.ts` | **Create** | `uploadSourcemapsCommand(options)` — globs `*.map`, gzips each, POSTs to `/api/colaborate/sourcemaps` with bearer, prints one line per map. |
| `packages/cli/src/index.ts` | **Modify** | Register the new `upload-sourcemaps` command under `commander`. |
| `packages/cli/__tests__/commands/upload-sourcemaps.test.ts` | **Create** | Unit tests with a mock `fetch` + `os.tmpdir()` fixture directory. Covers success, bearer auth header, failure with non-2xx. |
| `packages/widget/src/dom/source.ts` | **Create** | Fiber walker: `readDebugSource(element)` → `{ file, line, column } \| null`. Pure DOM + property inspection; no network. |
| `packages/widget/__tests__/dom/source.test.ts` | **Create** | Unit tests for the walker — jsdom element with mocked `__reactFiber$*` property returning `_debugSource`; asserts shape. Negative case: no fiber → null. |
| `packages/widget/src/annotator.ts` | **Modify** | In `finishDrawing`, after anchor capture, call `readDebugSource(chosenAnchorElement)` and attach the result to the `AnnotationComplete` event as `source`. |
| `packages/widget/src/launcher.ts` | **Modify** | Thread `source` from `AnnotationComplete` into the `FeedbackPayload` as `sourceFile/Line/Column`. |
| `packages/core/src/types.ts` | **Modify** | Append three optional fields to `FeedbackPayload`: `sourceFile?: string \| undefined`, `sourceLine?: number \| undefined`, `sourceColumn?: number \| undefined`. (The store-level `FeedbackCreateInput` already carries these — no change there.) |
| `packages/widget/__tests__/launcher.test.ts` | **Modify** | New test: when `AnnotationComplete.source` is populated, the `FeedbackPayload` sent to the client carries `sourceFile/Line/Column`. When absent, they stay undefined. |
| `README.md` (repo root) / `packages/cli/README.md` | **Modify (optional)** | Mention the new `colaborate upload-sourcemaps` command. Low priority — can roll into Phase 4b or Phase 8's README polish. |
| `todo.md` | Modify | Mark Phase 4a complete; bump Next Up to Phase 4b (screenshots). |
| `status.md` | Modify | Add "What Phase 4a shipped" block with commit trail + updated counts + tag `v0.5.0-phase-4a`. |

**Unchanged:** `@colaborate/adapter-memory`, `@colaborate/adapter-localstorage` (they don't need `SourcemapStore`), `@colaborate/mcp-server` (Phase 3 surface frozen), `@colaborate/widget` drawing-modes / shape-picker / session-panel (no UI changes), all existing E2E tests (Phase 4a adds no browser surface beyond a transparent wire-field extension — if sourceFile is present in the widget's test page, it's captured; otherwise no change).

---

## Task 1: Add `SourcemapStore` interface to `@colaborate/core` (TDD)

Sets up the type surface with zero runtime. A tiny in-test stub exercises the interface — this is the classic "can I instantiate it?" round-trip that catches mis-declared fields.

**Files:**
- Create: `packages/core/src/sourcemap-store.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/__tests__/sourcemap-store.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `packages/core/__tests__/sourcemap-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  ResolveSourceInput,
  ResolveSourceResult,
  SourcemapPutInput,
  SourcemapRecord,
  SourcemapStore,
} from "../src/sourcemap-store.js";

describe("SourcemapStore interface", () => {
  it("round-trips put / get / resolve via a stub", async () => {
    const records = new Map<string, SourcemapRecord>();

    const store: SourcemapStore = {
      async putSourcemap(input: SourcemapPutInput): Promise<SourcemapRecord> {
        const record: SourcemapRecord = {
          id: `${input.projectName}:${input.env}:${input.hash}`,
          projectName: input.projectName,
          env: input.env,
          hash: input.hash,
          filename: input.filename,
          uploadedAt: new Date(),
        };
        records.set(record.id, record);
        return record;
      },
      async getSourcemap(id: string): Promise<{ record: SourcemapRecord; content: string } | null> {
        const record = records.get(id);
        return record ? { record, content: "{}" } : null;
      },
      async listSourcemaps(projectName: string, env: string): Promise<SourcemapRecord[]> {
        return [...records.values()].filter((r) => r.projectName === projectName && r.env === env);
      },
      async resolveSourceLocation(input: ResolveSourceInput): Promise<ResolveSourceResult | null> {
        const record = [...records.values()].find(
          (r) => r.projectName === input.projectName && r.env === input.env && r.hash === input.hash,
        );
        if (!record) return null;
        return { sourceFile: "stub.ts", sourceLine: input.line, sourceColumn: input.column };
      },
    };

    const put = await store.putSourcemap({
      projectName: "parkland",
      env: "staging",
      hash: "abc123",
      filename: "main.js.map",
      content: '{"version":3,"mappings":""}',
    });
    expect(put.id).toBe("parkland:staging:abc123");

    const list = await store.listSourcemaps("parkland", "staging");
    expect(list).toHaveLength(1);

    const got = await store.getSourcemap(put.id);
    expect(got?.record.hash).toBe("abc123");
    expect(got?.content).toBe("{}");

    const resolved = await store.resolveSourceLocation({
      projectName: "parkland",
      env: "staging",
      hash: "abc123",
      line: 10,
      column: 5,
    });
    expect(resolved).toEqual({ sourceFile: "stub.ts", sourceLine: 10, sourceColumn: 5 });

    const missing = await store.resolveSourceLocation({
      projectName: "parkland",
      env: "staging",
      hash: "nope",
      line: 1,
      column: 0,
    });
    expect(missing).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core 2>&1 | tail -10
```

Expected: compile error on the `sourcemap-store.js` import.

- [ ] **Step 1.3: Create `packages/core/src/sourcemap-store.ts`**

```ts
/**
 * Sourcemap storage — separate from `ColaborateStore` because source maps
 * are deploy-pipeline artefacts, not user-facing feedback data. Only the
 * server-side Prisma/FS adapter implements this; Memory/LocalStorage
 * adapters don't need it.
 */

/** Input for storing a new source map. */
export interface SourcemapPutInput {
  projectName: string;
  env: string;
  /** Hex SHA-256 of the decompressed map content. Used as the storage key. */
  hash: string;
  /** Original filename of the map (e.g. `main.abc123.js.map`). */
  filename: string;
  /** Raw source-map JSON (decompressed). */
  content: string;
}

/** Persisted metadata about a stored source map. */
export interface SourcemapRecord {
  /** Composite id: `{projectName}:{env}:{hash}`. */
  id: string;
  projectName: string;
  env: string;
  hash: string;
  filename: string;
  uploadedAt: Date;
}

/** Input for resolving a bundled (line, column) to an original source location. */
export interface ResolveSourceInput {
  projectName: string;
  env: string;
  /** Hash identifying which map to resolve against. */
  hash: string;
  line: number;
  column: number;
}

/** Resolved original-source location. */
export interface ResolveSourceResult {
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
}

/**
 * Abstract sourcemap storage interface.
 *
 * Implementations:
 *  - `FsSourcemapStore` in `@colaborate/adapter-prisma` — filesystem-backed.
 *  - (future) S3- or object-store-backed implementations.
 *
 * No memory/localStorage implementation is planned — sourcemap storage is
 * a server-side deploy concern, not something the widget's dev adapters need.
 */
export interface SourcemapStore {
  /** Store a source map. Idempotent on `{projectName, env, hash}` — re-uploading the same hash overwrites metadata and returns the existing record. */
  putSourcemap(input: SourcemapPutInput): Promise<SourcemapRecord>;
  /** Load a stored map by composite id. Returns `null` when not found — never throws. */
  getSourcemap(id: string): Promise<{ record: SourcemapRecord; content: string } | null>;
  /** List all stored maps for a project/env combination, newest first. Returns empty array when none exist. */
  listSourcemaps(projectName: string, env: string): Promise<SourcemapRecord[]>;
  /** Resolve a bundled (line, column) against a specific map. Returns `null` when the map is missing or the position has no mapping. */
  resolveSourceLocation(input: ResolveSourceInput): Promise<ResolveSourceResult | null>;
}
```

- [ ] **Step 1.4: Export from `packages/core/src/index.ts`**

Append to the existing `index.ts` (immediately after the Mention re-export block):

```ts
export type {
  ResolveSourceInput,
  ResolveSourceResult,
  SourcemapPutInput,
  SourcemapRecord,
  SourcemapStore,
} from "./sourcemap-store.js";
```

- [ ] **Step 1.5: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core 2>&1 | tail -10
bun run -F @colaborate/core check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: new test passes, all previous tests still green, check clean, biome clean.

- [ ] **Step 1.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/core/src packages/core/__tests__
git commit -m "$(cat <<'EOF'
feat(core): add SourcemapStore interface + types

Introduces SourcemapStore as a sibling of ColaborateStore. Models
deploy-pipeline sourcemap artefacts separately from user-facing feedback
data so Memory/LocalStorage adapters don't need to stub unused methods.
Only @colaborate/adapter-prisma will implement it (Phase 4a).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `@jridgewell/trace-mapping` dep + SHA-256 hash helper (TDD)

Install the sourcemap reader. Ship a small hash helper — SHA-256 hex digest of the decompressed map content. Used by the CLI (for pre-upload ID) and by `FsSourcemapStore` (for server-side verify-and-key). This is the simplest red/green loop in the plan.

**Files:**
- Modify: `packages/adapter-prisma/package.json`
- Create: `packages/adapter-prisma/src/sourcemap-hash.ts`
- Create: `packages/adapter-prisma/__tests__/sourcemap-hash.test.ts`

- [ ] **Step 2.1: Add the dependency**

```bash
cd /Users/brian/dev/colaborate
bun add -D @jridgewell/trace-mapping@^0.3.25 -F @colaborate/adapter-prisma
```

Then hoist it to `dependencies` by editing `packages/adapter-prisma/package.json`. The final `dependencies` section should read (preserving any existing entries):

```json
  "dependencies": {
    "@colaborate/core": "workspace:*",
    "@jridgewell/trace-mapping": "^0.3.25",
    "zod": "^3.24.0"
  },
```

If `zod` was already listed, keep it — do not duplicate. Verify:

```bash
cat packages/adapter-prisma/package.json | grep -A 6 '"dependencies"'
```

- [ ] **Step 2.2: Write the failing test**

Create `packages/adapter-prisma/__tests__/sourcemap-hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashSourcemapContent } from "../src/sourcemap-hash.js";

describe("hashSourcemapContent", () => {
  it("produces a deterministic 64-char hex SHA-256 digest for string input", () => {
    const hex = hashSourcemapContent('{"version":3,"sources":["a.ts"],"mappings":""}');
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    // Determinism — same input, same output
    expect(hashSourcemapContent('{"version":3,"sources":["a.ts"],"mappings":""}')).toBe(hex);
  });

  it("produces the same digest for string and Buffer inputs of equal bytes", () => {
    const text = '{"version":3,"sources":["main.js"],"mappings":";AAAA"}';
    const fromString = hashSourcemapContent(text);
    const fromBuffer = hashSourcemapContent(Buffer.from(text, "utf8"));
    expect(fromBuffer).toBe(fromString);
  });

  it("differs across different inputs", () => {
    const a = hashSourcemapContent('{"version":3,"mappings":"AAAA"}');
    const b = hashSourcemapContent('{"version":3,"mappings":"BBBB"}');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2.3: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
```

Expected: import error on `sourcemap-hash.js`.

- [ ] **Step 2.4: Create `packages/adapter-prisma/src/sourcemap-hash.ts`**

```ts
import { createHash } from "node:crypto";

/**
 * Hex-encoded SHA-256 of the *decompressed* source-map body.
 *
 * Used as:
 *  - the storage key in `FsSourcemapStore` (one file per hash)
 *  - the CLI-side dedup signal (upload only if the remote doesn't already have this hash)
 *
 * Hashing happens after gzip decompression so that changing the gzip level
 * (e.g. upgrading zlib, toggling `-9`) doesn't invalidate existing uploads.
 */
export function hashSourcemapContent(content: string | Buffer): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha256").update(buf).digest("hex");
}
```

- [ ] **Step 2.5: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all hash tests pass, no regressions, check clean, biome clean.

- [ ] **Step 2.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/adapter-prisma/package.json packages/adapter-prisma/src/sourcemap-hash.ts packages/adapter-prisma/__tests__/sourcemap-hash.test.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): hashSourcemapContent helper + trace-mapping dep

SHA-256 hex digest used as the storage key for FsSourcemapStore and as
the CLI's pre-upload dedup signal. Hashes the decompressed map content
so gzip-level changes don't invalidate existing uploads.

Adds @jridgewell/trace-mapping@^0.3.25 as a runtime dep — the resolver
(Task 3) uses it for original-position-for lookups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Sourcemap resolver — `resolveSource(mapContent, line, column)` (TDD)

Pure function over `@jridgewell/trace-mapping`. Accepts raw map JSON + bundled line/col, returns the original-source triple or `null`. No FS, no store — just the mapping primitive.

**Files:**
- Create: `packages/adapter-prisma/src/sourcemap-resolver.ts`
- Create: `packages/adapter-prisma/__tests__/sourcemap-resolver.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `packages/adapter-prisma/__tests__/sourcemap-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSource } from "../src/sourcemap-resolver.js";

// Hand-rolled fixture. The VLQ mapping below corresponds to:
//   bundled line 1, column 0  →  original a.ts, line 1, column 0
//   bundled line 1, column 10 →  original a.ts, line 2, column 5
// Generated with https://github.com/jridgewell/sourcemap-codec
const fixture = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA,UACK",
});

describe("resolveSource", () => {
  it("maps a bundled position to the original source", () => {
    const result = resolveSource(fixture, 1, 0);
    expect(result).toEqual({ source: "a.ts", line: 1, column: 0 });
  });

  it("maps a later bundled column to a later original line", () => {
    const result = resolveSource(fixture, 1, 10);
    expect(result).toEqual({ source: "a.ts", line: 2, column: 5 });
  });

  it("returns null when the bundled position has no mapping", () => {
    // Line 999 is way past any mapping in the fixture.
    expect(resolveSource(fixture, 999, 0)).toBeNull();
  });

  it("returns null when the map is syntactically broken", () => {
    expect(resolveSource("not json", 1, 0)).toBeNull();
  });

  it("returns null when a mapping has no source (e.g. inline code without a source entry)", () => {
    const empty = JSON.stringify({
      version: 3,
      file: "bundle.js",
      sources: [],
      names: [],
      mappings: "",
    });
    expect(resolveSource(empty, 1, 0)).toBeNull();
  });
});
```

- [ ] **Step 3.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma/__tests__/sourcemap-resolver.test.ts 2>&1 | tail -15
```

Expected: import error on the resolver module.

- [ ] **Step 3.3: Create `packages/adapter-prisma/src/sourcemap-resolver.ts`**

```ts
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

export interface ResolvedPosition {
  source: string;
  line: number;
  column: number;
}

/**
 * Resolve a bundled (line, column) position to its original source location.
 *
 * Pure function — takes the source-map JSON + the query and returns the
 * mapping (or `null` when the position is unmapped or the map is invalid).
 *
 * Fails closed: any parse error, any missing mapping, any null source ⇒ null.
 * Callers should treat `null` as "no source info available" and omit the fields.
 *
 * Lines are 1-indexed to match browser / DevTools conventions; `trace-mapping`
 * natively uses 1-indexed lines + 0-indexed columns.
 */
export function resolveSource(
  mapContent: string,
  line: number,
  column: number,
): ResolvedPosition | null {
  let map: TraceMap;
  try {
    map = new TraceMap(mapContent);
  } catch {
    return null;
  }
  const pos = originalPositionFor(map, { line, column });
  if (pos.source === null || pos.line === null || pos.column === null) return null;
  return { source: pos.source, line: pos.line, column: pos.column };
}
```

- [ ] **Step 3.4: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all resolver tests pass, no regressions, check clean, biome clean.

If the hand-rolled VLQ fixture's asserts don't match the expected triples, regenerate the `mappings` field using `@jridgewell/sourcemap-codec`'s `encode([[[0,0,0,0],[10,0,1,5]]])` (where each segment is `[generatedCol, sourceIdx, origLine, origCol]`) and adjust the test constants to match.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/adapter-prisma/src/sourcemap-resolver.ts packages/adapter-prisma/__tests__/sourcemap-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): resolveSource helper over trace-mapping

Pure function — raw source-map JSON + bundled (line, column) →
{source, line, column} | null. Fails closed on parse error or missing
mapping so the caller can omit source fields cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `FsSourcemapStore` — filesystem-backed `SourcemapStore` (TDD)

The concrete store. Writes maps under `{root}/{projectName}/{env}/{hash}.map`; maintains a sibling `index.json` array of `{hash, filename, uploadedAt}`. Uses `os.tmpdir()` for the unit tests — no Docker, no Prisma.

**Files:**
- Create: `packages/adapter-prisma/src/fs-sourcemap-store.ts`
- Create: `packages/adapter-prisma/__tests__/fs-sourcemap-store.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `packages/adapter-prisma/__tests__/fs-sourcemap-store.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsSourcemapStore } from "../src/fs-sourcemap-store.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("FsSourcemapStore", () => {
  let root: string;
  let store: FsSourcemapStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "colaborate-sm-"));
    store = new FsSourcemapStore({ root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes a map file + an index.json entry on putSourcemap", async () => {
    const record = await store.putSourcemap({
      projectName: "parkland",
      env: "staging",
      hash: "abc123",
      filename: "main.js.map",
      content: SIMPLE_MAP,
    });
    expect(record.id).toBe("parkland:staging:abc123");
    expect(record.hash).toBe("abc123");
    expect(record.filename).toBe("main.js.map");
    expect(record.uploadedAt).toBeInstanceOf(Date);

    // File actually written
    const written = await readFile(join(root, "parkland", "staging", "abc123.map"), "utf8");
    expect(written).toBe(SIMPLE_MAP);
    // Metadata index actually written
    const rawIndex = await readFile(join(root, "parkland", "staging", "index.json"), "utf8");
    const index = JSON.parse(rawIndex) as Array<{ hash: string }>;
    expect(index).toHaveLength(1);
    expect(index[0]!.hash).toBe("abc123");
  });

  it("getSourcemap returns the record + content for a known id", async () => {
    await store.putSourcemap({
      projectName: "p1",
      env: "prod",
      hash: "deadbeef",
      filename: "a.js.map",
      content: SIMPLE_MAP,
    });
    const got = await store.getSourcemap("p1:prod:deadbeef");
    expect(got).not.toBeNull();
    expect(got!.record.filename).toBe("a.js.map");
    expect(got!.content).toBe(SIMPLE_MAP);
  });

  it("getSourcemap returns null for an unknown id", async () => {
    expect(await store.getSourcemap("nope:nope:nope")).toBeNull();
  });

  it("listSourcemaps returns newest first", async () => {
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "h1",
      filename: "1.map",
      content: SIMPLE_MAP,
    });
    // Nudge the clock forward so uploadedAt orderings are observable.
    await new Promise((r) => setTimeout(r, 5));
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "h2",
      filename: "2.map",
      content: SIMPLE_MAP,
    });

    const list = await store.listSourcemaps("p1", "staging");
    expect(list.map((r) => r.hash)).toEqual(["h2", "h1"]);
  });

  it("listSourcemaps returns empty array when no uploads exist", async () => {
    expect(await store.listSourcemaps("unknown-project", "unknown-env")).toEqual([]);
  });

  it("overwriting the same hash leaves a single index entry + refreshes uploadedAt", async () => {
    const first = await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "abc",
      filename: "old.map",
      content: SIMPLE_MAP,
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "abc",
      filename: "new.map",
      content: SIMPLE_MAP,
    });

    expect(second.uploadedAt.getTime()).toBeGreaterThan(first.uploadedAt.getTime());
    expect(second.filename).toBe("new.map");
    const list = await store.listSourcemaps("p1", "staging");
    expect(list).toHaveLength(1);
    expect(list[0]!.filename).toBe("new.map");
  });

  it("resolveSourceLocation hits the stored map and returns the original position", async () => {
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "h1",
      filename: "x.map",
      content: SIMPLE_MAP,
    });
    const resolved = await store.resolveSourceLocation({
      projectName: "p1",
      env: "staging",
      hash: "h1",
      line: 1,
      column: 0,
    });
    expect(resolved).toEqual({ sourceFile: "a.ts", sourceLine: 1, sourceColumn: 0 });
  });

  it("resolveSourceLocation returns null when the hash is unknown", async () => {
    const resolved = await store.resolveSourceLocation({
      projectName: "p1",
      env: "staging",
      hash: "missing",
      line: 1,
      column: 0,
    });
    expect(resolved).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma/__tests__/fs-sourcemap-store.test.ts 2>&1 | tail -15
```

Expected: import error on `fs-sourcemap-store.js`.

- [ ] **Step 4.3: Create `packages/adapter-prisma/src/fs-sourcemap-store.ts`**

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ResolveSourceInput,
  ResolveSourceResult,
  SourcemapPutInput,
  SourcemapRecord,
  SourcemapStore,
} from "@colaborate/core";
import { resolveSource } from "./sourcemap-resolver.js";

interface IndexEntry {
  hash: string;
  filename: string;
  uploadedAt: string; // ISO
}

export interface FsSourcemapStoreOptions {
  /** Root directory under which sourcemaps are stored. Must exist or be creatable. */
  root: string;
}

/**
 * Filesystem-backed `SourcemapStore`.
 *
 * Layout:
 *   {root}/
 *     {projectName}/
 *       {env}/
 *         index.json    ← array of IndexEntry, newest last on disk
 *         {hash}.map    ← one file per map
 *
 * Design notes:
 *  - No locking. Concurrent `putSourcemap` calls against the same
 *    `{project,env}` could race on `index.json` rewrites. Acceptable for a
 *    CLI-driven deploy-pipeline tool at v0 scale; revisit if multiple
 *    concurrent deploys become a thing.
 *  - Re-uploading the same hash overwrites the map file AND refreshes the
 *    index entry (filename + uploadedAt). No duplicate rows.
 *  - Reading preserves insertion order; `listSourcemaps` reverses it for
 *    newest-first presentation.
 */
export class FsSourcemapStore implements SourcemapStore {
  private readonly root: string;

  constructor(options: FsSourcemapStoreOptions) {
    this.root = options.root;
  }

  private dirFor(projectName: string, env: string): string {
    return join(this.root, projectName, env);
  }

  private indexPathFor(projectName: string, env: string): string {
    return join(this.dirFor(projectName, env), "index.json");
  }

  private mapPathFor(projectName: string, env: string, hash: string): string {
    return join(this.dirFor(projectName, env), `${hash}.map`);
  }

  private async readIndex(projectName: string, env: string): Promise<IndexEntry[]> {
    try {
      const raw = await readFile(this.indexPathFor(projectName, env), "utf8");
      const parsed = JSON.parse(raw) as IndexEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async writeIndex(projectName: string, env: string, entries: IndexEntry[]): Promise<void> {
    const path = this.indexPathFor(projectName, env);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), "utf8");
  }

  async putSourcemap(input: SourcemapPutInput): Promise<SourcemapRecord> {
    const { projectName, env, hash, filename, content } = input;
    await mkdir(this.dirFor(projectName, env), { recursive: true });
    await writeFile(this.mapPathFor(projectName, env, hash), content, "utf8");

    const entries = await this.readIndex(projectName, env);
    const filtered = entries.filter((e) => e.hash !== hash);
    const uploadedAt = new Date();
    filtered.push({ hash, filename, uploadedAt: uploadedAt.toISOString() });
    await this.writeIndex(projectName, env, filtered);

    return {
      id: `${projectName}:${env}:${hash}`,
      projectName,
      env,
      hash,
      filename,
      uploadedAt,
    };
  }

  async getSourcemap(id: string): Promise<{ record: SourcemapRecord; content: string } | null> {
    const parts = id.split(":");
    if (parts.length !== 3) return null;
    const [projectName, env, hash] = parts as [string, string, string];
    const entries = await this.readIndex(projectName, env);
    const entry = entries.find((e) => e.hash === hash);
    if (!entry) return null;
    let content: string;
    try {
      content = await readFile(this.mapPathFor(projectName, env, hash), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return {
      record: {
        id,
        projectName,
        env,
        hash: entry.hash,
        filename: entry.filename,
        uploadedAt: new Date(entry.uploadedAt),
      },
      content,
    };
  }

  async listSourcemaps(projectName: string, env: string): Promise<SourcemapRecord[]> {
    const entries = await this.readIndex(projectName, env);
    return entries
      .map(
        (e): SourcemapRecord => ({
          id: `${projectName}:${env}:${e.hash}`,
          projectName,
          env,
          hash: e.hash,
          filename: e.filename,
          uploadedAt: new Date(e.uploadedAt),
        }),
      )
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async resolveSourceLocation(input: ResolveSourceInput): Promise<ResolveSourceResult | null> {
    const got = await this.getSourcemap(`${input.projectName}:${input.env}:${input.hash}`);
    if (!got) return null;
    const resolved = resolveSource(got.content, input.line, input.column);
    if (!resolved) return null;
    return {
      sourceFile: resolved.source,
      sourceLine: resolved.line,
      sourceColumn: resolved.column,
    };
  }
}
```

- [ ] **Step 4.4: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all `FsSourcemapStore` tests pass, no regressions, check clean, biome clean.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/adapter-prisma/src/fs-sourcemap-store.ts packages/adapter-prisma/__tests__/fs-sourcemap-store.test.ts
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): FsSourcemapStore — filesystem SourcemapStore

Writes maps at {root}/{projectName}/{env}/{hash}.map with a sibling
index.json for metadata. Idempotent on the composite {project,env,hash}
key — re-uploading the same hash refreshes filename + uploadedAt in
place. Delegates the mapping primitive to resolveSource.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Zod schemas for upload + resolve-source (TDD)

Adds `sourcemapUploadSchema` + `resolveSourceSchema` to `validation.ts` alongside the existing feedback/session schemas. Extends `feedbackCreateSchema` with three optional source fields. Explicit interfaces + type-level asserts match the existing pattern.

**Files:**
- Modify: `packages/adapter-prisma/src/validation.ts`
- Create: `packages/adapter-prisma/__tests__/validation-sourcemap.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `packages/adapter-prisma/__tests__/validation-sourcemap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  feedbackCreateSchema,
  resolveSourceSchema,
  sourcemapUploadSchema,
} from "../src/validation.js";

describe("sourcemapUploadSchema", () => {
  it("accepts a well-formed body", () => {
    const parsed = sourcemapUploadSchema.safeParse({
      projectName: "parkland",
      env: "staging",
      hash: "a".repeat(64),
      filename: "main.js.map",
      content: '{"version":3,"sources":[],"mappings":""}',
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-hex 64-char hash", () => {
    const parsed = sourcemapUploadSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "zzz",
      filename: "x.map",
      content: "{}",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing projectName", () => {
    const parsed = sourcemapUploadSchema.safeParse({
      env: "staging",
      hash: "a".repeat(64),
      filename: "x.map",
      content: "{}",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("resolveSourceSchema", () => {
  it("accepts a well-formed body", () => {
    const parsed = resolveSourceSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "a".repeat(64),
      line: 10,
      column: 5,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects line < 1", () => {
    const parsed = resolveSourceSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "a".repeat(64),
      line: 0,
      column: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects column < 0", () => {
    const parsed = resolveSourceSchema.safeParse({
      projectName: "p",
      env: "staging",
      hash: "a".repeat(64),
      line: 1,
      column: -1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("feedbackCreateSchema with source fields", () => {
  const base = {
    projectName: "p",
    type: "bug" as const,
    message: "msg",
    url: "https://example.com/",
    viewport: "1280x720",
    userAgent: "ua",
    authorName: "a",
    authorEmail: "a@example.com",
    clientId: "c1",
    annotations: [],
  };

  it("accepts payload without source fields (backward compatible)", () => {
    const parsed = feedbackCreateSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("accepts payload with source fields populated", () => {
    const parsed = feedbackCreateSchema.safeParse({
      ...base,
      sourceFile: "app/CheckoutButton.tsx",
      sourceLine: 42,
      sourceColumn: 5,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceFile).toBe("app/CheckoutButton.tsx");
      expect(parsed.data.sourceLine).toBe(42);
      expect(parsed.data.sourceColumn).toBe(5);
    }
  });

  it("rejects negative sourceLine", () => {
    const parsed = feedbackCreateSchema.safeParse({
      ...base,
      sourceFile: "a.ts",
      sourceLine: -1,
      sourceColumn: 0,
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma/__tests__/validation-sourcemap.test.ts 2>&1 | tail -15
```

Expected: imports missing — `sourcemapUploadSchema` and `resolveSourceSchema` don't exist yet, and the feedback schema doesn't carry source fields.

- [ ] **Step 5.3: Extend `packages/adapter-prisma/src/validation.ts`**

First, append three optional fields to the existing `feedbackCreateSchema` body (inside the `z.object({...})` block). Place them immediately after the existing `status: z.enum(FEEDBACK_STATUSES).optional(),` line:

```ts
  sourceFile: z.string().min(1).max(2000).optional(),
  sourceLine: z.number().int().min(1).optional(),
  sourceColumn: z.number().int().min(0).optional(),
```

Then append the two new schemas at the bottom of the file, just before the `// Explicit public interfaces` section. Insert:

```ts
export const sourcemapUploadSchema = z.object({
  projectName: z.string().min(1).max(200),
  env: z.string().min(1).max(100),
  /** Hex SHA-256 of the decompressed map body. */
  hash: z.string().regex(/^[0-9a-f]{64}$/, "hash must be 64-char lowercase hex"),
  filename: z.string().min(1).max(500),
  /** Raw source-map JSON (decompressed). */
  content: z.string().min(2).max(50 * 1024 * 1024), // up to 50 MB decompressed
});

export const resolveSourceSchema = z.object({
  projectName: z.string().min(1).max(200),
  env: z.string().min(1).max(100),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  line: z.number().int().min(1),
  column: z.number().int().min(0),
});
```

Then extend the `FeedbackCreateInput` interface in the same file (keep all existing fields; add three more at the end, just before the closing `}` of the interface):

```ts
  sourceFile?: string | undefined;
  sourceLine?: number | undefined;
  sourceColumn?: number | undefined;
```

Then append the two new explicit interfaces + asserts at the end of the "Explicit public interfaces" block, before the `formatValidationErrors` export:

```ts
export interface SourcemapUploadInput {
  projectName: string;
  env: string;
  hash: string;
  filename: string;
  content: string;
}

export interface ResolveSourceBodyInput {
  projectName: string;
  env: string;
  hash: string;
  line: number;
  column: number;
}

type _AssertSourcemapUpload =
  zod.z.infer<typeof sourcemapUploadSchema> extends SourcemapUploadInput ? true : never;
type _AssertSourcemapUploadReverse =
  SourcemapUploadInput extends zod.z.infer<typeof sourcemapUploadSchema> ? true : never;
type _AssertResolveSource =
  zod.z.infer<typeof resolveSourceSchema> extends ResolveSourceBodyInput ? true : never;
type _AssertResolveSourceReverse =
  ResolveSourceBodyInput extends zod.z.infer<typeof resolveSourceSchema> ? true : never;

void (0 as unknown as _AssertSourcemapUpload);
void (0 as unknown as _AssertSourcemapUploadReverse);
void (0 as unknown as _AssertResolveSource);
void (0 as unknown as _AssertResolveSourceReverse);
```

- [ ] **Step 5.4: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all new schema tests pass, all previous adapter-prisma tests still pass, type-level asserts pass (no compile error), biome clean.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/adapter-prisma/src/validation.ts packages/adapter-prisma/__tests__/validation-sourcemap.test.ts
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): Zod schemas for sourcemap routes + source fields

Adds sourcemapUploadSchema + resolveSourceSchema and matching
type-asserted interfaces. Extends feedbackCreateSchema with three
optional sourceFile/Line/Column fields (backward compatible —
widget-public POSTs without them continue to validate).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: HTTP handlers `handleUploadSourcemap` + `handleResolveSource` (TDD)

Pure per-route handlers matching the `routes-sessions.ts` pattern. Upload handler decompresses gzipped bodies transparently (Content-Encoding header), validates, hashes, verifies hash matches body hash, stores, returns the record. Resolve handler validates, delegates to `store.resolveSourceLocation`, returns result (or 404 JSON).

**Files:**
- Create: `packages/adapter-prisma/src/routes-sourcemaps.ts`
- Create: `packages/adapter-prisma/__tests__/routes-sourcemaps.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `packages/adapter-prisma/__tests__/routes-sourcemaps.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsSourcemapStore } from "../src/fs-sourcemap-store.js";
import {
  handleResolveSource,
  handleUploadSourcemap,
  matchSourcemapRoute,
} from "../src/routes-sourcemaps.js";
import { hashSourcemapContent } from "../src/sourcemap-hash.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("matchSourcemapRoute", () => {
  it("matches POST /api/colaborate/sourcemaps", () => {
    expect(matchSourcemapRoute("/api/colaborate/sourcemaps", "POST")).toEqual({ kind: "upload" });
  });

  it("matches POST /api/colaborate/resolve-source", () => {
    expect(matchSourcemapRoute("/api/colaborate/resolve-source", "POST")).toEqual({
      kind: "resolve",
    });
  });

  it("does not match unrelated paths", () => {
    expect(matchSourcemapRoute("/api/colaborate", "POST")).toBeNull();
    expect(matchSourcemapRoute("/api/colaborate/sessions", "POST")).toBeNull();
  });

  it("does not match wrong methods", () => {
    expect(matchSourcemapRoute("/api/colaborate/sourcemaps", "GET")).toBeNull();
    expect(matchSourcemapRoute("/api/colaborate/resolve-source", "GET")).toBeNull();
  });
});

describe("handleUploadSourcemap", () => {
  let root: string;
  let store: FsSourcemapStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "colaborate-routes-"));
    store = new FsSourcemapStore({ root });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function makeRequest(body: unknown, gzip = false): Request {
    if (gzip) {
      const compressed = gzipSync(Buffer.from(JSON.stringify(body), "utf8"));
      return new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", "content-encoding": "gzip" },
        // biome-ignore lint/suspicious/noExplicitAny: Node's Request accepts Buffer, types lag
        body: compressed as any,
      });
    }
    return new Request("http://t/api/colaborate/sourcemaps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("stores a plain-JSON upload and returns 201 with the record", async () => {
    const hash = hashSourcemapContent(SIMPLE_MAP);
    const response = await handleUploadSourcemap(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash,
        filename: "main.js.map",
        content: SIMPLE_MAP,
      }),
      store,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; hash: string };
    expect(body.hash).toBe(hash);
    expect(body.id).toBe(`p1:staging:${hash}`);
  });

  it("rejects when the body's hash does not match hashSourcemapContent(content)", async () => {
    const response = await handleUploadSourcemap(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash: "0".repeat(64),
        filename: "main.js.map",
        content: SIMPLE_MAP,
      }),
      store,
    );
    expect(response.status).toBe(400);
  });

  it("rejects on invalid JSON", async () => {
    const bad = new Request("http://t/api/colaborate/sourcemaps", {
      method: "POST",
      body: "not json",
    });
    const response = await handleUploadSourcemap(bad, store);
    expect(response.status).toBe(400);
  });

  it("rejects on schema violation (missing fields)", async () => {
    const response = await handleUploadSourcemap(
      makeRequest({ projectName: "p1" }),
      store,
    );
    expect(response.status).toBe(400);
  });

  it("accepts a gzipped body (Content-Encoding: gzip) and stores the decompressed content", async () => {
    const hash = hashSourcemapContent(SIMPLE_MAP);
    const response = await handleUploadSourcemap(
      makeRequest(
        {
          projectName: "p1",
          env: "staging",
          hash,
          filename: "main.js.map",
          content: SIMPLE_MAP,
        },
        true,
      ),
      store,
    );
    expect(response.status).toBe(201);
    const got = await store.getSourcemap(`p1:staging:${hash}`);
    expect(got?.content).toBe(SIMPLE_MAP);
  });
});

describe("handleResolveSource", () => {
  let root: string;
  let store: FsSourcemapStore;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "colaborate-routes-"));
    store = new FsSourcemapStore({ root });
    await store.putSourcemap({
      projectName: "p1",
      env: "staging",
      hash: "a".repeat(64),
      filename: "main.js.map",
      content: SIMPLE_MAP,
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function makeRequest(body: unknown): Request {
    return new Request("http://t/api/colaborate/resolve-source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns a 200 with the resolved triple on a hit", async () => {
    const response = await handleResolveSource(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash: "a".repeat(64),
        line: 1,
        column: 0,
      }),
      store,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sourceFile: string; sourceLine: number; sourceColumn: number };
    expect(body).toEqual({ sourceFile: "a.ts", sourceLine: 1, sourceColumn: 0 });
  });

  it("returns 404 on an unresolvable position", async () => {
    const response = await handleResolveSource(
      makeRequest({
        projectName: "p1",
        env: "staging",
        hash: "b".repeat(64),
        line: 1,
        column: 0,
      }),
      store,
    );
    expect(response.status).toBe(404);
  });

  it("rejects on schema violation", async () => {
    const response = await handleResolveSource(makeRequest({ projectName: "p1" }), store);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 6.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma/__tests__/routes-sourcemaps.test.ts 2>&1 | tail -15
```

Expected: import errors on `routes-sourcemaps.js`.

- [ ] **Step 6.3: Create `packages/adapter-prisma/src/routes-sourcemaps.ts`**

```ts
import { gunzipSync } from "node:zlib";
import type { SourcemapStore } from "@colaborate/core";
import { hashSourcemapContent } from "./sourcemap-hash.js";
import { formatValidationErrors, resolveSourceSchema, sourcemapUploadSchema } from "./validation.js";

export type SourcemapRoute = { kind: "upload" } | { kind: "resolve" };

/**
 * Route matcher. Returns the route descriptor when the pathname matches one of
 * the two sourcemap routes, otherwise null.
 */
export function matchSourcemapRoute(pathname: string, method: string): SourcemapRoute | null {
  if (method !== "POST") return null;
  if (pathname.endsWith("/api/colaborate/sourcemaps")) return { kind: "upload" };
  if (pathname.endsWith("/api/colaborate/resolve-source")) return { kind: "resolve" };
  return null;
}

/**
 * Read a request body, decompressing gzip transparently when Content-Encoding
 * indicates it. Returns the parsed JSON or `null` on any failure.
 */
async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    const encoding = request.headers.get("content-encoding")?.toLowerCase() ?? "";
    if (encoding.includes("gzip")) {
      const buf = Buffer.from(await request.arrayBuffer());
      const decompressed = gunzipSync(buf).toString("utf8");
      return JSON.parse(decompressed);
    }
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleUploadSourcemap(
  request: Request,
  store: SourcemapStore,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === null) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = sourcemapUploadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  const actual = hashSourcemapContent(parsed.data.content);
  if (actual !== parsed.data.hash) {
    return Response.json(
      { error: "hash does not match SHA-256 of content", actual, expected: parsed.data.hash },
      { status: 400 },
    );
  }

  const record = await store.putSourcemap({
    projectName: parsed.data.projectName,
    env: parsed.data.env,
    hash: parsed.data.hash,
    filename: parsed.data.filename,
    content: parsed.data.content,
  });
  return Response.json(record, { status: 201 });
}

export async function handleResolveSource(
  request: Request,
  store: SourcemapStore,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === null) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = resolveSourceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  const resolved = await store.resolveSourceLocation(parsed.data);
  if (!resolved) return Response.json({ error: "No mapping found" }, { status: 404 });
  return Response.json(resolved, { status: 200 });
}
```

- [ ] **Step 6.4: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all route-handler tests pass, no regressions, check clean, biome clean.

- [ ] **Step 6.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/adapter-prisma/src/routes-sourcemaps.ts packages/adapter-prisma/__tests__/routes-sourcemaps.test.ts
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): HTTP handlers for sourcemap upload + resolve

Pure handlers (Request → Response) for /api/colaborate/sourcemaps and
/api/colaborate/resolve-source. Upload decompresses gzipped bodies
transparently and verifies body hash matches SHA-256 of content before
storing. Resolve returns 404 when the hash/position has no mapping.
Both match the Phase 2 routes-sessions.ts shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire routes into `createColaborateHandler` + pass source fields on feedback POST (TDD)

Plumbs the sourcemap matcher into the `POST` branch of the top-level handler (before the feedback-POST branch). Adds `sourcemapStore` + `sourcemapStorePath` to `HandlerOptions`. When `sourcemapStorePath` is set and `sourcemapStore` isn't, auto-instantiate an `FsSourcemapStore`. Passes `sourceFile/Line/Column` from the parsed feedback body into `store.createFeedback`.

**Files:**
- Modify: `packages/adapter-prisma/src/index.ts`
- Create: `packages/adapter-prisma/__tests__/handler-sourcemaps.test.ts`
- Create: `packages/adapter-prisma/__tests__/handler-post-source-fields.test.ts`

- [ ] **Step 7.1: Write the integration failing test (routes wired)**

Create `packages/adapter-prisma/__tests__/handler-sourcemaps.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "@colaborate/adapter-memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createColaborateHandler } from "../src/index.js";
import { hashSourcemapContent } from "../src/sourcemap-hash.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("createColaborateHandler — sourcemap routes", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "colaborate-handler-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("wires POST /api/colaborate/sourcemaps into the handler", async () => {
    const handler = createColaborateHandler({
      store: new MemoryStore(),
      sourcemapStorePath: root,
      apiKey: "shh",
    });

    const hash = hashSourcemapContent(SIMPLE_MAP);
    const response = await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({
          projectName: "p1",
          env: "staging",
          hash,
          filename: "main.js.map",
          content: SIMPLE_MAP,
        }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it("requires bearer auth on upload when apiKey is set", async () => {
    const handler = createColaborateHandler({
      store: new MemoryStore(),
      sourcemapStorePath: root,
      apiKey: "shh",
    });

    const response = await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("wires POST /api/colaborate/resolve-source and returns the resolved triple", async () => {
    const handler = createColaborateHandler({
      store: new MemoryStore(),
      sourcemapStorePath: root,
      apiKey: "shh",
    });

    const hash = hashSourcemapContent(SIMPLE_MAP);
    await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({
          projectName: "p1",
          env: "staging",
          hash,
          filename: "main.js.map",
          content: SIMPLE_MAP,
        }),
      }),
    );

    const resolve = await handler.POST(
      new Request("http://t/api/colaborate/resolve-source", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({
          projectName: "p1",
          env: "staging",
          hash,
          line: 1,
          column: 0,
        }),
      }),
    );
    expect(resolve.status).toBe(200);
    const body = (await resolve.json()) as { sourceFile: string };
    expect(body.sourceFile).toBe("a.ts");
  });

  it("throws on construction when sourcemap routes are called without a sourcemap store configured", async () => {
    const handler = createColaborateHandler({ store: new MemoryStore(), apiKey: "shh" });
    const response = await handler.POST(
      new Request("http://t/api/colaborate/sourcemaps", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shh" },
        body: JSON.stringify({}),
      }),
    );
    // Should fall through (404) or return 500 — assert it's NOT 201.
    expect(response.status).not.toBe(201);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 7.2: Write the source-fields round-trip test**

Create `packages/adapter-prisma/__tests__/handler-post-source-fields.test.ts`:

```ts
import { MemoryStore } from "@colaborate/adapter-memory";
import { describe, expect, it } from "vitest";
import { createColaborateHandler } from "../src/index.js";

const ANCHOR = {
  cssSelector: "main > h1",
  xpath: "/html/body/main/h1",
  textSnippet: "Hi",
  elementTag: "H1",
  textPrefix: "",
  textSuffix: "",
  fingerprint: "1:0:x",
  neighborText: "",
};

const ANNOTATION = {
  anchor: ANCHOR,
  shape: "rectangle" as const,
  geometry: { shape: "rectangle" as const, x: 0, y: 0, w: 1, h: 1 },
  scrollX: 0,
  scrollY: 0,
  viewportW: 1280,
  viewportH: 720,
  devicePixelRatio: 1,
};

describe("createColaborateHandler POST — source fields", () => {
  it("persists sourceFile/Line/Column when present on the payload", async () => {
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store });

    const response = await handler.POST(
      new Request("http://t/api/colaborate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName: "p",
          type: "bug",
          message: "msg",
          url: "https://example.com/",
          viewport: "1280x720",
          userAgent: "ua",
          authorName: "a",
          authorEmail: "a@example.com",
          clientId: "c1",
          annotations: [ANNOTATION],
          sourceFile: "app/CheckoutButton.tsx",
          sourceLine: 42,
          sourceColumn: 5,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sourceFile: string | null;
      sourceLine: number | null;
      sourceColumn: number | null;
    };
    expect(body.sourceFile).toBe("app/CheckoutButton.tsx");
    expect(body.sourceLine).toBe(42);
    expect(body.sourceColumn).toBe(5);
  });

  it("leaves source fields null when payload omits them (backward compat)", async () => {
    const store = new MemoryStore();
    const handler = createColaborateHandler({ store });

    const response = await handler.POST(
      new Request("http://t/api/colaborate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName: "p",
          type: "bug",
          message: "msg",
          url: "https://example.com/",
          viewport: "1280x720",
          userAgent: "ua",
          authorName: "a",
          authorEmail: "a@example.com",
          clientId: "c2",
          annotations: [ANNOTATION],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sourceFile: string | null;
      sourceLine: number | null;
      sourceColumn: number | null;
    };
    expect(body.sourceFile).toBeNull();
    expect(body.sourceLine).toBeNull();
    expect(body.sourceColumn).toBeNull();
  });
});
```

- [ ] **Step 7.3: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -15
```

Expected: handler tests fail because (a) `sourcemapStorePath` isn't in `HandlerOptions`, (b) source fields aren't threaded through.

- [ ] **Step 7.4: Modify `packages/adapter-prisma/src/index.ts`**

Make four changes:

**Change 1 — imports.** At the top of the file, add the sourcemap imports:

```ts
import {
  handleResolveSource,
  handleUploadSourcemap,
  matchSourcemapRoute,
} from "./routes-sourcemaps.js";
import { FsSourcemapStore } from "./fs-sourcemap-store.js";
import { hashSourcemapContent } from "./sourcemap-hash.js";
import { resolveSource } from "./sourcemap-resolver.js";
```

**Change 2 — re-exports.** Append to the re-export block near the top:

```ts
export { FsSourcemapStore } from "./fs-sourcemap-store.js";
export { hashSourcemapContent } from "./sourcemap-hash.js";
export { resolveSource } from "./sourcemap-resolver.js";
export type {
  SourcemapPutInput,
  SourcemapRecord,
  SourcemapStore,
  ResolveSourceInput,
  ResolveSourceResult,
} from "@colaborate/core";
```

**Change 3 — `HandlerOptions`.** Add two new optional fields (place them after `allowedOrigins`):

```ts
  /**
   * Optional `SourcemapStore` for the sourcemap upload + resolve routes. When
   * omitted but `sourcemapStorePath` is set, an FsSourcemapStore is auto-instantiated.
   * When both are unset, sourcemap routes return 404/500 on call.
   */
  sourcemapStore?: import("@colaborate/core").SourcemapStore | undefined;
  /** Filesystem root for the default `FsSourcemapStore`. Ignored when `sourcemapStore` is set. */
  sourcemapStorePath?: string | undefined;
```

**Change 4 — handler factory body.** Inside `createColaborateHandler`, after the existing `store` resolution (i.e. after the line that reads `const store: ColaborateStore = providedStore ?? new PrismaStore(...)`), add:

```ts
  const sourcemapStore: import("@colaborate/core").SourcemapStore | null =
    providedSourcemapStore ?? (sourcemapStorePath ? new FsSourcemapStore({ root: sourcemapStorePath }) : null);
```

And destructure the new options at the top of the factory. The function signature becomes:

```ts
export function createColaborateHandler({
  prisma,
  store: providedStore,
  apiKey,
  publicEndpoints = apiKey ? ["POST", "OPTIONS"] : undefined,
  allowedOrigins,
  sourcemapStore: providedSourcemapStore,
  sourcemapStorePath,
}: HandlerOptions): ColaborateHandler {
```

**Change 5 — POST branch routing.** Inside `POST:`, immediately after the existing CORS / corsHeaders computation and BEFORE the `sessionRoute` check, add a sourcemap-route branch. The POST body's beginning should end up looking like:

```ts
    POST: async (request: Request): Promise<Response> => {
      const corsHeaders = buildCorsHeaders(request, allowedOrigins);
      const pathname = new URL(request.url).pathname;

      const sourcemapRoute = matchSourcemapRoute(pathname, "POST");
      if (sourcemapRoute) {
        const authError = authenticate(request, "POST", true);
        if (authError) return withCors(authError, corsHeaders);
        if (!sourcemapStore) {
          return withCors(
            Response.json({ error: "Sourcemap store not configured" }, { status: 500 }),
            corsHeaders,
          );
        }
        try {
          if (sourcemapRoute.kind === "upload") {
            return withCors(await handleUploadSourcemap(request, sourcemapStore), corsHeaders);
          }
          return withCors(await handleResolveSource(request, sourcemapStore), corsHeaders);
        } catch (error) {
          console.error("[colaborate] Sourcemap route error:", error);
          return withCors(Response.json({ error: "Internal server error" }, { status: 500 }), corsHeaders);
        }
      }

      const sessionRoute = matchSessionRoute(pathname, "POST");
      // ... (existing session + feedback branches unchanged below)
```

**Change 6 — pass source fields to createFeedback.** In the non-session feedback-POST branch, where `store.createFeedback({ ... })` is called, add three fields from `data` (the parsed body). The call becomes:

```ts
        const feedback = await store.createFeedback({
          projectName: data.projectName,
          type: data.type,
          message: data.message,
          status: data.status ?? "open",
          url: data.url,
          viewport: data.viewport,
          userAgent: data.userAgent,
          authorName: data.authorName,
          authorEmail: data.authorEmail,
          clientId: data.clientId,
          sessionId: data.sessionId,
          componentId: data.componentId,
          sourceFile: data.sourceFile,
          sourceLine: data.sourceLine,
          sourceColumn: data.sourceColumn,
          mentions: serializeMentions(data.mentions),
          annotations: data.annotations.map(flattenAnnotation),
        });
```

Silence the dead-import linter if needed — `hashSourcemapContent` and `resolveSource` are re-exported for consumer convenience; they don't need to be used internally in `index.ts` beyond the `export` declarations.

- [ ] **Step 7.5: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/adapter-prisma 2>&1 | tail -10
bun run -F @colaborate/adapter-prisma check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: both new integration tests pass, all existing adapter-prisma tests still pass (session routes, CORS, auth, etc.), check clean, biome clean.

- [ ] **Step 7.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/adapter-prisma/src/index.ts packages/adapter-prisma/__tests__/handler-sourcemaps.test.ts packages/adapter-prisma/__tests__/handler-post-source-fields.test.ts
git commit -m "$(cat <<'EOF'
feat(adapter-prisma): wire sourcemap routes into createColaborateHandler

Routes POST /api/colaborate/sourcemaps + /api/colaborate/resolve-source
through matchSourcemapRoute before session/feedback fallthrough. Adds
sourcemapStore + sourcemapStorePath HandlerOptions; FsSourcemapStore is
auto-instantiated when only a path is provided. Threads sourceFile/Line/
Column through feedback-POST so Phase 4a's widget changes round-trip
end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CLI command `colaborate upload-sourcemaps` (TDD)

Adds a new commander subcommand. Globs `*.map` in the given `--dir`, reads each, hashes the decompressed content, gzips, POSTs to `/api/colaborate/sourcemaps` with Bearer auth, prints one line per map.

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/tsup.config.ts`
- Create: `packages/cli/src/commands/upload-sourcemaps.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/__tests__/commands/upload-sourcemaps.test.ts`

- [ ] **Step 8.1: Add deps**

```bash
cd /Users/brian/dev/colaborate
bun add fast-glob@^3.3.2 -F @colaborate/cli
bun add @colaborate/adapter-prisma@workspace:* -F @colaborate/cli
```

Then edit `packages/cli/package.json` to keep deps under `dependencies` (not `devDependencies`), mirroring the existing shape. The relevant section becomes (preserve existing entries):

```json
  "dependencies": {
    "@colaborate/core": "workspace:*",
    "@colaborate/adapter-prisma": "workspace:*",
    "@clack/prompts": "^0.9.0",
    "@mrleebo/prisma-ast": "^0.12.0",
    "commander": "^13.0.0",
    "fast-glob": "^3.3.2"
  }
```

If those are currently under `devDependencies`, move them all to `dependencies` in the same edit — this matches the published-CLI expectation that tsup bundles them via `noExternal` and they resolve correctly when the CLI is installed by a consumer.

- [ ] **Step 8.2: Update tsup config**

Edit `packages/cli/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
  sourcemap: true,
  clean: true,
  noExternal: [
    "@colaborate/core",
    "@colaborate/adapter-prisma",
    "commander",
    "@clack/prompts",
    "@mrleebo/prisma-ast",
    "fast-glob",
  ],
});
```

- [ ] **Step 8.3: Write the failing test**

Create `packages/cli/__tests__/commands/upload-sourcemaps.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runUploadSourcemaps } from "../../src/commands/upload-sourcemaps.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("runUploadSourcemaps", () => {
  let dir: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let requests: Array<{ url: string; headers: Record<string, string>; bodyBytes: number }>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "colaborate-cli-sm-"));
    mkdirSync(join(dir, "static", "chunks"), { recursive: true });
    writeFileSync(join(dir, "static", "chunks", "main.js.map"), SIMPLE_MAP);
    writeFileSync(join(dir, "static", "chunks", "app.js.map"), SIMPLE_MAP);
    // A non-.map file should be ignored
    writeFileSync(join(dir, "static", "chunks", "main.js"), "console.log(1);");

    requests = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
      const body = init?.body as Buffer | string | undefined;
      const bodyBytes = typeof body === "string" ? body.length : (body?.byteLength ?? 0);
      requests.push({ url, headers, bodyBytes });
      return new Response(JSON.stringify({ id: "ok" }), { status: 201 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uploads every .map file under the directory", async () => {
    await runUploadSourcemaps({
      project: "parkland",
      env: "staging",
      dir,
      url: "http://localhost:3000",
      apiKey: "shh",
    });
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.url === "http://localhost:3000/api/colaborate/sourcemaps")).toBe(true);
  });

  it("sends Authorization: Bearer when apiKey is provided", async () => {
    await runUploadSourcemaps({
      project: "parkland",
      env: "staging",
      dir,
      url: "http://localhost:3000",
      apiKey: "shh",
    });
    for (const r of requests) {
      expect(r.headers.authorization).toBe("Bearer shh");
    }
  });

  it("gzip-encodes the request body (content-encoding: gzip)", async () => {
    await runUploadSourcemaps({
      project: "parkland",
      env: "staging",
      dir,
      url: "http://localhost:3000",
      apiKey: "shh",
    });
    for (const r of requests) {
      expect(r.headers["content-encoding"]).toBe("gzip");
      // The gzipped body should be meaningfully smaller than the raw JSON wrapper + SIMPLE_MAP
      expect(r.bodyBytes).toBeGreaterThan(30);
    }
  });

  it("throws with a usable message on a non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => new Response("nope", { status: 401 }));
    await expect(
      runUploadSourcemaps({
        project: "parkland",
        env: "staging",
        dir,
        url: "http://localhost:3000",
        apiKey: "shh",
      }),
    ).rejects.toThrow(/401/);
  });

  it("reports a clear error when the directory is empty of .map files", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "colaborate-cli-sm-empty-"));
    try {
      await expect(
        runUploadSourcemaps({
          project: "parkland",
          env: "staging",
          dir: emptyDir,
          url: "http://localhost:3000",
          apiKey: "shh",
        }),
      ).rejects.toThrow(/No \.map files/);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 8.4: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/cli/__tests__/commands/upload-sourcemaps.test.ts 2>&1 | tail -15
```

Expected: import error on the new command module.

- [ ] **Step 8.5: Create `packages/cli/src/commands/upload-sourcemaps.ts`**

```ts
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";
import { hashSourcemapContent } from "@colaborate/adapter-prisma";
import fg from "fast-glob";
import { p } from "../prompts.js";

export interface RunUploadSourcemapsOptions {
  project: string;
  env: string;
  dir: string;
  url: string;
  apiKey?: string | undefined;
  /** Path under the server root for the upload endpoint. Defaults to "/api/colaborate/sourcemaps". */
  endpoint?: string;
}

/**
 * Pure callable for unit testing. `uploadSourcemapsCommand` below is the
 * commander-facing wrapper that adds Clack prompts + process.exit on failure.
 */
export async function runUploadSourcemaps(options: RunUploadSourcemapsOptions): Promise<void> {
  const { project, env, dir, url, apiKey } = options;
  const endpoint = options.endpoint ?? "/api/colaborate/sourcemaps";

  const matches = await fg("**/*.map", { cwd: dir, absolute: true, onlyFiles: true });
  if (matches.length === 0) {
    throw new Error(`No .map files found under ${dir}`);
  }

  for (const mapPath of matches) {
    const content = await readFile(mapPath, "utf8");
    const hash = hashSourcemapContent(content);
    const filename = basename(mapPath);
    const body = JSON.stringify({ projectName: project, env, hash, filename, content });
    const gzipped = gzipSync(Buffer.from(body, "utf8"));

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "content-encoding": "gzip",
    };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const response = await fetch(new URL(endpoint, url).toString(), {
      method: "POST",
      headers,
      body: gzipped,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Upload of ${filename} failed with ${response.status}: ${text.slice(0, 200)}`);
    }
  }
}

/** Commander action wrapper. */
export async function uploadSourcemapsCommand(options: {
  project?: string;
  env?: string;
  dir?: string;
  url?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<void> {
  p.intro("colaborate — upload sourcemaps");

  if (!options.project || !options.env || !options.dir || !options.url) {
    p.log.error("--project, --env, --dir, and --url are all required");
    process.exit(1);
  }

  const apiKey = options.apiKey ?? process.env.COLABORATE_API_KEY ?? undefined;

  const spinner = p.spinner();
  spinner.start(`Uploading .map files from ${options.dir}`);
  try {
    await runUploadSourcemaps({
      project: options.project,
      env: options.env,
      dir: options.dir,
      url: options.url,
      apiKey,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    });
    spinner.stop("Upload complete");
    p.outro("Done");
  } catch (error) {
    spinner.stop("Upload failed");
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
```

- [ ] **Step 8.6: Register the command in `packages/cli/src/index.ts`**

Add the import:

```ts
import { uploadSourcemapsCommand } from "./commands/upload-sourcemaps.js";
```

Then after the existing `doctor` registration, before `program.parse();`, add:

```ts
program
  .command("upload-sourcemaps")
  .description("Upload compiled .map files to the Colaborate backend for source resolution")
  .requiredOption("--project <name>", "Colaborate project name (scopes the upload)")
  .requiredOption("--env <env>", "Deployment env label (staging, production, preview, ...)")
  .requiredOption("--dir <dir>", "Directory to glob for .map files (walked recursively)")
  .requiredOption("--url <url>", "Colaborate backend base URL (e.g. https://colaborate.example.com)")
  .option("--api-key <key>", "Bearer API key (falls back to COLABORATE_API_KEY env)")
  .option("--endpoint <path>", "Endpoint path (default: /api/colaborate/sourcemaps)")
  .action(uploadSourcemapsCommand)
  .addHelpText(
    "after",
    "\n  Examples:\n    $ colaborate upload-sourcemaps --project parkland --env staging --dir .next --url https://app.example.com",
  );
```

- [ ] **Step 8.7: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/cli 2>&1 | tail -10
bun run -F @colaborate/cli check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all CLI tests pass, no regressions, check clean, biome clean.

- [ ] **Step 8.8: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/cli/package.json packages/cli/tsup.config.ts packages/cli/src/commands/upload-sourcemaps.ts packages/cli/src/index.ts packages/cli/__tests__/commands/upload-sourcemaps.test.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(cli): colaborate upload-sourcemaps command

New CLI subcommand for the deploy pipeline. Globs **/*.map under a
directory, gzips each body, POSTs to /api/colaborate/sourcemaps with
Bearer auth (from --api-key or COLABORATE_API_KEY). Backed by
hashSourcemapContent re-exported from @colaborate/adapter-prisma so
client and server agree on the storage key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Widget — add source fields to `FeedbackPayload` + Zod already covered (TDD)

The wire type gets three optional fields. This is a pure `@colaborate/core` change. No widget runtime logic yet — just the shape extension so the next tasks can populate it.

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/__tests__/types-source-fields.test.ts`

- [ ] **Step 9.1: Write the failing test**

Create `packages/core/__tests__/types-source-fields.test.ts`:

```ts
import { describe, expectTypeOf, it } from "vitest";
import type { FeedbackPayload } from "../src/types.js";

describe("FeedbackPayload source fields", () => {
  it("carries optional sourceFile / sourceLine / sourceColumn", () => {
    expectTypeOf<FeedbackPayload>().toHaveProperty("sourceFile");
    expectTypeOf<FeedbackPayload>().toHaveProperty("sourceLine");
    expectTypeOf<FeedbackPayload>().toHaveProperty("sourceColumn");
  });

  it("accepts the three source fields at runtime (compile-time shape check)", () => {
    const p: FeedbackPayload = {
      projectName: "p",
      type: "bug",
      message: "m",
      url: "https://example.com/",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "a",
      authorEmail: "a@example.com",
      annotations: [],
      clientId: "c",
      sourceFile: "src/app.tsx",
      sourceLine: 42,
      sourceColumn: 5,
    };
    // Runtime just needs to exist — the compile-time test above is the real assertion.
    expect(p.sourceFile).toBe("src/app.tsx");
  });

  it("still accepts a payload without source fields", () => {
    const p: FeedbackPayload = {
      projectName: "p",
      type: "bug",
      message: "m",
      url: "https://example.com/",
      viewport: "1280x720",
      userAgent: "ua",
      authorName: "a",
      authorEmail: "a@example.com",
      annotations: [],
      clientId: "c",
    };
    expect(p.sourceFile).toBeUndefined();
  });
});
```

Add imports for `expect` from `vitest` at the top — the final imports line is:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
```

- [ ] **Step 9.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core 2>&1 | tail -10
```

Expected: either compile error on `FeedbackPayload.sourceFile` or runtime failure on the shape check.

- [ ] **Step 9.3: Extend `packages/core/src/types.ts`**

Append three fields to the `FeedbackPayload` interface. Place them immediately before the `clientId` field:

```ts
  /** Source file resolved by the widget's fiber `_debugSource` walk (dev mode). Server persists as-is. */
  sourceFile?: string | undefined;
  /** 1-indexed line within `sourceFile`. */
  sourceLine?: number | undefined;
  /** 0-indexed column within `sourceFile`. */
  sourceColumn?: number | undefined;
```

- [ ] **Step 9.4: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/core 2>&1 | tail -10
bun run check 2>&1 | tail -10
bun run lint 2>&1 | tail -5
```

Expected: the three-field test passes; no regressions anywhere else (widget / adapters should continue to compile because all three fields are optional); biome clean.

- [ ] **Step 9.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/core/src/types.ts packages/core/__tests__/types-source-fields.test.ts
git commit -m "$(cat <<'EOF'
feat(core): FeedbackPayload.sourceFile / sourceLine / sourceColumn

Three new optional wire fields matching the server-side
FeedbackCreateInput (added back in Phase 1b). Populated by the widget's
fiber _debugSource walk in Phase 4a's widget changes; validated
server-side by the feedbackCreateSchema extension from Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Widget fiber walker — `readDebugSource(element)` (TDD)

Walks React fiber on a DOM element. Each React-rendered node has a property `__reactFiber$<hash>` pointing at its fiber. Fibers expose `_debugSource = { fileName, lineNumber, columnNumber }` in development builds. Walker climbs from the element up through its fiber's `return` chain looking for the first `_debugSource`, then returns `{file, line, column}` (absolute path is fine — server stores as-is). Absent → `null`.

**Files:**
- Create: `packages/widget/src/dom/source.ts`
- Create: `packages/widget/__tests__/dom/source.test.ts`

- [ ] **Step 10.1: Write the failing test**

Create `packages/widget/__tests__/dom/source.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readDebugSource } from "../../src/dom/source.js";

function attachFiber(el: HTMLElement, fiber: unknown): string {
  const key = "__reactFiber$test";
  (el as unknown as Record<string, unknown>)[key] = fiber;
  return key;
}

describe("readDebugSource", () => {
  it("returns null on an element with no React fiber property", () => {
    const el = document.createElement("div");
    expect(readDebugSource(el)).toBeNull();
  });

  it("extracts _debugSource from the element's own fiber", () => {
    const el = document.createElement("div");
    attachFiber(el, {
      _debugSource: {
        fileName: "/abs/path/app/Checkout.tsx",
        lineNumber: 42,
        columnNumber: 7,
      },
    });
    expect(readDebugSource(el)).toEqual({
      file: "/abs/path/app/Checkout.tsx",
      line: 42,
      column: 7,
    });
  });

  it("climbs the fiber return chain to find the first populated _debugSource", () => {
    const el = document.createElement("div");
    const parentFiber = {
      _debugSource: {
        fileName: "/abs/path/app/Page.tsx",
        lineNumber: 10,
        columnNumber: 3,
      },
    };
    const ownFiber = { _debugSource: null, return: parentFiber };
    attachFiber(el, ownFiber);
    expect(readDebugSource(el)).toEqual({
      file: "/abs/path/app/Page.tsx",
      line: 10,
      column: 3,
    });
  });

  it("returns null when fibers exist but no _debugSource is populated in the chain", () => {
    const el = document.createElement("div");
    const ownFiber = { _debugSource: null, return: { _debugSource: null, return: null } };
    attachFiber(el, ownFiber);
    expect(readDebugSource(el)).toBeNull();
  });

  it("returns null when the fiber chain has malformed _debugSource (missing fields)", () => {
    const el = document.createElement("div");
    attachFiber(el, { _debugSource: { fileName: null, lineNumber: 1, columnNumber: 0 } });
    expect(readDebugSource(el)).toBeNull();
  });

  it("ignores non-fiber-prefixed properties", () => {
    const el = document.createElement("div");
    (el as unknown as Record<string, unknown>).__notAFiber$ = {
      _debugSource: { fileName: "/a.tsx", lineNumber: 1, columnNumber: 0 },
    };
    expect(readDebugSource(el)).toBeNull();
  });
});
```

- [ ] **Step 10.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/dom/source.test.ts 2>&1 | tail -15
```

Expected: import error on `source.js`.

- [ ] **Step 10.3: Create `packages/widget/src/dom/source.ts`**

```ts
export interface DebugSource {
  file: string;
  line: number;
  column: number;
}

interface FiberLike {
  _debugSource?: { fileName?: string | null; lineNumber?: number | null; columnNumber?: number | null } | null;
  return?: FiberLike | null;
}

/**
 * Read React's `_debugSource` metadata from a DOM element if available.
 *
 * React attaches the fiber to DOM nodes via a property whose name starts
 * with `__reactFiber$`. Development builds populate `fiber._debugSource`
 * with `{fileName, lineNumber, columnNumber}` pointing at the jsx source.
 *
 * Production builds strip `_debugSource`, so this walker returns `null` and
 * the widget omits the source fields from the feedback payload. This is the
 * Phase 4a capture strategy — the sourcemap uploader/resolver endpoints
 * exist for a future prod capture path (e.g. stack frames from event
 * handlers) but are not wired to the widget in Phase 4a.
 *
 * Safe on non-React pages: missing property ⇒ null; unexpected shapes ⇒ null.
 */
export function readDebugSource(element: Element): DebugSource | null {
  const fiber = findFiber(element);
  if (!fiber) return null;

  let current: FiberLike | null | undefined = fiber;
  while (current) {
    const ds = current._debugSource;
    if (
      ds &&
      typeof ds.fileName === "string" &&
      typeof ds.lineNumber === "number" &&
      typeof ds.columnNumber === "number"
    ) {
      return { file: ds.fileName, line: ds.lineNumber, column: ds.columnNumber };
    }
    current = current.return ?? null;
  }
  return null;
}

function findFiber(element: Element): FiberLike | null {
  for (const key in element) {
    if (key.startsWith("__reactFiber$")) {
      const candidate = (element as unknown as Record<string, unknown>)[key];
      if (candidate && typeof candidate === "object") return candidate as FiberLike;
    }
  }
  return null;
}
```

- [ ] **Step 10.4: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget 2>&1 | tail -10
bun run -F @colaborate/widget check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: all `readDebugSource` tests pass, no regressions, check clean, biome clean.

- [ ] **Step 10.5: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/dom/source.ts packages/widget/__tests__/dom/source.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): readDebugSource — fiber _debugSource walker

Pure DOM helper. Reads React's __reactFiber$* property on an element,
climbs the fiber return chain, returns {file, line, column} from the
first populated _debugSource or null. Works in dev builds where React
retains jsx-dev source metadata; silently returns null in prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Annotator + launcher integration — thread source into `FeedbackPayload` (TDD)

The annotator already captures an anchor element. In `finishDrawing`, after we've chosen the final anchor (`findAnchorElement`), call `readDebugSource(anchorElement)` and attach the result to the `AnnotationComplete` event as `source?`. The launcher spreads `source.file/line/column` into the `FeedbackPayload`.

**Files:**
- Modify: `packages/widget/src/annotator.ts`
- Modify: `packages/widget/src/launcher.ts`
- Create: `packages/widget/__tests__/launcher-source.test.ts`

- [ ] **Step 11.1: Write the failing test**

Create `packages/widget/__tests__/launcher-source.test.ts`:

```ts
// @vitest-environment jsdom
import type { AnnotationPayload, FeedbackPayload } from "@colaborate/core";
import { describe, expect, it } from "vitest";

// We can't easily boot the full launcher in a unit test — instead we verify
// the payload construction against the AnnotationComplete shape. The launcher
// test below (integration-shaped but pure) synthesizes what launcher does.

import type { AnnotationComplete } from "../src/annotator.js";

function buildPayload(complete: AnnotationComplete): FeedbackPayload {
  // This mirrors the exact payload-construction block in launcher.ts.
  const { annotation, type, message } = complete;
  return {
    projectName: "p",
    type,
    message,
    url: "https://example.com/",
    viewport: "1280x720",
    userAgent: "ua",
    authorName: "a",
    authorEmail: "a@example.com",
    annotations: [annotation as AnnotationPayload],
    clientId: "c",
    ...(complete.source
      ? { sourceFile: complete.source.file, sourceLine: complete.source.line, sourceColumn: complete.source.column }
      : {}),
  };
}

describe("FeedbackPayload builder parity with annotator's AnnotationComplete.source", () => {
  const annotation = {
    anchor: {
      cssSelector: "main > h1",
      xpath: "/html/body/main/h1",
      textSnippet: "Hi",
      elementTag: "H1",
      textPrefix: "",
      textSuffix: "",
      fingerprint: "1:0:x",
      neighborText: "",
    },
    shape: "rectangle" as const,
    geometry: { shape: "rectangle" as const, x: 0, y: 0, w: 1, h: 1 },
    scrollX: 0,
    scrollY: 0,
    viewportW: 1280,
    viewportH: 720,
    devicePixelRatio: 1,
  };

  it("spreads sourceFile/Line/Column when source is present", () => {
    const payload = buildPayload({
      annotation,
      type: "bug",
      message: "m",
      sessionMode: false,
      source: { file: "/abs/app/Checkout.tsx", line: 42, column: 7 },
    });
    expect(payload.sourceFile).toBe("/abs/app/Checkout.tsx");
    expect(payload.sourceLine).toBe(42);
    expect(payload.sourceColumn).toBe(7);
  });

  it("omits the three fields when source is absent", () => {
    const payload = buildPayload({
      annotation,
      type: "bug",
      message: "m",
      sessionMode: false,
    });
    expect(payload.sourceFile).toBeUndefined();
    expect(payload.sourceLine).toBeUndefined();
    expect(payload.sourceColumn).toBeUndefined();
  });
});
```

- [ ] **Step 11.2: Run to confirm failure**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget/__tests__/launcher-source.test.ts 2>&1 | tail -15
```

Expected: compile error because `AnnotationComplete.source` doesn't exist yet.

- [ ] **Step 11.3: Modify `packages/widget/src/annotator.ts`**

**Change 1** — add the `source` field to `AnnotationComplete`:

```ts
export interface AnnotationComplete {
  annotation: AnnotationPayload;
  type: FeedbackType;
  message: string;
  sessionMode: boolean;
  /** Populated in dev builds via React fiber `_debugSource`; undefined otherwise. */
  source?: { file: string; line: number; column: number };
}
```

**Change 2** — import the walker at the top of the file. Add:

```ts
import { readDebugSource } from "./dom/source.js";
```

**Change 3** — in `finishDrawing` (or wherever the `annotation:complete` event is emitted), capture source from the final anchor element. The existing flow already has an `Element` reference for the chosen anchor (the result of `findAnchorElement(rect)` or similar). Directly before building the `AnnotationComplete` object, call:

```ts
const source = readDebugSource(chosenAnchorElement) ?? undefined;
```

Then spread that into the event payload:

```ts
const complete: AnnotationComplete = {
  annotation,
  type,
  message,
  sessionMode: this.sessionMode,
  ...(source ? { source } : {}),
};
this.bus.emit("annotation:complete", complete);
```

Adjust the exact variable names (`chosenAnchorElement`, `annotation`, etc.) to match the existing code — do not introduce new variables if they already exist. The key change is that a freshly-read `source` is conditionally spread into the emitted event.

If the existing code path can't readily access the anchor `Element` at the emit site, store it in a local variable where `findAnchorElement` runs and pass it through.

- [ ] **Step 11.4: Modify `packages/widget/src/launcher.ts`**

Find the `FeedbackPayload` construction block (around line 283). Extend it with the conditional source spread:

```ts
const payload: FeedbackPayload = {
  projectName: config.projectName,
  type,
  message,
  url: sanitizedUrl,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  userAgent: navigator.userAgent,
  authorName: identity.name,
  authorEmail: identity.email,
  annotations: [annotation],
  clientId,
  ...(sessionId ? { sessionId, status } : {}),
  ...(complete.source
    ? {
        sourceFile: complete.source.file,
        sourceLine: complete.source.line,
        sourceColumn: complete.source.column,
      }
    : {}),
};
```

`complete` is the `AnnotationComplete` event object received from the annotator — rename the variable to match whatever name the existing code uses (likely `annotation` is a destructured field, in which case the parent variable holds `source`).

- [ ] **Step 11.5: Run tests + check + lint**

```bash
cd /Users/brian/dev/colaborate
bun run test:run packages/widget 2>&1 | tail -10
bun run test:e2e 2>&1 | tail -10
bun run -F @colaborate/widget check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

Expected: new source-payload tests pass; existing widget tests (annotator, launcher, etc.) still pass; all 109 E2E pass with 2 skips (no change — the E2E pages aren't React, so `_debugSource` is always absent and source fields stay undefined); check clean; biome clean.

If an existing annotator test explicitly asserts on the `AnnotationComplete` shape (equality rather than field-by-field), the new optional `source` field may make it fail. Fix those tests by asserting the specific fields they care about rather than deep-equal on the whole object, OR by passing `source: undefined` explicitly. Do NOT remove the `source` field from the interface to appease the test.

- [ ] **Step 11.6: Commit**

```bash
cd /Users/brian/dev/colaborate
git add packages/widget/src/annotator.ts packages/widget/src/launcher.ts packages/widget/__tests__/launcher-source.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): capture React _debugSource into feedback payload

Annotator reads the fiber _debugSource on the chosen anchor element and
emits it on AnnotationComplete.source. Launcher spreads it into the
FeedbackPayload as sourceFile/Line/Column. Fails open — missing fiber
metadata ⇒ fields omitted ⇒ server persists null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Full build + full test sweep

Pure verification task — no code changes. Catches cross-package regressions (new `@colaborate/adapter-prisma` export wasn't picked up by another consumer, etc.). Follows the established pattern from Phases 2 + 3.

**Files:** none.

- [ ] **Step 12.1: Full build**

```bash
cd /Users/brian/dev/colaborate
bun run build 2>&1 | tail -20
```

Expected: 8/8 packages build, Turborepo cache HITs where unchanged. No package should fail — the sourcemap changes are additive.

- [ ] **Step 12.2: Full typecheck**

```bash
cd /Users/brian/dev/colaborate
bun run check 2>&1 | tail -10
```

Expected: 11/11 check tasks green.

- [ ] **Step 12.3: Full unit test sweep**

```bash
cd /Users/brian/dev/colaborate
bun run test:run 2>&1 | tail -10
```

Expected: approximately 993 + ~50 new tests = ~1040-1050 passing, 0 failing.

- [ ] **Step 12.4: Full E2E sweep**

```bash
cd /Users/brian/dev/colaborate
bun run test:e2e 2>&1 | tail -15
```

Expected: 109 passed, 2 skipped (unchanged from Phase 3 — E2E pages aren't React + `_debugSource` is always absent).

- [ ] **Step 12.5: Full lint**

```bash
cd /Users/brian/dev/colaborate
bun run lint 2>&1 | tail -5
```

Expected: biome clean across all 201+ files (now ~210 with the new sourcemap files).

**No commit.** This task only verifies.

---

## Task 13: Docs + status bump + tag `v0.5.0-phase-4a`

Marks Phase 4a complete in `status.md`, bumps `todo.md` to point at Phase 4b, tags the release.

**Files:**
- Modify: `status.md`
- Modify: `todo.md`

- [ ] **Step 13.1: Update `status.md`**

Insert a new "What Phase 4a shipped" block immediately after the existing header line `# Colaborate — session status (2026-04-21)` but before "## What's landed". Update the top-level table to add the new row. The summary block should cover:

- New `SourcemapStore` interface in `@colaborate/core` + 5 new types
- `FsSourcemapStore` + `resolveSource` + `hashSourcemapContent` in `@colaborate/adapter-prisma`
- Two new HTTP routes + 3 new Zod schemas (including the 3 new optional fields on `feedbackCreateSchema`)
- `colaborate upload-sourcemaps` CLI subcommand
- Widget fiber `_debugSource` capture → wire-level extension on `FeedbackPayload`
- Test count bump (993 → ~1040-1050)
- Commit hashes for the Phase 4a sequence (fill in actual hashes after running `git log --oneline | head -15`)

Use the same shape as the existing "What Phase 3 shipped" section for layout consistency — bullet groups + commit trail at the bottom.

- [ ] **Step 13.2: Update `todo.md`**

Mark Phase 4 as split + mark 4a complete:

```md
## In Progress
_(nothing in-flight — Phase 4a shipped cleanly)_

## Next Up

- [ ] **Phase 4b** — Screenshot ingest pipeline + attach_screenshot MCP tool + session resource populates real screenshots

## Phase 5+ (written when Phase 4b lands)

- [ ] **Phase 5** — Triage worker (Claude API) + GitHub adapter
- [ ] **Phase 6** — Linear adapter + config switch
- [ ] **Phase 7** — Deploy to sop-hub, wire into parkland, internal dogfood
- [ ] **Phase 8** — README polish + public OSS release
```

In the "Completed This Session" block, append:

```md
- [x] **Phase 4a** — Sourcemap uploader CLI + ingest/resolver HTTP routes + widget dev-mode source capture. New `SourcemapStore` sibling interface + `FsSourcemapStore` + `@jridgewell/trace-mapping` resolver. `colaborate upload-sourcemaps` CLI subcommand gzips and POSTs .map files. Widget walks React fiber `_debugSource` on the annotated element and attaches `sourceFile/Line/Column` to feedback payloads (fails open). Three new optional fields on `FeedbackPayload` + server Zod schema + createFeedback pass-through. ~1040-1050 unit / 109 E2E green. Tagged `v0.5.0-phase-4a`.
```

- [ ] **Step 13.3: Commit**

```bash
cd /Users/brian/dev/colaborate
git add status.md todo.md
git commit -m "$(cat <<'EOF'
docs: status.md + todo.md for Phase 4a completion

Sourcemap uploader (CLI + ingest/resolver routes + FsSourcemapStore) and
widget dev-mode _debugSource capture are live. Phase 4b (screenshots +
attach_screenshot MCP tool) is the next milestone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 13.4: Tag `v0.5.0-phase-4a`**

```bash
cd /Users/brian/dev/colaborate
git tag -a v0.5.0-phase-4a -m "Phase 4a — sourcemap uploader + resolver + widget dev-mode source capture"
git tag --list
git log --oneline | head -20
```

Expected: new tag appears in the list alongside the earlier phase tags. Log shows the Phase 4a commit sequence.

---

## Self-Review (run after writing, before executing)

### 1. Spec coverage

Walk through § Sourcemap uploader (spec line 223) and § Widget changes → Source resolution (line 166/171). Confirm every requirement maps to a task:

- `colaborate upload-sourcemaps --project <name> --env <env> --dir <dir>` CLI subcommand → Task 8 ✅
- Hashes each .map, POSTs to `/api/colaborate/sourcemaps`, stores locally keyed by `{project, env, hash}` → Task 8 (hash + POST) + Task 4 (FsSourcemapStore keying) ✅
- Backend resolves via `source-map-js` or `@jridgewell/trace-mapping` → Task 3 (picked `@jridgewell/trace-mapping`) ✅
- Widget reads `getComputedStyle` + walks fiber for component hint → **simplified**: fiber `_debugSource` walker in Task 10. `getComputedStyle` was a red-herring in the spec — it doesn't give source info. Component hint via `componentId` is already Phase 1b's. Documented choice in the "Architecture" header + Task 10 comment.
- Calls `resolveSourceLocation(anchorSelector, uploadedSourcemapId)` against the backend → **intentionally deferred past Phase 4a**. The resolver endpoint exists (Task 6); the widget does not call it. See Out-of-scope + the Task 10 comment for why — v0 has no way to map a CSS selector to a bundled line/col without a babel plugin or stack-frame capture. The endpoint is ready when that integration lands.
- Failure mode silent omit → Task 10 (`null` return) + Task 11 (conditional spread) ✅

### 2. Placeholder scan

No "TODO", "fill in later", "implement similar to", "add error handling". Every code block in every task is runnable. Two deliberate non-deterministic spots are called out in-task:
- Task 3: VLQ fixture constants may need regeneration with `@jridgewell/sourcemap-codec` if exact line/col assertions mismatch. Documented inline.
- Task 11: exact variable names in annotator.ts are inferred from the code at implementation time ("adjust the exact variable names to match the existing code"). This is a conscious choice — pasting verbatim code from annotator.ts here would duplicate ~40 LOC already in the repo. The change surface is small and unambiguous.

### 3. Type consistency

- `SourcemapStore` method signatures match across Task 1 (interface), Task 4 (FsSourcemapStore impl), Task 6 (handler callers), and Task 7 (handler wiring).
- `ResolveSourceResult` from `@colaborate/core` (`sourceFile/Line/Column`) vs. `ResolvedPosition` in `sourcemap-resolver.ts` (`source/line/column`) — deliberately distinct names. The resolver is a primitive over the raw map; the store-level result is the server-facing shape that matches the existing `FeedbackRecord` fields. `FsSourcemapStore.resolveSourceLocation` bridges them (Task 4). Verified consistent.
- `hashSourcemapContent` is the single hashing authority — used by the CLI (Task 8), by the upload handler body-hash verify (Task 6), and by `FsSourcemapStore`'s key derivation (Task 4 via the client). One definition, re-exported from `@colaborate/adapter-prisma`'s main entry (Task 7).
- `FeedbackPayload` new fields (Task 9) use `| undefined` (matches repo convention for `exactOptionalPropertyTypes: true`); `FeedbackCreateInput` extensions (Task 5) use the same shape.
- `AnnotationComplete.source` in `annotator.ts` (Task 11) — fields named `file/line/column`; launcher maps them to `sourceFile/sourceLine/sourceColumn` on the payload (Task 11). Verified consistent.
- Zod `.int().min(1)` for line / `.int().min(0)` for column matches the 1-indexed line / 0-indexed column convention used by `@jridgewell/trace-mapping` and asserted in Task 3 tests.

### 4. Execution-mode constraints

- Every implementer task's verify block includes `bun run lint` — satisfies the user's "include `bun run lint` in every implementer's verify step" requirement.
- No task touches `packages/mcp-server`, `packages/adapter-memory`, `packages/adapter-localstorage` — frozen for Phase 4a.
- No task touches `packages/triage`, `packages/integration-*`, or any future-phase code.
- Commits are small (one per task) and use conventional-commit prefixes + Co-Authored-By trailers.
- Tag created only at the end (Task 13).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-phase-4a-sourcemap-uploader.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task via the `superpowers:subagent-driven-development` skill, two-stage review (spec + code quality) between tasks, fast iteration.

**2. Inline Execution** — I execute tasks here using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
