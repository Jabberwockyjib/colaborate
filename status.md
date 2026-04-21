# Colaborate — session status (2026-04-21)

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

**Current main branch state — all green:**

- `bun run build` → 8/8 packages build (11/11 check tasks pass)
- `bun run test:run` → **993 / 993 unit tests pass** (was 943 for Phase 2; +50 from mcp-server tool/resource/prompt/transport/integration tests + 2 core store-errors robustness tests)
- `bun run test:e2e` → 109/109 Playwright pass, 2 skipped (touch — mobile-only; unchanged — Phase 3 has no browser surface)
- `bun run lint` → biome clean (201 files)

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
