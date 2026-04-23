# Colaborate — session status (2026-04-22)

## What's landed

| Phase | Status | Commit | Tag |
|---|---|---|---|
| Brainstorm + spec | ✅ | — | — |
| **Phase 0** — fork + rebrand | ✅ | `e656ff4` | `v0.0.0-fork` |
| **Phase 1a** — Geometry-as-union data layer | ✅ | `ce24787` | `v0.1.0-phase-1a` |
| **Phase 1b** — Schema extensions (session + 9 extended feedback fields + mentions) | ✅ | `cb22e63` | `v0.2.0-phase-1b` |
| **Phase 1c** — Widget shape UI (picker + 6 drawing modes + shortcuts) | ✅ | `f2f141e` | `v0.1.1-phase-1c` |
| **Phase 2** — Widget session drafting UX + session HTTP routes | ✅ | `b13b8bc` | `v0.3.0-phase-2` |
| **Phase 3** — MCP server (@colaborate/mcp-server package) | ✅ | `c1283b2` | `v0.4.0-phase-3` |
| **Phase 4a** — Sourcemap uploader CLI + FsSourcemapStore + widget dev-mode `_debugSource` capture | ✅ | `d8974f0` | `v0.5.0-phase-4a` |
| **Phase 4b** — Screenshot ingest pipeline + `attach_screenshot` MCP tool + MCP session bundles carry real screenshot metadata + widget opt-in html2canvas capture | ✅ | `4dba14c` | `v0.5.1-phase-4b` |

**Current main branch state — all green:**

