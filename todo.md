# TODO — Colaborate

## In Progress
_(nothing in-flight — Phase 4b shipped cleanly, tag `v0.5.1-phase-4b`)_

## Next Up

- [ ] **Phase 5** — Triage worker (Claude API) + GitHub adapter. On `session.submitted`, load the bundle via `ColaborateStore`, call Claude with prompt cache on the template, LLM outputs JSON array of issues, tracker adapter creates them.

## Phase 6+

- [ ] **Phase 6** — Linear adapter + config switch (`COLABORATE_TRACKER=github|linear`)
- [ ] **Phase 7** — Deploy to sop-hub, wire into parkland, internal dogfood
- [ ] **Phase 8** — README polish + public OSS release

## Phase 4b follow-ups (chips spawned during review)

- [ ] **Fix screenshot attach 500→400 for bad dataUrl** — introduce `StoreValidationError` in `@colaborate/core` (sibling to `StoreNotFoundError` / `StoreDuplicateError`), have Memory/LocalStorage/Prisma stores throw it from `decodePngDataUrl` paths, then in both `handleAttachScreenshot` (`packages/adapter-prisma/src/routes-screenshots.ts`) and the `attach_screenshot` MCP tool (`packages/mcp-server/src/tools/attach-screenshot.ts`), map `StoreValidationError` → 400 / `isError: true`, keep everything else → 500. Currently clients see 500 on inputs that pass the Zod regex but fail downstream base64 decode. Test gaps: 400-on-store-validation-throw, 500-on-unrelated-throw. Flagged by Task 7 + Task 14 reviewers.
- [ ] **Per-screenshot MCP resources with `blob` + `mimeType: "image/png"`** — Phase 4b emits URL-only screenshots in session bundles to keep context windows sane. If LLM vision workflows need the pixels, expose each screenshot as its own MCP resource URI (e.g. `colaborate://screenshot/{id}`) with `blob: base64`. Spec says "JSON + base64 screenshots" so the path is sanctioned, just deferred.
- [ ] **Env-configurable screenshot size cap** — currently hardcoded `14 * 1024 * 1024` bytes in both `screenshotAttachSchema` (HTTP) and `attach_screenshot`'s MCP tool input schema. Promote to a shared const in `@colaborate/core` and thread through `HandlerOptions.screenshotMaxBytes` + the MCP `ServerContext`.
- [ ] **Optional polish:** extract `decodePngDataUrl` to `@colaborate/core/src/screenshot-codec.ts` if a third async caller ever appears (today it's duplicated across adapter-memory + adapter-localstorage; Prisma uses a sync Node `Buffer.from` variant).
- [ ] **Optional polish:** `server.test.ts`'s "lists all N tools" assertion is too rigid — adding a new tool forces touching an unrelated test. Consider exporting `ALL_TOOL_NAMES` from `tools/index.ts` and asserting the sorted name list against that single source of truth.

## Backlog — decisions deferred until needed

- [ ] Create GitHub repo `develotype/colaborate` and push (needs user confirm on org/name)
- [ ] Verify `@colaborate` npm scope availability before first publish
- [ ] Rewrite `apps/demo` marketing copy around the MCP/Parkland angle (currently still SitePing-flavored pitch, just rebranded)
- [ ] Pick Anthropic model + triage prompt template for Phase 5
- [ ] GitHub App vs. PAT for the GitHub adapter
- [ ] Upstream SitePing cherry-pick policy — currently no automation; cherry-pick bug fixes manually as needed
- [ ] **Freehand re-projection across element boundaries** — tagged `TODO(phase-1d-or-later)` in `packages/widget/src/annotator.ts`'s `rebaseGeometry` helper. When a freehand stroke spans two elements, the first-pass (1-px probe) anchor may differ from the second-pass (drawn-bounds) anchor; stored `points` are then relative to the first-pass anchor. Low severity; invisible for single-element strokes.
- [ ] **Popup-open drag race in annotator** — while `popup.show(...)` is awaiting, the overlay retains `pointer-events: auto`. A click outside the popup card triggers a second `startDrawing`; the first `finishDrawing` continuation then emits the first drag and `deactivate()`s, silently discarding the second drag. Pre-existing from pre-Phase-1c. Fix: set `overlay.pointerEvents = "none"` before the popup await and restore on all exit paths.

## Backlog — decisions deferred until needed

- [ ] Create GitHub repo `develotype/colaborate` and push (needs user confirm on org/name)
- [ ] Verify `@colaborate` npm scope availability before first publish
- [ ] Rewrite `apps/demo` marketing copy around the MCP/Parkland angle (currently still SitePing-flavored pitch, just rebranded)
- [ ] Pick Anthropic model + triage prompt template for Phase 5
- [ ] GitHub App vs. PAT for the GitHub adapter
- [ ] Upstream SitePing cherry-pick policy — currently no automation; cherry-pick bug fixes manually as needed
- [ ] **Freehand re-projection across element boundaries** — tagged `TODO(phase-1d-or-later)` in `packages/widget/src/annotator.ts`'s `rebaseGeometry` helper. When a freehand stroke spans two elements, the first-pass (1-px probe) anchor may differ from the second-pass (drawn-bounds) anchor; stored `points` are then relative to the first-pass anchor. Low severity; invisible for single-element strokes.
- [ ] **Popup-open drag race in annotator** — while `popup.show(...)` is awaiting, the overlay retains `pointer-events: auto`. A click outside the popup card triggers a second `startDrawing`; the first `finishDrawing` continuation then emits the first drag and `deactivate()`s, silently discarding the second drag. Pre-existing from pre-Phase-1c. Fix: set `overlay.pointerEvents = "none"` before the popup await and restore on all exit paths.

## Completed This Session (2026-04-18 → 2026-04-23)

- [x] **Phase 4b** — Screenshot ingest pipeline end-to-end. `ColaborateStore` extended with `attachScreenshot` + `listScreenshots`; all 3 adapters implement. `FsScreenshotStore` FS-backed impl in adapter-prisma (mirrors Phase 4a's `FsSourcemapStore`; `readIndex` ENOENT-vs-rethrow + move-to-front on re-put + positive-allowlist path guard). Three new HTTP routes (attach/list/read-bytes) wired into `createColaborateHandler`. Widget opt-in `captureScreenshots` flag + `captureViewportScreenshot` via html2canvas (bundled via tsup `noExternal` + `splitting: false`). Widget `attachScreenshot` on ApiClient (Bearer-authed) + StoreClient (direct). Launcher captures + uploads in a detached async block after `sendFeedback` resolves. MCP `get_session` + session resource populate real `screenshots[]`. New `attach_screenshot` MCP tool. Version bumped to 0.5.0. Mid-phase fixes: Task 11-surfaced session-route Bearer gap, Task 12-surfaced ignoreElements selectors fix, Task 10-surfaced tsup code-splitting regression. 1108 unit + 109 E2E green, zero lint warnings. Final commit `4dba14c`, tag `v0.5.1-phase-4b`. Plan: `docs/superpowers/plans/2026-04-21-phase-4b-screenshots.md`.


- [x] **Phase 0** — Forked NeosiaNexus/SitePing @ `widget-v0.9.5` (SHA `1bfb1db`) into `/Users/brian/dev/colaborate`, fresh git, MIT + NOTICE attribution, full rebrand (`@siteping/* → @colaborate/*`, `SitePing → Colaborate` across types/element/CLI/paths/keys). Fixed Node 25's experimental webstorage shadowing jsdom. Commit `e656ff4`, tag `v0.0.0-fork`.
- [x] **Phase 1a** — Replaced fixed `xPct/yPct/wPct/hPct` with `Geometry` discriminated union (6 shapes) across every layer: new `packages/core/src/geometry.ts` module, schema, Zod validation with `discriminatedUnion`, `flattenAnnotation`, all 3 adapters, widget annotator + markers, 14 new round-trip tests, all existing fixtures updated. Commit `ce24787`, tag `v0.1.0-phase-1a`.
- [x] **Phase 1c** — Shipped all 5 new drawing primitives: shape picker in the glass toolbar, `R/C/A/L/T/F` keyboard shortcuts, `DrawingMode` interface + 6 mode classes in `drawing-modes.ts`, per-shape highlight rendering in `shape-render.ts`, `perfect-freehand` smoothing for freehand, i18n en/fr, `drawShapeAndSubmit` Playwright helper + 6 new per-shape E2E tests. 831 unit / 103 E2E green. Final commit `ac27b1d`, tag `v0.1.1-phase-1c`.
- [x] **Phase 1b** — Schema extensions: `ColaborateSession` model, 9 new fields on `ColaborateFeedback` (`sessionId`, `componentId`, `sourceFile/Line/Column`, `mentions`, `externalProvider/IssueId/IssueUrl`), extended `FEEDBACK_STATUSES` (4 values), 4 new store methods (`createSession`, `getSession`, `listSessions`, `submitSession`), Zod wire-format extensions, `mentions.ts` module. Memory + LocalStorage + Prisma adapters all updated. 885 unit / 103 E2E green. Final commit `cb22e63`, tag `v0.2.0-phase-1b`.
- [x] **Phase 2** — Widget session drafting UX + session HTTP routes. Reviewer toggles session mode, draws multiple annotations (each a draft feedback linked to a lazily-created session), opens the session panel, submits → all drafts flip to `open` atomically. 4 new HTTP routes in `@colaborate/adapter-prisma` (POST/GET sessions, POST /submit with `$transaction`). `SessionState` + `SessionPanel` + `SessionToggle` widget modules; FAB gains a 4th radial item. `StoreClient.sendFeedback` now forwards `sessionId`/`componentId`/`mentions` (Phase 1b prereq satisfied). 4 session HTTP methods on `WidgetClient` (ApiClient via HTTP, StoreClient direct). `SessionResponse` wire type + `FeedbackPayload.status` now optional. i18n 8 new keys en+fr. E2E: 3-draft submit flow × 3 browsers + non-session regression × 3 browsers. 943 unit / 109 E2E green. Final commit `b13b8bc`, tag `v0.3.0-phase-2`.
- [x] **Phase 3** — MCP server exposing feedback to Claude Code. New `@colaborate/mcp-server` package. 6 tools (list_sessions, get_session, list_feedback, get_component_feedback, resolve_feedback, search_feedback), 2 resources (colaborate://session/{id}, colaborate://feedback/{id}), 1 prompt (/triage-session). Stdio transport (bin/stdio.mjs for local Claude Code) + Streamable HTTP transport with Bearer-token auth (Fetch-API handler — drops into Next.js App Router). Integration test round-trips through InMemoryTransport + SDK Client. Screenshots + externalIssueUrl write-through deferred to Phase 4/6 with documented limitations on the tools. Tagged `v0.4.0-phase-3`.
- [x] **Phase 4a** — Sourcemap ingest + resolution backend + widget dev-mode source capture. New `SourcemapStore` sibling interface in `@colaborate/core` (4 methods). `FsSourcemapStore` FS-backed impl in `@colaborate/adapter-prisma`. `resolveSource` primitive over `@jridgewell/trace-mapping`. `hashSourcemapContent` SHA-256 helper. Two new HTTP routes: `POST /api/colaborate/sourcemaps` (gzip-decompressed + hash-verified ingest) + `POST /api/colaborate/resolve-source` (resolves bundled line:col → original file:line:col). Both API-key-authed, wired into `createColaborateHandler` with a new `sourcemapStorePath` option. New `colaborate upload-sourcemaps --project <name> --env <env> --dir <dir> --url <url>` CLI subcommand. Widget: new `readDebugSource(element)` walker reads React fiber `_debugSource` in dev mode; annotator emits it on `AnnotationComplete.source`; launcher spreads it into `FeedbackPayload.sourceFile/Line/Column`. `FeedbackPayload` gains 3 optional wire fields (backward compatible). Feedback POST handler threads the fields through to `store.createFeedback`. 1053 unit (+60) / 109 E2E green. Tagged `v0.5.0-phase-4a`.
- [x] Plan 4a: `docs/superpowers/plans/2026-04-21-phase-4a-sourcemap-uploader.md`
- [x] Spec: `docs/superpowers/specs/2026-04-18-colaborate-design.md`
- [x] Phase 0 plan: `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md`
- [x] Phase 1a plan: `docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md`
- [x] Phase 1c plan: `docs/superpowers/plans/2026-04-20-phase-1c-widget-shape-ui.md`
- [x] Phase 1b plan: `docs/superpowers/plans/2026-04-20-phase-1b-sessions-and-fields.md`
- [x] Phase 2 plan: `docs/superpowers/plans/2026-04-20-phase-2-widget-session-ux.md`