- `bun run build` → 8/8 packages build (11/11 check tasks pass)
- `bun run test:run` → **1108 / 1108 unit tests pass** (was 1053 for Phase 4a; +55 from screenshot conformance × 2 adapters + FsScreenshotStore + screenshot-hash + routes-screenshots + handler-screenshots + ScreenshotResponse refactor + non-OK client test + screenshot module + api-client + launcher integration × 3 + MCP populate tests × 2 + attach_screenshot tool × 3 + smoke extension + session-route Bearer × 4)
- `bun run test:e2e` → **109/109 Playwright pass, 2 skipped** — regression caught + fixed mid-phase (Task 10's html2canvas dynamic import triggered tsup's default ESM code-splitting, emitting a 120-byte `chunk-XXXX.js` that `dist/index.js` statically imported at the top; the E2E server only serves `/widget.js` so the chunk 404'd and the widget module failed to load. Fixed by `splitting: false` in `packages/widget/tsup.config.ts` — all code now inlined into `dist/index.js`, bundle grows 140 KB → 340 KB as the price of single-file distribution)
- `bun run lint` → **biome clean across 231 files, zero warnings** (Task 0 removed the pre-existing harmless warning in `routes-sourcemaps.test.ts` — Phase 4b entered and exited warning-free)

## What Phase 4b shipped

Screenshot ingest + upload + MCP exposure, end-to-end. All API-key-authed when a key is configured; defaults remain anonymous-friendly.

- **`ColaborateStore` extended with `attachScreenshot` + `listScreenshots`** — NOT a sibling interface (contrast Phase 4a's `SourcemapStore`). Screenshots are user-facing data tied to feedbacks, so all three adapters implement. `ScreenshotRecord` has `{id, feedbackId, url, byteSize, createdAt: Date}`; `id` is the 64-char hex SHA-256 of the decoded PNG bytes (content-addressed dedup + filename). A new `ScreenshotResponse` wire type (with `createdAt: string`) mirrors `SessionResponse` / `FeedbackResponse`.
- **`FsScreenshotStore` in `@colaborate/adapter-prisma`** — mirrors `FsSourcemapStore` layout: `{root}/{feedbackId}/{hash}.png` + sibling `index.json`. `readIndex` distinguishes ENOENT (empty) from real FS/JSON errors (rethrow — no silent data loss). Re-put on existing hash refreshes `createdAt` AND moves entry to front of list. `dirFor` uses positive allowlist `/^[A-Za-z0-9_-]+$/` for path-traversal defense-in-depth. 9 unit tests.
- **`hashPngBytes(bytes)` helper** — SHA-256 hex digest via `node:crypto.createHash`. 3 unit tests.
- **Memory + LocalStorage adapters** implement the two new methods with `atob` + Web Crypto (`crypto.subtle.digest`). LocalStorage persists metadata only (no bytes — would exceed quota). Duplicated decode helper across both adapters is intentional (Prisma uses a synchronous Node `Buffer.from(base64)` path instead — three different stores, two distinct decoders).
- **Three new HTTP routes on `@colaborate/adapter-prisma`:**
  - `POST /api/colaborate/feedbacks/:id/screenshots` — attach. Zod-validated `{dataUrl}` (14 MiB base64 cap ≈ 10 MiB decoded).
  - `GET /api/colaborate/feedbacks/:id/screenshots` — list metadata.
  - `GET /api/colaborate/feedbacks/:id/screenshots/:hash` — serve PNG bytes with `content-type: image/png` + `cache-control: private, max-age=3600`.
  - All three always require API key auth when `apiKey` is set (posture matches Phase 2 sessions + Phase 4a sourcemaps).
- **`createColaborateHandler` options extended:** new `screenshotStore` + `screenshotStorePath` options. Path auto-instantiates `FsScreenshotStore`. `PrismaStore` constructor now takes an optional `screenshotStore` as 2nd arg; `attachScreenshot` throws actionable error when unconfigured, `listScreenshots` returns `[]`.
- **Widget `captureViewportScreenshot(ignoreSelectors)`** in `packages/widget/src/screenshot.ts` — lazy `await import("html2canvas")`, filters Colaborate-owned DOM (`colaborate-widget` custom element + `#colaborate-markers` container — both DOM-verified against actual markup), returns `data:image/png;base64,…` or `null`. Fails open; `console.warn`s the error for debuggability.
- **`ColaborateConfig.captureScreenshots?: boolean`** (default `false`) opts into the capture path. `ColaborateConfig.apiKey?: string` forwards as Bearer on the widget's screenshot routes (and, via a Phase 4b-surfaced fix, the Phase 2 session routes which were missing it).
- **`WidgetClient.attachScreenshot(feedbackId, dataUrl)`** on both `ApiClient` (HTTP POST with Bearer when `apiKey` set) + `StoreClient` (direct store delegation, ISO-serializes `Date`).
- **Launcher integration** — after `client.sendFeedback` resolves, a detached `void (async () => {…})()` block captures + uploads the screenshot when `config.captureScreenshots === true`. Runs fire-and-forget so capture/upload failures never delay the `feedback.sent.confirmation` toast. All errors routed through the existing `log` debug helper.
- **MCP `get_session` tool + `colaborate://session/{id}` resource** now populate real `screenshots: ScreenshotRecord[]` by iterating linked feedbacks and calling `store.listScreenshots`. "Phase 4 limitation" caveat text removed from both descriptions. URLs only in the bundle — embedding base64 bytes would blow out LLM context on a multi-screenshot session.
- **New MCP tool `attach_screenshot`** in `packages/mcp-server/src/tools/attach-screenshot.ts` — Zod input `{feedbackId, dataUrl}` with regex + 14 MiB size cap mirroring the HTTP surface. Try/catch returns `{isError: true}` on any store throw. Wired into `registerAllTools` as the 7th tool. Smoke test in `server.test.ts` now round-trips `attach_screenshot` → `colaborate://session/{id}` read and asserts the screenshot appears in the bundle.
- **MCP server bumped from 0.4.0 → 0.5.0** in `packages/mcp-server/src/server.ts`'s `MCP_SERVER_VERSION` constant (workspace package.json stays at `0.0.0` per the repo's existing convention — the code constant is the handshake value).
- **Widget tsup bundling fix** — `splitting: false` added to `packages/widget/tsup.config.ts` so the `noExternal` bundle guarantees a single `dist/index.js` output. Without this, Task 10's dynamic `import("html2canvas")` caused tsup's default ESM splitting to emit chunk files that the E2E server (and typical consumers) don't serve. Widget now bundles html2canvas unconditionally (~200 KB inlined) — the price of single-file distribution, consistent with Phase 1c's treatment of `perfect-freehand`.
- **Testing:** +55 Vitest tests across 11 new/modified test files covering all 3 adapters' conformance, FS store round-trip + corruption + traversal, HTTP route handlers + handler integration, widget screenshot module + client method + launcher integration × 3, MCP tool + resource + attach tool + size cap + smoke. E2E remains 109 pass + 2 skip (no new E2E coverage — Phase 4b is opt-in behind `captureScreenshots`, which the test pages don't set).
- **Known follow-ups** (chips spawned mid-phase):
  - *Fix screenshot attach 500→400 for bad dataUrl* — introduce `StoreValidationError` in `@colaborate/core`, have adapters throw it from decode paths, remap to 400 in both the HTTP handler and the MCP tool. Requested by Task 7 + Task 14 reviewers.
  - *Forward apiKey Bearer on session routes* — already landed mid-phase (`f831d44`). Pre-existing Phase 2 bug exposed when Task 11 added the `authHeaders()` pattern and the session methods were seen to lack it.
- **Purely additive to the database.** No new Prisma tables. Screenshots live on the filesystem under `SCREENSHOT_STORE_PATH/{feedbackId}/{hash}.png`.
- **Deferred to later phases:** per-screenshot MCP resources with embedded `blob` content (image/png) for LLM vision workflows; env-configurable size cap; `externalIssueUrl` write-through (Phase 6); OAuth 2.1 + PKCE (Phase 7).

## Phase 4b commit trail

```
4dba14c  fix(widget): disable tsup code-splitting to keep single-file bundle
9584107  chore(mcp-server): bump to 0.5.0 + smoke-test attach_screenshot
f831d44  fix(widget): forward apiKey Bearer on session routes
cfe35f8  fix(mcp-server): enforce screenshot size cap on attach_screenshot
b33474c  feat(mcp-server): attach_screenshot tool
c79c6d4  feat(mcp-server): get_session + session resource populate real screenshots
00d86d5  fix(widget): correct screenshot ignoreElements selectors
0fe7f9f  feat(widget): capture + attach screenshot after feedback submit
3a806ab  refactor(core): extract ScreenshotResponse wire type
10a4d4c  feat(widget): attachScreenshot on ApiClient + StoreClient
de189d1  fix(widget): log capture failure via console.warn
e708cb1  feat(widget): captureViewportScreenshot — html2canvas lazy wrapper
d4b4c82  feat(core): ColaborateConfig.captureScreenshots + apiKey
facbe0a  feat(adapter-prisma): wire screenshot routes into createColaborateHandler
2bbef24  feat(adapter-prisma): HTTP handlers for screenshot attach/list/read
182f398  feat(adapter-prisma): PrismaStore.attachScreenshot via FsScreenshotStore
a15c89e  fix(adapter-prisma): FsScreenshotStore — match FsSourcemapStore robustness
ef81a12  feat(adapter-prisma): FsScreenshotStore — filesystem PNG store
0d3a5fc  feat(adapter-localstorage): attachScreenshot + listScreenshots
d1a83b5  feat(adapter-memory): attachScreenshot + listScreenshots
1dfe9db  test(core): extend conformance suite with screenshot round-trip
f0c0d98  feat(core): add attachScreenshot / listScreenshots to ColaborateStore
3bb4fe8  chore(adapter-prisma): drop unnecessary as-any cast on gzipped body
```

## What Phase 4a shipped

Sourcemap ingest + resolution backend + first widget source-capture.

- **New `SourcemapStore` interface in `@colaborate/core`** — sibling of `ColaborateStore`, NOT an extension. `SourcemapPutInput`, `SourcemapRecord`, `ResolveSourceInput`, `ResolveSourceResult` plus 4 methods (`putSourcemap`, `getSourcemap`, `listSourcemaps`, `resolveSourceLocation`). Deliberately kept out of `ColaborateStore` so Memory / LocalStorage adapters don't need to stub unused methods.
- **`FsSourcemapStore` in `@colaborate/adapter-prisma`** — filesystem-backed. Layout: `{root}/{projectName}/{env}/{hash}.map` + sibling `index.json` metadata. Idempotent on `{project, env, hash}` — re-upload refreshes filename + uploadedAt in place. 8 unit tests with `os.tmpdir()`.
- **`resolveSource(mapContent, line, column)`** in `@colaborate/adapter-prisma` — pure primitive over `@jridgewell/trace-mapping`'s `TraceMap` + `originalPositionFor`. Fails closed: any parse error, any null source → null.
- **`hashSourcemapContent(content)` helper** — SHA-256 hex digest of *decompressed* map body. Used as FS key + pre-upload dedup signal + upload integrity verify.
- **Two new HTTP routes on `@colaborate/adapter-prisma`:**
  - `POST /api/colaborate/sourcemaps` — ingest. Decompresses gzipped bodies (`node:zlib.gunzipSync`), verifies body `hash` matches SHA-256 of `content` before storing. 201 with the `SourcemapRecord` on success. Always API-key-authed when `apiKey` is set.
  - `POST /api/colaborate/resolve-source` — resolve. Delegates to `store.resolveSourceLocation`. 200 `{sourceFile, sourceLine, sourceColumn}` on hit; 404 on miss. Same auth posture.
- **`createColaborateHandler` options extended:** new `sourcemapStore` + `sourcemapStorePath`. The path auto-instantiates an `FsSourcemapStore`. Routes cascade: sourcemap → session → feedback with no pathname overlap.
- **Feedback POST now threads `sourceFile / sourceLine / sourceColumn`** through the wire schema + `createFeedback` — the fields were already on `FeedbackCreateInput` from Phase 1b but previously always `undefined`.
- **New CLI subcommand `colaborate upload-sourcemaps --project <name> --env <env> --dir <dir> --url <url>`** — fast-glob `**/*.map` under `dir`, gzip each body, POST to `/api/colaborate/sourcemaps` with Bearer auth (from `--api-key` or `COLABORATE_API_KEY`). Sequential uploads for deterministic error attribution.
- **Widget `readDebugSource(element)`** in `packages/widget/src/dom/source.ts` — walks React's `__reactFiber$*` property, climbs the fiber `return` chain, returns `{file, line, column}` from the first populated `_debugSource` (or `null`). Works in React dev builds; silently `null` in prod or on non-React pages.
- **Annotator + launcher integration** — both `annotation:complete` emit sites (mouse/touch + keyboard) call `readDebugSource` on the chosen anchor element and conditionally spread `source` into the event. Launcher spreads that into `FeedbackPayload.sourceFile/Line/Column`. Fails open: missing fiber metadata ⇒ fields omitted ⇒ server persists `null`.
- **New wire fields on `FeedbackPayload`** — three optional fields mirroring the server-side `FeedbackCreateInput`. Backward compatible — existing widget POSTs without them continue to validate.
- **Purely additive.** No changes to `packages/mcp-server` (Phase 3 surface frozen — screenshots land in Phase 4b). No changes to `@colaborate/adapter-memory` or `@colaborate/adapter-localstorage` (they don't need `SourcemapStore`). No Prisma tables added — source maps live on the filesystem.
- **Testing:** +60 Vitest tests across 9 new test files. E2E unchanged (test pages aren't React dev builds, so `_debugSource` is always absent and the new optional wire fields stay undefined).
- **Deferred to later phases:** widget calling the resolver endpoint in production (requires a babel plugin injecting source metadata, or event-handler stack-frame capture); screenshot ingest + `attach_screenshot` MCP tool (Phase 4b); `externalIssueUrl` write-through (Phase 6); OAuth 2.1 + PKCE (Phase 7).

## Phase 4a commit trail

```
d8974f0  feat(widget): capture React _debugSource into feedback payload
e4b6186  feat(widget): readDebugSource — fiber _debugSource walker
80c640f  feat(core): FeedbackPayload.sourceFile / sourceLine / sourceColumn
68b9ca6  feat(cli): colaborate upload-sourcemaps command
3bef314  feat(adapter-prisma): wire sourcemap routes into createColaborateHandler
cdaa76b  feat(adapter-prisma): HTTP handlers for sourcemap upload + resolve
4fc6881  feat(adapter-prisma): Zod schemas for sourcemap routes + source fields
7a6c9fa  feat(adapter-prisma): FsSourcemapStore — filesystem SourcemapStore
feb9e64  feat(adapter-prisma): resolveSource helper over trace-mapping
4d0db86  feat(adapter-prisma): hashSourcemapContent helper + trace-mapping dep
59c0260  feat(core): add SourcemapStore interface + types
```

## What Phase 3 shipped

New `@colaborate/mcp-server` package — Colaborate's first LLM-facing surface.

- **6 MCP tools** backed by `ColaborateStore`:
  - `list_sessions({projectName, status?, limit?})`
  - `get_session({id})` → `{ session, feedback[], screenshots: [] }` (screenshots land in Phase 4)
  - `list_feedback({projectName, sessionId?, componentId?, status?, limit?})`
  - `get_component_feedback({projectName, componentId?})` → grouped by componentId
  - `resolve_feedback({id, externalIssueUrl?})` — flips to `resolved`; `externalIssueUrl` accepted but unpersisted (Phase 6)
  - `search_feedback({projectName, query, sessionId?, componentId?, status?, limit?})`
- **2 resources** (one-shot, no subscriptions in v0):
  - `colaborate://session/{id}` — session bundle
  - `colaborate://feedback/{id}` — single feedback with annotations
- **1 prompt** `/triage-session {id}` — single user-role message instructing the LLM to draft tracker issues from a session bundle; references the session resource URI so the client can attach the bundle.
- **Transports:**
  - `connectStdio(server)` + `bin/stdio.mjs` entry point — Claude Code can launch with `{"command":"node","args":["bin/stdio.mjs"]}`
  - `createHttpHandler({ server, apiKey? })` — Fetch-API handler wrapping `StreamableHTTPServerTransport` in stateless mode, with constant-time Bearer auth when `apiKey` is set. Drops into Next.js App Router / Bun / Hono / Cloudflare Workers.
- **Purely additive.** No changes to `packages/core`, `packages/widget`, or any existing adapter. All behavior flows through the public `ColaborateStore` interface.
- **Minor additive fix to `packages/core/src/types.ts`** (commit `7bce0ea`): `isStoreNotFound` / `isStoreDuplicate` now fall back to checking `err.code` in addition to `instanceof`, making them robust against bundler module-duplication (where two separate copies of the same class can exist). Backward compatible — existing code paths unchanged.
- **Testing:** 50 new Vitest tests in `packages/mcp-server` + 2 new tests in `packages/core` (store-errors robustness). Each tool/resource/prompt has a unit test around its pure `handle` function; one integration test wires the real factory to `InMemoryTransport.createLinkedPair()` + an SDK `Client` and round-trips `list_sessions` + `colaborate://session/{id}` + `/triage-session` to prove the protocol wiring.
- **Deferred to later phases:** `attach_screenshot` tool (Phase 4), actual screenshot/sourcemap content in bundles (Phase 4), `externalIssueUrl` write-through (Phase 6), OAuth 2.1 + PKCE (Phase 7), live resource subscriptions (post-v0).

## Phase 3 commit trail

```
c1283b2  feat(mcp-server): HTTP transport helper with shared-API-key bearer auth
2160bd1  feat(mcp-server): stdio transport + end-to-end integration test
b182603  feat(mcp-server): /triage-session prompt
4bfc388  feat(mcp-server): colaborate://session/{id} + colaborate://feedback/{id} resources
a4e6bc1  feat(mcp-server): search_feedback tool (substring + AND filters)
7bce0ea  feat(mcp-server): resolve_feedback tool flips status to resolved
e987aa0  feat(mcp-server): get_component_feedback tool groups by componentId
4209db4  feat(mcp-server): list_feedback tool
739acf4  feat(mcp-server): get_session tool returns full session bundle
74bad25  feat(mcp-server): list_sessions tool + shared seedStore fixture
c88e6b4  feat(mcp-server): createColaborateMcpServer factory + ServerContext
96e57be  chore(mcp-server): scaffold @colaborate/mcp-server package
```

## What Phase 2 shipped

Widget session drafting UX + 4 new HTTP routes + full submit flow, end-to-end.

- **New module** `packages/widget/src/session-state.ts` — `SessionState` class managing `currentSession` + `sessionModeEnabled` in memory and localStorage (keys scoped by `projectName` to isolate across co-hosted projects).
- **New module** `packages/widget/src/session-panel.ts` — `SessionPanel` glass popover (Shadow DOM) showing the active session's drafts + submit/cancel actions.
- **New module** `packages/widget/src/session-toggle.ts` — `SessionToggle` pill mounted in the annotator toolbar alongside the ShapePicker.
- **4 new HTTP routes** in `@colaborate/adapter-prisma`:
  - `POST   /api/colaborate/sessions` (create drafting)
  - `POST   /api/colaborate/sessions/:id/submit` (flip to `submitted` + promote drafts to `open` atomically via `$transaction`)
  - `GET    /api/colaborate/sessions?projectName=…&status=…`
  - `GET    /api/colaborate/sessions/:id`
  - Session POSTs require auth when `apiKey` is set; feedback POST remains public to preserve the anonymous widget path.
- **`SessionResponse`** wire type (dates as strings) alongside `SessionRecord` (Date).
- **`FeedbackPayload.status`** optional — widget sets `"draft"` in session mode; server defaults to `"open"` when omitted.
- **`StoreClient.sendFeedback`** forwards `sessionId` / `componentId` / `mentions` (Phase 1b prereq closed).
- **4 session HTTP methods** on `WidgetClient` (`ApiClient` via HTTP, `StoreClient` via direct store).
- **FAB gains a 4th radial item** (`session`) that toggles the session panel.
- **i18n**: 8 new keys in en + fr (toggle labels, panel labels, submit/cancel, success toast).
- **`submitSession`** flips all `draft` feedbacks linked to the session to `"open"` — atomic in Prisma (`$transaction`), sequential in Memory/LocalStorage. Conformance suite pins the behavior.
- **E2E coverage**: full 3-draft submit flow + non-session regression × 3 browsers.

## Phase 2 commit trail

```
add775f  test(e2e): session-mode submit flow + non-session regression
e8c2325  test(e2e): server.mjs handles session routes + status passthrough
c5df13e  feat(widget): launcher wires SessionState + SessionPanel + submit flow
f6e2732  feat(widget): FAB gains a 4th 'session' radial item
7050e1a  feat(widget): SessionPanel — glass popover for drafts + submit
233c0f0  feat(widget): annotator hosts SessionToggle + propagates sessionMode
83651f1  feat(widget): SessionToggle pill for the annotator toolbar
fd5e5a9  feat(widget): i18n strings for session UX (en + fr)
d445076  feat(widget): SessionState — in-memory + localStorage session state
eb68640  feat(widget): StoreClient gains 4 session methods + Date→ISO serialization
6a6e0fb  feat(widget): ApiClient gains 4 session HTTP methods
d60a599  refactor(adapter-prisma): explicit isSessionRoute flag + 405 fallthrough
a188dbc  feat(adapter-prisma): HTTP routes for session CRUD (4 endpoints)
191b5c6  chore(core): biome-format Task 3 conformance tests
7a9b385  feat(adapter-prisma): Zod schemas for session create + list-query
d1a7e96  feat(adapter-prisma): submitSession flips drafts in a $transaction
1114636  feat(adapter-localstorage): submitSession flips draft feedbacks to "open"
e453992  feat(adapter-memory): submitSession flips draft feedbacks to "open"
25712ba  test(core): SessionResponse wire type + submitSession flips drafts
71002c5  feat(adapter-prisma): POST /api/colaborate accepts optional status override
f90d299  feat(widget): StoreClient forwards session + mentions fields (Phase 1b prereq)
```

## What Phase 1b shipped

Backend-only, purely additive — no widget changes. Unblocks session drafting in Phase 2.

- **New module** `packages/core/src/mentions.ts` — `Mention` type + `MENTION_KINDS` const + `serializeMentions` / `parseMentions` / `EMPTY_MENTIONS`. Mirrors Phase 1a's `geometry.ts` pattern.
- **New model** `ColaborateSession` — `id` / `projectName` / `reviewerName` / `reviewerEmail` / `status` (`drafting|submitted|triaged|archived`) / `submittedAt` / `triagedAt` / `notes` / timestamps + `@@index([projectName, status])`.
- **9 new fields on `ColaborateFeedback`** — `sessionId` (+ `SetNull` session relation), `componentId`, `sourceFile/Line/Column`, `mentions` (default `"[]"`), `externalProvider/IssueId/IssueUrl` + `@@index([sessionId])`.
- **Extended `FEEDBACK_STATUSES`** — from 2 (`open`, `resolved`) to 4 (`draft`, `open`, `triaged`, `resolved`). Superset; existing widget POSTs continue to validate unchanged.
- **4 new `ColaborateStore` methods** — `createSession`, `getSession`, `listSessions`, `submitSession`. Implemented in Memory, LocalStorage, and Prisma adapters. Memory + LocalStorage run against the extended conformance suite.
- **Zod validation extensions** — new `mentionSchema` + 3 optional wire-format fields (`sessionId`, `componentId`, `mentions[]`). Server-derived fields (`sourceFile/Line/Column`, `external*`) remain out of the wire format.
- **POST handler** — serializes `mentions` array to JSON string via `serializeMentions` before passing to the store.
- **No widget changes** — existing POSTs without new fields still validate (Zod `default` / `optional`); E2E count unchanged at 103 pass / 2 skipped.

## Phase 1b commit trail

```
cb22e63  test(cli): tighten mentions regex with \b word-boundary
1792e00  test(cli): prisma generator asserts Phase 1b model + fields
e720545  chore: clean up Phase 1b regressions before final verification
2b6f863  feat(adapter-prisma): sessions + extended feedback fields + mentions
8f4bce8  test(adapter-localstorage): cover sessionsKey isolation + reload round-trip
636a8ae  feat(adapter-localstorage): sessions + extended feedback fields
aca43e1  feat(adapter-memory): sessions + extended feedback fields
3011be1  test(core): mentions-default test actually omits the field
4d279ad  test(core): extend conformance suite with session + extended-field tests
65fd268  test: update fixtures for Phase 1b schema additions
4909c75  feat(core): extend schema with ColaborateSession + 9 new feedback fields
3aa3833  refactor(core): drop unused SessionUpdateInput; make mentions optional on create
6efae80  feat(core): add Session types + extended feedback fields
ede630a  feat(core): add Mention type + serialize/parse helpers
```

## What Phase 1c shipped

All 5 new drawing primitives alongside rectangle, end-to-end — drawing, persistence, re-rendering on load.

- **New module** `packages/widget/src/shortcuts.ts` — `SHAPE_SHORTCUTS` map + `getShapeFromKey(key)` for R / C / A / L / T / F keyboard switch.
- **New module** `packages/widget/src/shape-render.ts` — `renderShapeHighlight(geometry, anchorBounds, color)` returns an absolutely-positioned overlay per shape. Rectangle + textbox as `<div>` with border (matches pre-1c look); circle / arrow / line / freehand as SVG. Freehand smoothed via `perfect-freehand.getStroke`.
- **New module** `packages/widget/src/drawing-modes.ts` — `DrawingMode` interface + 6 mode classes (RectangleMode, TextboxMode, CircleMode, LineMode, ArrowMode, FreehandMode). Circle is midpoint-centered (standard drag-to-bounding-box UX). MIN_EXTENT = 10 px rejects accidental clicks; FREEHAND_MIN_POINTS = 2 rejects single-click strokes.
- **New module** `packages/widget/src/shape-picker.ts` — `ShapePicker` class renders a glass pill-row of 6 icon buttons (`data-shape` attribute for E2E targeting), fires `onChange` on click, `setActive` is silent (for keyboard-shortcut sync).
- **New icons** in `packages/widget/src/icons.ts` — `ICON_SHAPE_RECTANGLE / CIRCLE / ARROW / LINE / TEXTBOX / FREEHAND`.
- **New dep** `perfect-freehand ^1.2.2` — MIT, ~4 KB, bundled via tsup `noExternal` (consumers never install it directly).
- **Refactored** `packages/widget/src/annotator.ts` — thin orchestrator. Delegates drag to mode classes; mounts shape picker in glass toolbar between instruction + cancel; routes R/C/A/L/T/F through `getShapeFromKey`; two-pass anchor selection (1-px probe → drawn-shape bounds) with a `rebaseGeometry` helper that re-projects the geometry into the chosen anchor's local frame.
- **Refactored** `packages/widget/src/markers.ts` — `showHighlight` parses geometry and delegates to `renderShapeHighlight`. Malformed geometry falls back to an anchor-sized rectangle.
- **i18n** — 7 new keys (`picker.aria` + `shape.{rectangle,circle,arrow,line,textbox,freehand}`) in en + fr. `annotator.instruction` reworded to be shape-agnostic.
- **Textbox UX** — the annotation's text content is the feedback message (single input; no second prompt).
- **E2E coverage** — `e2e/widget.spec.ts` gained a `drawShapeAndSubmit` helper + 6 new tests across all 3 browsers (18 test runs) asserting the persisted `shape` + parsed geometry JSON for each new primitive.

## Phase 1c commit trail

```
f2f141e  docs(widget): clarify toRectData is for marker pin positioning, not highlights
47c4187  docs: status.md + todo.md updated for Phase 1c completion
ac27b1d  test(e2e): Playwright coverage for all 5 new shape drawing primitives
93f8624  feat(widget): annotator drives 6 shapes via drawing-modes + picker + shortcuts
41988d1  feat(widget): shape-picker — 6-button toolbar row for the annotator
90c03c8  feat(widget): i18n for shape picker aria + 6 shape labels (en/fr)
7b06715  feat(widget): drawing-modes — 6 per-shape drawing classes
d524bd1  refactor(widget): markers.ts delegates highlight rendering to shape-render
95ceac1  feat(widget): renderShapeHighlight — per-shape geometry → overlay element
75396be  feat(widget): bundle perfect-freehand + add 6 shape-picker SVG icons
ab5f6c1  feat(widget): add shape keyboard shortcut mapping
886800f  docs(plan): Phase 1c — widget shape UI implementation plan
```

## Known debt surfaced during Phase 1c

- **Freehand re-projection** — when the first-pass (1-px probe) anchor differs from the second-pass (drawn-bounds) anchor, the stored freehand `points` are relative to the first-pass anchor. For strokes confined to a single element this is invisible; for strokes spanning multiple elements the replay may be offset. Tagged `TODO(phase-1d-or-later)` in `annotator.ts`'s `rebaseGeometry` helper.
- **Popup-open drag race** — the annotator overlay stays active with `pointer-events: auto` during `await popup.show(...)`. A user can start a second drag while the popup is open; the first `finishDrawing` continuation then builds a payload from the first drag and `deactivate()`s, silently discarding the second. Pre-existing from the pre-1c code (not a regression introduced here). Low severity — users rarely click outside a popup they just summoned.

## Phase 1 + Phase 2 decomposition — all complete

| Plan | Scope | Status |
|---|---|---|
| **1a** | Geometry data layer (types, schema, validation, storage) | ✅ `ce24787` / `v0.1.0-phase-1a` |
| **1b** | New schema fields: `ColaborateSession`, `sessionId`, `componentId`, `sourceFile/Line/Column`, `mentions[]` | ✅ `cb22e63` / `v0.2.0-phase-1b` |
| **1c** | Widget UI: shape picker + 5 drawing modes + shortcuts + marker rendering for all shapes | ✅ `f2f141e` / `v0.1.1-phase-1c` |
| **2** | Widget session drafting UX + 4 session HTTP routes + submit flow | ✅ `v0.3.0-phase-2` |
| **3** | MCP server: 6 tools + 2 resources + 1 prompt + stdio + HTTP transports | ✅ `v0.4.0-phase-3` |

Phases 1, 2, and 3 are complete. Phase 4 (sourcemap uploader CLI + ingest endpoint + screenshot pipeline) is now the next milestone.

## Outstanding items (unchanged from the prior handoff)

- **GitHub repo creation** — nothing on GitHub yet. When ready: `gh repo create develotype/colaborate --public --source=. && git push -u origin main --tags`.
- **@colaborate npm scope** — not verified available. Alternatives: `@develotype/colaborate-*`.
- **`apps/demo` marketing copy** — rebranded but still pitches the SitePing value-prop; rewrite lands in Phase 7.
- **Upstream cherry-picks** — SitePing is moving; we pin, cherry-pick bug fixes only.

## How to pick this up

```bash
cd /Users/brian/dev/colaborate
git log --oneline          # ~63 commits
git tag --list             # v0.0.0-fork, v0.1.0-phase-1a, v0.1.1-phase-1c, v0.2.0-phase-1b, v0.3.0-phase-2, v0.4.0-phase-3
bun run test:run           # 993 passing
bun run test:e2e           # 109 passing, 2 skipped
```

Design docs:
- `docs/superpowers/specs/2026-04-18-colaborate-design.md` — full v0 spec
- `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md` — executed
- `docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md` — executed
- `docs/superpowers/plans/2026-04-20-phase-1c-widget-shape-ui.md` — executed
- `docs/superpowers/plans/2026-04-20-phase-1b-sessions-and-fields.md` — executed
- `docs/superpowers/plans/2026-04-20-phase-2-widget-session-ux.md` — executed
- `docs/superpowers/plans/2026-04-21-phase-3-mcp-server.md` — executed

---

*Phase 1 complete (1a + 1b + 1c all ✅), Phase 2 complete (session drafting UX + HTTP routes), and Phase 3 complete (MCP server @colaborate/mcp-server). Ready for Phase 4 — sourcemap uploader CLI + ingest endpoint + screenshot pipeline.*
